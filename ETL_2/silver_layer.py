import os
import re
import html
import hashlib
from datetime import datetime, timezone
from typing import List

from pymongo import MongoClient
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv
from transformers import pipeline
import torch
import traceback

# =====================================================
# ENV SETUP
# =====================================================
load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
POSTGRES_URI = os.getenv("POSTGRES_DSN")

mongo_client = MongoClient(MONGO_URI)
bronze_db = mongo_client["BrandPulse_1"]
bronze = bronze_db["bronze_raw_reddit_data"]

pg_conn = psycopg2.connect(POSTGRES_URI)
pg_conn.autocommit = False

# =====================================================
# MODEL SETUP
# =====================================================
MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment"

sentiment_pipeline = pipeline(
    "sentiment-analysis",
    model=MODEL_NAME,
    tokenizer=MODEL_NAME,
    truncation=True,
    max_length=512,
    device=0 if torch.cuda.is_available() else -1
)

LABEL_MAP = {
    "LABEL_0": "Negative",
    "LABEL_1": "Neutral",
    "LABEL_2": "Positive"
}

# =====================================================
# HELPERS
# =====================================================
WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_text(text: str) -> str:
    if not text: return ""
    text = html.unescape(text)
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)
    text = re.sub(r'http\S+|www\S+', '', text)
    text = re.sub(r'[\*#_\|>]', '', text)
    text = text.replace('""', '"')
    text = WHITESPACE_PATTERN.sub(" ", text)
    return text.strip()


def hash_author(author: str):
    if not author or author.lower() in ["[deleted]", "automoderator"]:
        return None
    return hashlib.sha256(author.encode()).hexdigest()


def is_eligible_comment(comment: dict) -> bool:
    body = comment.get("body", "")
    author = comment.get("author", "")
    if not body or author.lower() in ["[deleted]", "automoderator"]:
        return False
    return len(body.split()) >= 5


def run_sentiment_batch(texts: List[str]):
    if not texts: return []
    results = sentiment_pipeline(texts)
    return [{"label": LABEL_MAP.get(r["label"], "Neutral"), "score": round(float(r["score"]), 4)} for r in results]


def aggregate_sentiment(sentiments: List[dict]):
    if not sentiments: return ("Neutral", 0.0)
    strong_signals = [s for s in sentiments if s["score"] > 0.7]
    if not strong_signals: return ("Neutral", 0.5)
    pos_count = sum(1 for s in strong_signals if s["label"] == "Positive")
    neg_count = sum(1 for s in strong_signals if s["label"] == "Negative")
    if pos_count > neg_count:
        return ("Positive", round(pos_count / len(strong_signals), 4))
    elif neg_count > pos_count:
        return ("Negative", round(neg_count / len(strong_signals), 4))
    return ("Neutral", 0.0)


