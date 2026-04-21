"""
BrandPulse Clean – Bronze Reddit Ingestion
============================================
Ingests Reddit posts and comments for given keywords into MongoDB
(bronze_raw_reddit_data) and tracks job state in PostgreSQL
(global_keywords).

Source: ETL_2/bronze_reddit_ingest.py

ARCHITECTURAL FIXES:
    1. All module-level DB connections removed.
       get_mongo_collections() and get_pg_connection() are called
       inside the functions that need them.
    2. PRAW Reddit client is lazy-initialised on first call via
       _get_reddit_client() to avoid credential loading on import.
    3. Hardcoded status strings replaced with PipelineStatus enum.

All logic, limits, and filter conditions are preserved exactly:
    - Reddit search limit: 15
    - Comment limit per post: 10
    - time_filter: "month"
    - NSFW, non-English, media, and relevance filters: unchanged
"""

from datetime import datetime, timezone

import praw
import psycopg2
from psycopg2.extras import RealDictCursor
from pymongo import UpdateOne
from langdetect import detect, LangDetectException

from config.settings import REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
from database.mongo import get_mongo_collections
from database.postgres import get_pg_connection
from models.enums import PipelineStatus


# ---------------------------------------------------------------------------
# Lazy Reddit client singleton
# ---------------------------------------------------------------------------
_reddit_client = None


def _get_reddit_client():
    """Return a shared praw.Reddit instance, created on first call."""
    global _reddit_client
    if _reddit_client is None:
        _reddit_client = praw.Reddit(
            client_id=REDDIT_CLIENT_ID,
            client_secret=REDDIT_CLIENT_SECRET,
            user_agent=REDDIT_USER_AGENT,
        )
    return _reddit_client


# ---------------------------------------------------------------------------
# UTILS
# ---------------------------------------------------------------------------
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


# ---------------------------------------------------------------------------
# POSTGRES HELPERS
# ---------------------------------------------------------------------------
def fetch_keywords():
    pg = get_pg_connection()
    try:
        with pg.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT global_keyword_id, keyword
                FROM global_keywords
                WHERE bronze_processed = FALSE
            """)
            return cur.fetchall()
    finally:
        pg.close()


def mark_keyword_processed(keyword_id):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute("""
                UPDATE global_keywords
                SET bronze_processed = TRUE
                WHERE global_keyword_id = %s
            """, (keyword_id,))
        pg.commit()
    finally:
        pg.close()


def mark_keyword_status(keyword_id, status):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute("""
                UPDATE global_keywords
                SET status = %s,
                    last_run_at = NOW()
                WHERE global_keyword_id = %s
            """, (status, keyword_id))
        pg.commit()
    finally:
        pg.close()


# ---------------------------------------------------------------------------
# EXTRACTION
# ---------------------------------------------------------------------------
def extract_submission(submission):
    # This forces PRAW to actually fetch the data
    post_data = {
        "title": submission.title,
        "selftext": submission.selftext,
        "author": str(submission.author),
        "score": submission.score,
        "created_utc": submission.created_utc,
        "url": submission.url,
        "permalink": getattr(submission, "permalink", None),
        "subreddit": submission.subreddit.display_name,
        "subreddit_name_prefixed": f"r/{submission.subreddit.display_name}",
        "upvote_ratio": getattr(submission, "upvote_ratio", None),
        "num_comments": getattr(submission, "num_comments", 0),
    }

    comments_data = []
    submission.comments.replace_more(limit=0)  # Get top comments only for speed
    for comment in submission.comments.list()[:10]:
        comments_data.append({
            "body": comment.body,
            "author": str(comment.author),
            "score": comment.score,
            "created_utc": comment.created_utc
        })

    return post_data, comments_data


# ---------------------------------------------------------------------------
# INGESTION
# ---------------------------------------------------------------------------
def ingest_keyword(row_or_keyword, request_id=None):
    if isinstance(row_or_keyword, dict):
        keyword_id = int(row_or_keyword["global_keyword_id"])  # Ensure integer type
        keyword = row_or_keyword["keyword"]
    else:
        keyword = row_or_keyword
        keyword_id = int(request_id) if request_id else None  # Ensure integer type

    if not keyword_id:
        raise ValueError("No Request ID provided for ingestion.")

    bronze_col, jobs_col, errors_col = get_mongo_collections()
    reddit = _get_reddit_client()

    # 1. LOCK STATE: Tell MERN we are starting
    mark_keyword_status(keyword_id, PipelineStatus.PROCESSING.value)

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
    inserted = 0

    print(f"[BRONZE] Ingesting keyword: {keyword}")

    try:
        #  Reduced limit from 50 to 15 for faster processing
        for submission in reddit.subreddit("all").search(
                query=f'"{keyword}" nsfw:no',  # Exact phrase match with quotes
                sort="relevance",  #  Relevance instead of top for better matches
                limit=15,
                time_filter="month"  # Month instead of day for more data availability
        ):
            try:
                # FILTER: Skip NSFW (Already in query, but double check)
                if submission.over_18:
                    skipped_nsfw += 1
                    continue

                # FILTER: Skip Non-English
                if not is_english(submission.title + " " + submission.selftext):
                    skipped_non_english += 1
                    continue

                # FILTER: Strict Media Check (No videos, images, or GIFs)
                # Check 1: is_video flag
                if getattr(submission, 'is_video', False):
                    continue

                # Check 2: URL file extensions
                url_lower = submission.url.lower() if submission.url else ""
                if url_lower.endswith(('.jpg', '.jpeg', '.png', '.gif', '.mp4', '.mov', '.webp')):
                    continue

                # Check 3: Post hint (often indicates embedded media)
                post_hint = getattr(submission, 'post_hint', '')
                if post_hint in ['image', 'hosted:video', 'rich:video']:
                    continue

                # FILTER: Strict Relevance Check
                # Reddit's search is fuzzy. We ensure the keyword is actually in the title or body.
                full_text = (submission.title + " " + submission.selftext).lower()
                if keyword.lower() not in full_text:
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
            mark_keyword_status(keyword_id, PipelineStatus.COMPLETED.value)
        else:
            # If search returned 0 results, we mark as IDLE so it can be retried
            mark_keyword_status(keyword_id, PipelineStatus.IDLE.value)

    except Exception as e:
        # 3. FAILURE STATE: Ensure the UI knows the pipe broke
        mark_keyword_status(keyword_id, PipelineStatus.FAILED.value)
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


# ---------------------------------------------------------------------------
# ENTRYPOINT
# ---------------------------------------------------------------------------
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
