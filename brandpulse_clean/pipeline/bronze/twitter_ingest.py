"""
BrandPulse Clean – Bronze Twitter Ingestion
============================================
Ingests tweets for a given keyword into MongoDB
(bronze_raw_twitter_data) via RapidAPI.

Mirrors: pipeline/bronze/reddit_ingest.py

Same patterns used:
- Lazy API client via _get_headers()
- Same Postgres status signalling (mark_keyword_status)
- Same Mongo job + error tracking
- Same upsert pattern via bulk_write / UpdateOne
- Same privacy rule: only whitelisted fields are stored.
  The raw API response object is NEVER persisted.
"""

import requests
from datetime import datetime, timezone

from pymongo import UpdateOne

from config.settings import RAPIDAPI_KEY
from database.mongo import get_mongo_collections, _get_client
from database.postgres import get_pg_connection
from models.enums import PipelineStatus
from utils.logging import get_logger

logger = get_logger("BRONZE-TWITTER")

# ---------------------------------------------------------------------------
# Lazy RapidAPI client
# ---------------------------------------------------------------------------
_RAPIDAPI_HOST = "twitter-api45.p.rapidapi.com"
_SEARCH_URL = f"https://{_RAPIDAPI_HOST}/search.php"

_headers = None

def _get_headers():
    global _headers
    if _headers is None:
        _headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": _RAPIDAPI_HOST,
        }
    return _headers


# ---------------------------------------------------------------------------
# Field whitelist — the ONLY fields stored from the API response.
# Author block, user metadata, profile info: never persisted.
# ---------------------------------------------------------------------------
ALLOWED_FIELDS = {
    "tweet_id", "text", "created_at", "lang",
    "favorite_count", "retweet_count", "reply_count", "quote_count",
}

def project_tweet(raw: dict) -> dict:
    """
    Extract only the whitelisted fields from a raw API tweet object.
    Everything else (author, user metadata, etc.) is dropped here,
    before the dict ever reaches MongoDB.
    """
    return {k: raw.get(k) for k in ALLOWED_FIELDS}


# ---------------------------------------------------------------------------
# Postgres helpers — identical to reddit_ingest.py versions
# ---------------------------------------------------------------------------
def mark_keyword_status(keyword_id, status):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute(
                "UPDATE global_keywords SET status = %s, last_run_at = NOW() WHERE global_keyword_id = %s",
                (status, keyword_id)
            )
        pg.commit()
    finally:
        pg.close()

def mark_keyword_processed(keyword_id):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute(
                "UPDATE global_keywords SET bronze_processed = TRUE WHERE global_keyword_id = %s",
                (keyword_id,)
            )
        pg.commit()
    finally:
        pg.close()


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
def ingest_keyword(row_or_keyword, request_id=None):
    if isinstance(row_or_keyword, dict):
        keyword_id = int(row_or_keyword["global_keyword_id"])
        keyword = row_or_keyword["keyword"]
    else:
        keyword = row_or_keyword
        keyword_id = int(request_id) if request_id else None

    if not keyword_id:
        raise ValueError("No Request ID provided for Twitter ingestion.")

    _, jobs_col, errors_col = get_mongo_collections()
    twitter_col = _get_client()["BrandPulse_1"]["bronze_raw_twitter_data"]

    mark_keyword_status(keyword_id, PipelineStatus.PROCESSING.value)

    job_id = jobs_col.insert_one({
        "platform": "twitter",
        "keyword": keyword,
        "global_keyword_id": keyword_id,
        "started_at": datetime.now(timezone.utc),
        "status": "running"
    }).inserted_id

    operations = []
    processed = 0
    skipped = 0
    errors = 0
    inserted = 0

    logger.info("Ingesting keyword: %s", keyword)

    try:
        cursor = None
        pages_fetched = 0
        MAX_PAGES = 3

        while pages_fetched < MAX_PAGES:
            params = {"query": keyword, "search_type": "Top"}
            if cursor:
                params["cursor"] = cursor

            response = requests.get(_SEARCH_URL, headers=_get_headers(), params=params, timeout=15)

            if response.status_code == 429:
                errors_col.insert_one({
                    "platform": "twitter", "keyword": keyword,
                    "error": "Rate limit hit (429). Aborting run.",
                    "occurred_at": datetime.now(timezone.utc)
                })
                logger.warning("Rate limit hit. Aborting Twitter ingest for: %s", keyword)
                break

            response.raise_for_status()
            data = response.json()

            tweets = data.get("timeline", [])
            if not tweets:
                break

            for raw_tweet in tweets:
                try:
                    # FILTER: English only
                    if raw_tweet.get("lang", "") != "en":
                        skipped += 1
                        continue

                    # FILTER: Pure retweets
                    text = raw_tweet.get("text", "")
                    if text.strip().startswith("RT @"):
                        skipped += 1
                        continue

                    # PRIVACY: project to whitelist only
                    tweet_doc = project_tweet(raw_tweet)
                    tweet_id = tweet_doc.get("tweet_id")
                    if not tweet_id:
                        skipped += 1
                        continue

                    base_doc = {
                        "platform": "twitter",
                        "keyword": keyword,
                        "fetched_at": datetime.now(timezone.utc),
                        "raw_tweet": tweet_doc,
                        "meta": {
                            "external_id": str(tweet_id),
                            "api_endpoint": "twitter.search",
                            "response_status": 200
                        }
                    }

                    operations.append(
                        UpdateOne(
                            {"platform": "twitter", "meta.external_id": str(tweet_id), "keyword": keyword},
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
                        "platform": "twitter", "keyword": keyword,
                        "error": str(e), "occurred_at": datetime.now(timezone.utc)
                    })

            cursor = data.get("next_cursor")
            pages_fetched += 1
            if not cursor:
                break

        if operations:
            result = twitter_col.bulk_write(operations, ordered=False)
            inserted = result.upserted_count + result.inserted_count

        if inserted > 0:
            mark_keyword_processed(keyword_id)
            mark_keyword_status(keyword_id, PipelineStatus.COMPLETED.value)
        else:
            mark_keyword_status(keyword_id, PipelineStatus.IDLE.value)

    except Exception as e:
        mark_keyword_status(keyword_id, PipelineStatus.FAILED.value)
        errors_col.insert_one({
            "platform": "twitter", "keyword": keyword,
            "error": f"CRITICAL PIPELINE FAILURE: {str(e)}",
            "occurred_at": datetime.now(timezone.utc)
        })
        logger.error("Critical failure for %s: %s", keyword, e)

    jobs_col.update_one(
        {"_id": job_id},
        {"$set": {
            "finished_at": datetime.now(timezone.utc),
            "status": "completed",
            "stats": {"processed": processed, "inserted": inserted, "skipped": skipped, "errors": errors}
        }}
    )
    logger.info("Completed %s | Inserted: %d", keyword, inserted)
