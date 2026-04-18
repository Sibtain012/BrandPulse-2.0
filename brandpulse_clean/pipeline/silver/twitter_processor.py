"""
BrandPulse Clean – Silver Twitter Processor
============================================
Cleans tweet text, runs BERTweet sentiment, writes to silver_twitter_tweets.

Mirrors: pipeline/silver/reddit_processor.py

Key differences from Reddit:
- Source collection: bronze_raw_twitter_data (not bronze_raw_reddit_data)
- Source field: raw_tweet (not raw_post / raw_comments)
- Text cleaner: clean_twitter_text (not clean_reddit_text)
- Eligibility check: is_eligible_tweet (not is_eligible_comment)
- Target table: silver_twitter_tweets (not silver_reddit_posts/comments)
- No nested comments structure — tweets are flat documents
- Sentiment model: same run_sentiment_batch() — zero change
"""

from datetime import datetime, timezone
from utils.logging import get_logger

logger = get_logger("SILVER-TWITTER")

from database.mongo import _get_client
from database.postgres import get_pg_connection
from utils.text_processing.twitter import clean_twitter_text, is_eligible_tweet
from pipeline.silver.sentiment import run_sentiment_batch


def run_silver_twitter(request_id, batch_size=50):
    pg_conn = get_pg_connection()
    cursor_pg = pg_conn.cursor()
    processed_mongo_ids = []

    twitter_col = _get_client()["BrandPulse_1"]["bronze_raw_twitter_data"]

    try:
        rid = int(request_id) if request_id else 0
        if not rid:
            logger.error("No Request ID provided. Aborting.")
            cursor_pg.close()
            pg_conn.close()
            return
    except (TypeError, ValueError):
        logger.error("Invalid Request ID: %s", request_id)
        cursor_pg.close()
        pg_conn.close()
        return

    query_filter = {
        "silver_processed": {"$ne": True},
        "global_keyword_id": rid
    }
    raw_docs = list(twitter_col.find(query_filter).limit(batch_size))

    if not raw_docs:
        logger.info("No new Twitter data to process for request %s.", rid)
        cursor_pg.close()
        pg_conn.close()
        return

    texts_to_score = []
    doc_mapping = []

    for raw_doc in raw_docs:
        try:
            tweet = raw_doc.get("raw_tweet", {})
            if not is_eligible_tweet(tweet):
                twitter_col.update_one(
                    {"_id": raw_doc["_id"]},
                    {"$set": {"silver_processed": True, "skipped_reason": "ineligible"}}
                )
                continue

            cleaned_text = clean_twitter_text(tweet.get("text", ""))
            texts_to_score.append(cleaned_text)
            doc_mapping.append({
                "raw_doc": raw_doc,
                "tweet": tweet,
                "cleaned_text": cleaned_text,
                "keyword": raw_doc.get("keyword"),
            })
        except Exception:
            continue

    if not texts_to_score:
        cursor_pg.close()
        pg_conn.close()
        return

    try:
        all_scores = run_sentiment_batch(texts_to_score)
    except Exception as e:
        logger.error("Inference crash: %s", e)
        cursor_pg.close()
        pg_conn.close()
        raise e

    try:
        for i, item in enumerate(doc_mapping):
            if i >= len(all_scores):
                break

            raw_doc = item["raw_doc"]
            tweet = item["tweet"]
            sentiment = all_scores[i]

            tweet_id = tweet.get("tweet_id") or raw_doc.get("meta", {}).get("external_id")

            created_at = None
            raw_ts = tweet.get("created_at")
            if raw_ts:
                try:
                    created_at = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                except ValueError:
                    created_at = datetime.now(timezone.utc)

            cursor_pg.execute(
                """
                INSERT INTO silver_twitter_tweets (
                    original_bronze_id, keyword, global_keyword_id,
                    tweet_id, text_clean, tweet_created_at,
                    favorite_count, retweet_count, reply_count, quote_count,
                    tweet_sentiment_label, tweet_sentiment_score, processed_at
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (original_bronze_id) DO UPDATE
                SET original_bronze_id = EXCLUDED.original_bronze_id
                RETURNING silver_tweet_id
                """,
                (
                    str(raw_doc["_id"]), item["keyword"], rid,
                    str(tweet_id), item["cleaned_text"], created_at,
                    tweet.get("favorite_count", 0),
                    tweet.get("retweet_count", 0),
                    tweet.get("reply_count", 0),
                    tweet.get("quote_count", 0),
                    sentiment["label"], sentiment["score"],
                    datetime.now(timezone.utc)
                )
            )

            res = cursor_pg.fetchone()
            if res:
                processed_mongo_ids.append(raw_doc["_id"])

        pg_conn.commit()

        if processed_mongo_ids:
            twitter_col.update_many(
                {"_id": {"$in": processed_mongo_ids}},
                {"$set": {"silver_processed": True}}
            )
            logger.info("Committed %d tweets to silver.", len(processed_mongo_ids))

    except Exception as e:
        pg_conn.rollback()
        logger.error("Persistence error: %s", e)
        raise e
    finally:
        cursor_pg.close()
        pg_conn.close()
