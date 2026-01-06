import os
from datetime import datetime, timezone

import praw
import psycopg2
from psycopg2.extras import RealDictCursor
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv
from langdetect import detect, LangDetectException

# ============================
# ENV
# ============================
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
POSTGRES_URI = os.getenv("POSTGRES_DSN")

REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT")

# ============================
# DB CONNECTIONS
# ============================
mongo = MongoClient(MONGO_URI)
mdb = mongo["BrandPulse_1"]

bronze_col = mdb["bronze_raw_reddit_data"]
jobs_col = mdb["bronze_ingestion_jobs"]
errors_col = mdb["bronze_errors"]

pg = psycopg2.connect(POSTGRES_URI)
pg.autocommit = False

# ============================
# REDDIT CLIENT
# ============================
reddit = praw.Reddit(
    client_id=REDDIT_CLIENT_ID,
    client_secret=REDDIT_CLIENT_SECRET,
    user_agent=REDDIT_USER_AGENT
)

# ============================
# UTILS
# ============================
def mongo_safe(obj):
    if isinstance(obj, dict):
        return {
            k: mongo_safe(v)
            for k, v in obj.items()
            if isinstance(v, (str, int, float, bool, list, dict, type(None)))
        }
    elif isinstance(obj, list):
        return [mongo_safe(v) for v in obj]
    return None


def is_english(text: str) -> bool:
    if not text or len(text) < 20:
        return False
    try:
        return detect(text) == "en"
    except LangDetectException:
        return False


# ============================
# POSTGRES HELPERS
# ============================
def fetch_keywords():
    with pg.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT global_keyword_id, keyword
            FROM global_keywords
            WHERE bronze_processed = FALSE
        """)
        return cur.fetchall()


def mark_keyword_processed(keyword_id):
    with pg.cursor() as cur:
        cur.execute("""
            UPDATE global_keywords
            SET bronze_processed = TRUE
            WHERE global_keyword_id = %s
        """, (keyword_id,))
    pg.commit()

def mark_keyword_status(keyword_id, status):
    with pg.cursor() as cur:
        cur.execute("""
            UPDATE global_keywords
            SET status = %s,
                last_run_at = NOW()
            WHERE global_keyword_id = %s
        """, (status, keyword_id))
    pg.commit()


# ============================
# EXTRACTION
# ============================
def extract_submission(submission):
    # This forces PRAW to actually fetch the data
    post_data = {
        "title": submission.title,
        "selftext": submission.selftext,
        "author": str(submission.author),
        "score": submission.score,
        "created_utc": submission.created_utc,
        "url": submission.url
    }

    comments_data = []
    submission.comments.replace_more(limit=0)  # Get top comments only for speed
    # OPTIMIZED: Limit to top 10 comments per post to reduce processing time
    for comment in submission.comments.list()[:10]:
        comments_data.append({
            "body": comment.body,
            "author": str(comment.author),
            "score": comment.score,
            "created_utc": comment.created_utc
        })

    return post_data, comments_data


# ============================
# INGESTION
# ============================
def ingest_keyword(row_or_keyword, request_id=None):
    if isinstance(row_or_keyword, dict):
        keyword_id = int(row_or_keyword["global_keyword_id"])  # Ensure integer type
        keyword = row_or_keyword["keyword"]
    else:
        keyword = row_or_keyword
        keyword_id = int(request_id) if request_id else None  # Ensure integer type

    if not keyword_id:
        raise ValueError("No Request ID provided for ingestion.")

    search_limit = 5

    # 1. LOCK STATE: Tell MERN we are starting
    mark_keyword_status(keyword_id, 'PROCESSING')

    job_id = jobs_col.insert_one({
        "platform": "reddit",
        "keyword": keyword,
        "global_keyword_id": keyword_id,  # Track request ID for filtering
        "started_at": datetime.now(timezone.utc),
        "status": "running"
    }).inserted_id

    operations = []
    processed = 0
    skipped_non_english = 0
    skipped_nsfw = 0
    errors = 0

    print(f"[BRONZE] Ingesting keyword: {keyword}")

    try:
        # The main extraction loop - OPTIMIZED: Reduced limit from 50 to 15 for faster processing
        for submission in reddit.subreddit("all").search(
            query=f'"{keyword}" nsfw:no',  # OPTIMIZED: Exact phrase match with quotes
            sort="relevance",  # OPTIMIZED: Relevance instead of top for better matches
            limit=15,  # OPTIMIZED: Reduced from 50 to 15 for faster processing
            time_filter="month"  # OPTIMIZED: Month instead of day for more data availability
        ):
            try:
                if submission.over_18:
                    skipped_nsfw += 1
                    continue

                if not is_english(submission.title + " " + submission.selftext):
                    skipped_non_english += 1
                    continue

                post_raw, comments_raw = extract_submission(submission)

                # Base document for new inserts (without global_keyword_id and silver_processed)
                base_doc = {
                    "platform": "reddit",
                    "keyword": keyword,
                    "fetched_at": datetime.now(timezone.utc),
                    "raw_post": post_raw,
                    "raw_comments": comments_raw,
                    "meta": {
                        "external_id": submission.name,
                        "subreddit": submission.subreddit.display_name,
                        "api_endpoint": "reddit.search",
                        "response_status": 200
                    }
                }

                operations.append(
                    UpdateOne(
                        {
                            "platform": "reddit",
                            "meta.external_id": submission.name,
                            "keyword": keyword
                        },
                        {
                            "$setOnInsert": base_doc,
                            # CRITICAL FIX: Always update these fields to link doc to current request
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
                    "platform": "reddit",
                    "keyword": keyword,
                    "external_id": getattr(submission, "name", None),
                    "error": str(e),
                    "occurred_at": datetime.now(timezone.utc)
                })

        # Finalize the write
        inserted = 0
        if operations:
            result = bronze_col.bulk_write(operations, ordered=False)
            inserted = result.upserted_count + result.inserted_count

        # 2. SUCCESS STATE: Mark as processed and done
        if inserted > 0:
            mark_keyword_processed(keyword_id)
            mark_keyword_status(keyword_id, 'COMPLETED')
        else:
            # If search returned 0 results, we mark as IDLE so it can be retried
            mark_keyword_status(keyword_id, 'IDLE')

    except Exception as e:
        # 3. FAILURE STATE: Ensure the UI knows the pipe broke
        mark_keyword_status(keyword_id, 'FAILED')
        errors_col.insert_one({
            "platform": "reddit",
            "keyword": keyword,
            "error": f"CRITICAL PIPELINE FAILURE: {str(e)}",
            "occurred_at": datetime.now(timezone.utc)
        })
        print(f"[BRONZE] Critical failure for {keyword}: {e}")

    # Job logging remains the same
    jobs_col.update_one(
        {"_id": job_id},
        {"$set": {
            "finished_at": datetime.now(timezone.utc),
            "status": "completed",
            "stats": {
                "processed": processed,
                "inserted": inserted,
                "skipped_nsfw": skipped_nsfw,
                "skipped_non_english": skipped_non_english,
                "errors": errors
            }
        }}
    )
    print(f"[BRONZE] Completed {keyword} | Inserted: {inserted}")

# ============================
# ENTRYPOINT
# ============================
def run_bronze():
    keywords = fetch_keywords()

    if not keywords:
        print("[BRONZE] No new keywords to ingest.")
        return

    for row in keywords:
        ingest_keyword(row)

    print("[BRONZE] Run complete.")


if __name__ == "__main__":
    run_bronze()
