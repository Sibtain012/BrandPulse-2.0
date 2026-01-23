import os
import requests
from datetime import datetime, timezone
from typing import Optional, Dict, List, Any
import hashlib

import psycopg2
from psycopg2.extras import RealDictCursor
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# ============================
# ENV
# ============================
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
POSTGRES_URI = os.getenv("POSTGRES_DSN")

RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
RAPIDAPI_HOST = os.getenv("RAPIDAPI_HOST")
TWITTER_ENDPOINT = os.getenv("TWITTER_ENDPOINT", "/search.php")  # Alexander Vikhorev's endpoint

# ============================
# DB CONNECTIONS
# ============================
mongo = MongoClient(MONGO_URI)
mdb = mongo["BrandPulse_1"]

bronze_col = mdb["bronze_raw_twitter_data"]
jobs_col = mdb["bronze_ingestion_jobs"]
errors_col = mdb["bronze_errors"]

pg = psycopg2.connect(POSTGRES_URI)
pg.autocommit = False

# ============================
# POSTGRES HELPERS
# ============================
def get_date_range(keyword_id: int) -> tuple:
    """Fetch start_date and end_date from global_keywords."""
    with pg.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT start_date, end_date
            FROM global_keywords
            WHERE global_keyword_id = %s
        """, (keyword_id,))
        result = cur.fetchone()
        if result:
            return result.get('start_date'), result.get('end_date')
        return None, None


def mark_keyword_processed(keyword_id: int):
    with pg.cursor() as cur:
        cur.execute("""
            UPDATE global_keywords
            SET bronze_processed = TRUE
            WHERE global_keyword_id = %s
        """, (keyword_id,))
    pg.commit()


def mark_keyword_status(keyword_id: int, status: str):
    with pg.cursor() as cur:
        cur.execute("""
            UPDATE global_keywords
            SET status = %s,
                last_run_at = NOW()
            WHERE global_keyword_id = %s
        """, (status, keyword_id))
    pg.commit()


# ============================
# TWITTER API HELPERS
# ============================
def build_query_params(keyword: str, start_date: Optional[str], end_date: Optional[str]) -> Dict[str, str]:
    """Build query parameters for Twitter API including date filters."""
    # Build query string with language filter
    query_string = f"{keyword} lang:en"
    
    # Add date filters to query string if provided
    if start_date:
        query_string += f" since:{start_date}"
    
    if end_date:
        query_string += f" until:{end_date}"
    
    params = {
        "query": query_string,
        "search_type": "Top"  # Alexander Vikhorev's API uses this parameter
    }
    
    return params


def fetch_tweets(keyword: str, start_date: Optional[str], end_date: Optional[str]) -> tuple:
    """
    Fetch tweets from RapidAPI (Alexander Vikhorev's Twitter API).
    Returns: (tweets_list, rate_limit_remaining, error_message)
    """
    if not RAPIDAPI_KEY or not RAPIDAPI_HOST:
        return [], 0, "Missing RapidAPI credentials (RAPIDAPI_KEY or RAPIDAPI_HOST)"
    
    url = f"https://{RAPIDAPI_HOST}/{TWITTER_ENDPOINT.lstrip('/')}"  # Ensure single slash
    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": RAPIDAPI_HOST
    }
    
    params = build_query_params(keyword, start_date, end_date)
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        
        # Extract rate limit info
        rate_limit_remaining = int(response.headers.get("X-RateLimit-Remaining", 0))
        
        # Check for rate limit exhaustion
        if response.status_code == 429:
            return [], rate_limit_remaining, "Rate limit exceeded"
        
        response.raise_for_status()
        
        data = response.json()
        
        # Extract tweets from response - Alexander Vikhorev's API structure
        # The response might be a list directly or nested in a key
        if isinstance(data, list):
            tweets = data
        elif isinstance(data, dict):
            # Try common keys
            tweets = data.get("timeline", []) or data.get("results", []) or data.get("data", []) or data.get("tweets", [])
        else:
            tweets = []
        
        return tweets, rate_limit_remaining, None
        
    except requests.exceptions.Timeout:
        return [], 0, "Request timeout"
    except requests.exceptions.RequestException as e:
        return [], 0, f"API request failed: {str(e)}"
    except Exception as e:
        return [], 0, f"Unexpected error: {str(e)}"


# ============================
# DATA PROCESSING
# ============================
def extract_tweet_data(tweet: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract and normalize tweet data from API response.
    Adjust field names based on Alexander Vikhorev's actual response structure.
    """
    try:
        # Core tweet data (adjust keys based on actual API response)
        tweet_data = {
            "tweet_id": tweet.get("id_str") or tweet.get("id") or tweet.get("tweet_id"),
            "text": tweet.get("full_text") or tweet.get("text"),
            "author": tweet.get("user", {}).get("screen_name") or tweet.get("author"),
            "author_id": tweet.get("user", {}).get("id_str") or tweet.get("author_id"),
            "created_at": tweet.get("created_at"),
            "retweet_count": tweet.get("retweet_count", 0),
            "favorite_count": tweet.get("favorite_count", 0) or tweet.get("like_count", 0),
            "reply_count": tweet.get("reply_count", 0),
            "quote_count": tweet.get("quote_count", 0),
            "lang": tweet.get("lang", "en"),
            "source": tweet.get("source", "unknown")
        }
        
        # Extract quotes if available (limited by API)
        quotes = []
        if "quoted_status" in tweet:
            quoted = tweet["quoted_status"]
            quotes.append({
                "text": quoted.get("full_text") or quoted.get("text"),
                "author_id": quoted.get("user", {}).get("id_str"),
                "author_username": quoted.get("user", {}).get("screen_name"),
                "engagement": {
                    "retweets": quoted.get("retweet_count", 0),
                    "likes": quoted.get("favorite_count", 0),
                    "replies": quoted.get("reply_count", 0)
                }
            })
        
        # Extract replies if available (usually limited)
        replies = []
        # Note: Most free APIs don't provide reply threads
        # This would need to be populated if the API supports it
        
        return {
            **tweet_data,
            "quotes": quotes,
            "replies": replies
        }
        
    except Exception as e:
        print(f"[BRONZE TWITTER] Error extracting tweet data: {e}")
        return None


# ============================
# INGESTION
# ============================
def ingest_keyword(keyword: str, request_id: int):
    """
    Main ingestion function for Twitter data.
    Fetches tweets for a keyword and stores in MongoDB.
    """
    keyword_id = int(request_id)
    
    # Get date range from global_keywords
    start_date, end_date = get_date_range(keyword_id)
    
    # Lock state
    mark_keyword_status(keyword_id, 'PROCESSING')
    
    job_id = jobs_col.insert_one({
        "platform": "twitter",
        "keyword": keyword,
        "global_keyword_id": keyword_id,
        "started_at": datetime.now(timezone.utc),
        "status": "running",
        "date_range": {
            "start_date": str(start_date) if start_date else None,
            "end_date": str(end_date) if end_date else None
        }
    }).inserted_id
    
    operations = []
    processed = 0
    inserted = 0  # Initialize to avoid undefined variable error
    skipped_non_english = 0
    skipped_duplicate = 0
    errors = 0
    rate_limit_remaining = 0
    
    print(f"[BRONZE TWITTER] Ingesting keyword: {keyword}")
    if start_date or end_date:
        print(f"[BRONZE TWITTER] Date range: {start_date} to {end_date}")
    
    try:
        # Fetch tweets from RapidAPI
        tweets, rate_limit_remaining, error_msg = fetch_tweets(keyword, start_date, end_date)
        
        if error_msg:
            raise Exception(error_msg)
        
        if rate_limit_remaining < 5:
            print(f"[BRONZE TWITTER] WARNING: Low rate limit remaining: {rate_limit_remaining}")
        
        for tweet in tweets:
            try:
                # Extract and normalize tweet data
                tweet_data = extract_tweet_data(tweet)
                if not tweet_data:
                    errors += 1
                    continue
                
                # Filter non-English tweets
                if tweet_data.get("lang") != "en":
                    skipped_non_english += 1
                    continue
                
                # Build MongoDB document
                base_doc = {
                    "platform": "twitter",
                    "keyword": keyword,
                    "fetched_at": datetime.now(timezone.utc),
                    "raw_tweet": tweet_data,
                    "meta": {
                        "external_id": tweet_data["tweet_id"],
                        "api_endpoint": "rapidapi.twitter",
                        "response_status": 200,
                        "rate_limit_remaining": rate_limit_remaining
                    }
                }
                
                # Upsert with deduplication
                operations.append(
                    UpdateOne(
                        {
                            "platform": "twitter",
                            "meta.external_id": tweet_data["tweet_id"],
                            "keyword": keyword
                        },
                        {
                            "$setOnInsert": base_doc,
                            "$set": {
                                "global_keyword_id": keyword_id,
                                "silver_processed": False
                            }
                        },
                        upsert=True
                    )
                )
                processed += 1
                
            except Exception as e:
                errors += 1
                errors_col.insert_one({
                    "platform": "twitter",
                    "keyword": keyword,
                    "external_id": tweet.get("id_str") or tweet.get("id"),
                    "error": str(e),
                    "error_type": "parsing_error",
                    "occurred_at": datetime.now(timezone.utc)
                })
        
        # Bulk write to MongoDB
        inserted = 0
        if operations:
            result = bronze_col.bulk_write(operations, ordered=False)
            inserted = result.upserted_count + result.modified_count
        
        # Update status
        if inserted > 0:
            mark_keyword_processed(keyword_id)
            mark_keyword_status(keyword_id, 'COMPLETED')
        else:
            mark_keyword_status(keyword_id, 'IDLE')
        
    except Exception as e:
        mark_keyword_status(keyword_id, 'FAILED')
        errors_col.insert_one({
            "platform": "twitter",
            "keyword": keyword,
            "error": f"CRITICAL PIPELINE FAILURE: {str(e)}",
            "error_type": "critical",
            "occurred_at": datetime.now(timezone.utc),
            "context": {
                "rate_limit_remaining": rate_limit_remaining
            }
        })
        print(f"[BRONZE TWITTER] Critical failure for {keyword}: {e}")
    
    # Update job log
    jobs_col.update_one(
        {"_id": job_id},
        {"$set": {
            "finished_at": datetime.now(timezone.utc),
            "status": "completed",
            "stats": {
                "processed": processed,
                "inserted": inserted,
                "skipped_non_english": skipped_non_english,
                "skipped_duplicate": skipped_duplicate,
                "errors": errors
            },
            "rate_limit_info": {
                "remaining_at_end": rate_limit_remaining
            }
        }}
    )
    print(f"[BRONZE TWITTER] Completed {keyword} | Inserted: {inserted}")


# ============================
# ENTRYPOINT
# ============================
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 2:
        keyword = sys.argv[1]
        request_id = int(sys.argv[2])
        ingest_keyword(keyword, request_id)
    else:
        print("Usage: python bronze_twitter_ingest.py <keyword> <request_id>")
        sys.exit(1)