# =====================================================
# MAIN PROCESS
# =====================================================
def run_silver(request_id, batch_size=50):
    """
    Main Silver Layer process: Cleans data, runs RoBERTa sentiment,
    and persists to PostgreSQL with Transactional Integrity.
    OPTIMIZED: Increased batch_size from 32 to 50 for faster processing.
    """
    cursor_pg = pg_conn.cursor()
    processed_mongo_ids = []  # Track successful Postgres writes

    # 1. ROBUST REQUEST ID HANDLING
    try:
        # Force integer conversion to prevent 'NoneType' or string indexing errors
        rid = int(request_id) if request_id else None
        if rid is None:
            print("[SILVER] CRITICAL: No Request ID provided. Aborting.")
            return
    except (TypeError, ValueError):
        print(f"[SILVER] CRITICAL: Invalid Request ID format: {request_id}")
        return

    # 2. FETCH UNPROCESSED DOCUMENTS - OPTIMIZED: Filter by request_id
    query_filter = {
        "silver_processed": {"$ne": True},
        "global_keyword_id": rid  # Only process docs for THIS request
    }
    unprocessed_count = bronze.count_documents(query_filter)
    print(f"[DEBUG] Silver Query Filter: {query_filter}")
    print(f"[DEBUG] Total Unprocessed in Bronze for Request {rid}: {unprocessed_count}")

    # Use a small limit to prevent OOM (Out of Memory) crashes on 8GB RAM
    raw_docs = list(bronze.find(query_filter).limit(batch_size))

    if not raw_docs:
        print("[SILVER] No new data to process.")
        cursor_pg.close()
        return

    all_texts_to_score = []
    doc_mapping = []

    # 3. PREPARATION PHASE: EXTRACT AND CLEAN
    for raw_doc in raw_docs:
        try:
            post = raw_doc.get("raw_post", {})
            title = clean_text(post.get("title"))
            body = clean_text(post.get("selftext"))
            post_text = f"{title}. {body}".strip()

            # Ensure comments are valid dictionaries
            eligible_comments = [c for c in raw_doc.get("raw_comments", []) if is_eligible_comment(c)]

            # Filtering logic to save CPU time on noise
            if len(post_text.split()) < 5 and not eligible_comments:
                bronze.update_one(
                    {"_id": raw_doc["_id"]},
                    {"$set": {"silver_processed": True, "skipped_reason": "noise"}}
                )
                continue

            all_texts_to_score.append(post_text)
            all_texts_to_score.extend([clean_text(c["body"]) for c in eligible_comments])

            doc_mapping.append({
                "raw_doc": raw_doc,
                "post_text": post_text,
                "title_clean": title,
                "body_clean": body,
                "eligible_comments": eligible_comments,
                "comment_count": len(eligible_comments),
                "keyword": raw_doc.get("keyword")
            })
        except Exception as e:
            continue

    if not all_texts_to_score:
        cursor_pg.close()
        return

    # 4. INFERENCE PHASE: BATCH SENTIMENT
    try:
        all_scores = run_sentiment_batch(all_texts_to_score)
    except Exception as e:
        print(f"[SILVER] Inference Crash: {e}")
        cursor_pg.close()
        return

    # 5. PERSISTENCE PHASE: TRANSACTIONAL WRITE
    current_score_idx = 0
    total_comments_inserted = 0
    try:
        for item in doc_mapping:
            raw_doc = item["raw_doc"]
            post_id_val = raw_doc.get("raw_post", {}).get("name") or raw_doc.get("meta", {}).get("external_id")
            if not post_id_val:
                post_id_val = f"unknown_{raw_doc['_id']}"
            post = raw_doc.get("raw_post", {})

            # Safety check to prevent Index errors
            if current_score_idx >= len(all_scores):
                break

            post_sentiment = all_scores[current_score_idx]
            current_score_idx += 1

            comment_sentiments = all_scores[current_score_idx: current_score_idx + item["comment_count"]]
            current_score_idx += item["comment_count"]

            agg_label, agg_score = aggregate_sentiment(comment_sentiments)

            # Insert Post (Strict 17 Parameter Tuple)
            cursor_pg.execute(
                """
                INSERT INTO silver_reddit_posts (
                    original_bronze_id, platform, keyword, global_keyword_id,
                    post_id, title_clean, body_clean, author_hash,
                    subreddit_name, post_url, post_score, upvote_ratio, 
                    total_comments, post_sentiment_label, post_sentiment_score,
                    created_at_utc, processed_at_utc
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (original_bronze_id) DO NOTHING
                RETURNING silver_post_id
                """,
                (
                    str(raw_doc["_id"]), "reddit", item["keyword"], rid,
                    post_id_val,
                    item["title_clean"], item["body_clean"], hash_author(post.get("author")),
                    post.get("subreddit_name_prefixed"), post.get("url"), post.get("score", 0),
                    post.get("upvote_ratio", 0), post.get("num_comments", 0),
                    post_sentiment["label"], post_sentiment["score"],
                    datetime.fromtimestamp(post.get("created_utc", 0), tz=timezone.utc),
                    datetime.now(timezone.utc)
                )
            )

            res = cursor_pg.fetchone()
            if not res: continue
            silver_post_id = res[0]

            # ========== NEW: INSERT COMMENTS ==========
            for i, comment in enumerate(item["eligible_comments"]):
                if i >= len(comment_sentiments):
                    break
                    
                comment_sentiment = comment_sentiments[i]
                comment_id = comment.get("id") or f"{post_id_val}_comment_{i}"
                
                cursor_pg.execute(
                    """
                    INSERT INTO silver_reddit_comments (
                        silver_post_id, comment_id, comment_body_clean, author_hash,
                        comment_score, comment_created_at_utc,
                        comment_sentiment_label, comment_sentiment_score
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        silver_post_id,
                        comment_id,
                        clean_text(comment.get("body", "")),
                        hash_author(comment.get("author")),
                        comment.get("score", 0),
                        datetime.fromtimestamp(comment.get("created_utc", 0), tz=timezone.utc) if comment.get("created_utc") else None,
                        comment_sentiment["label"],
                        comment_sentiment["score"]
                    )
                )
                total_comments_inserted += 1

            # ========== NEW: INSERT COMMENT SENTIMENT SUMMARY ==========
            cursor_pg.execute(
                """
                INSERT INTO silver_reddit_comment_sentiment_summary (
                    silver_post_id, aggregated_label, aggregated_score
                )
                VALUES (%s, %s, %s)
                ON CONFLICT (silver_post_id) DO UPDATE SET
                    aggregated_label = EXCLUDED.aggregated_label,
                    aggregated_score = EXCLUDED.aggregated_score
                """,
                (silver_post_id, agg_label, agg_score)
            )

            # Success: Track ID for MongoDB update later
            processed_mongo_ids.append(raw_doc["_id"])

        # 6. ATOMIC COMMIT
        pg_conn.commit()

        # 7. MONGODB SYNC: Only marks processed if Postgres commit worked
        if processed_mongo_ids:
            bronze.update_many(
                {"_id": {"$in": processed_mongo_ids}},
                {"$set": {"silver_processed": True}}
            )
            print(f"[SILVER] Committed {len(processed_mongo_ids)} posts and {total_comments_inserted} comments.")

    except Exception as e:
        pg_conn.rollback()  # Undo Postgres writes on failure
        print(f"CRITICAL PERSISTENCE ERROR: {e}")
        raise e  # Re-raise for brandpulse_master

    finally:
        cursor_pg.close()
def log_error_to_pg(cursor, bronze_id, keyword, message, trace):
    try:
        cursor.execute("INSERT INTO silver_errors ...", (bronze_id, keyword, message, trace))
    except:
        pass


if __name__ == "__main__":
    import sys

    # Orchestrator passes [keyword, requestId]
    if len(sys.argv) > 2:
        run_silver(sys.argv[2])  # sys.argv[2] is the request_id
    else:
        print("Usage: python silver_layer.py <keyword> <request_id>")