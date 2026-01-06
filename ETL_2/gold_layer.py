import os
import psycopg2
from psycopg2.extras import execute_batch
from dotenv import load_dotenv

# =====================================================
# ENV SETUP
# =====================================================
load_dotenv()

PG_DSN = os.getenv("POSTGRES_DSN")

if not PG_DSN:
    raise RuntimeError("POSTGRES_DSN is not set")

# =====================================================
# SQL STATEMENTS (SET-BASED)
# =====================================================

# INSERT POSTS into fact table (content_type_id = 1)
# Filters by dates from global_keywords if specified
INSERT_POST_SENTIMENT_SQL = """
INSERT INTO fact_sentiment_events (
    silver_content_id, model_id, platform_id, content_type_id,
    sentiment_id, date_id, time_id, sentiment_score, request_id
)
SELECT
    sp.silver_post_id, 
    1, -- Model: RoBERTa
    1, -- Platform: Reddit
    1, -- Content Type: Post
    ds.sentiment_id, 
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    sp.post_sentiment_score, 
    %s
FROM silver_reddit_posts sp
JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
JOIN dim_sentiment ds ON ds.sentiment_label = sp.post_sentiment_label
LEFT JOIN dim_date dd ON dd.calendar_date = DATE(sp.created_at_utc)
LEFT JOIN dim_time dt ON dt.time_id = (EXTRACT(HOUR FROM sp.created_at_utc) * 100 + EXTRACT(MINUTE FROM sp.created_at_utc))
WHERE sp.global_keyword_id = %s
AND sp.gold_processed = FALSE
AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
ON CONFLICT (silver_content_id, model_id) DO NOTHING;
"""

# INSERT COMMENTS into fact table (content_type_id = 2)
# Uses negative silver_comment_id to avoid collision with post IDs
# Filters by dates from global_keywords if specified
INSERT_COMMENT_SENTIMENT_SQL = """
INSERT INTO fact_sentiment_events (
    silver_content_id, model_id, platform_id, content_type_id,
    sentiment_id, date_id, time_id, sentiment_score, request_id
)
SELECT
    -sc.silver_comment_id,  -- Negative to distinguish from posts
    1, -- Model: RoBERTa
    1, -- Platform: Reddit
    2, -- Content Type: Comment
    ds.sentiment_id, 
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    sc.comment_sentiment_score, 
    %s
FROM silver_reddit_comments sc
JOIN silver_reddit_posts sp ON sc.silver_post_id = sp.silver_post_id
JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
JOIN dim_sentiment ds ON ds.sentiment_label = sc.comment_sentiment_label
LEFT JOIN dim_date dd ON dd.calendar_date = DATE(sc.comment_created_at_utc)
LEFT JOIN dim_time dt ON dt.time_id = (EXTRACT(HOUR FROM sc.comment_created_at_utc) * 100 + EXTRACT(MINUTE FROM sc.comment_created_at_utc))
WHERE sp.global_keyword_id = %s
AND sp.gold_processed = FALSE
AND (gk.start_date IS NULL OR DATE(sc.comment_created_at_utc) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(sc.comment_created_at_utc) <= gk.end_date)
ON CONFLICT (silver_content_id, model_id) DO NOTHING;
"""

# =====================================================
# MAIN ORCHESTRATOR
# =====================================================

def run_gold_etl(keyword, request_id):
    conn = psycopg2.connect(PG_DSN)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            # 1. Insert POSTS into fact table
            cur.execute(INSERT_POST_SENTIMENT_SQL, (request_id, request_id))
            posts_inserted = cur.rowcount
            print(f"[GOLD] Inserted {posts_inserted} post sentiment rows.")

            # 2. Insert COMMENTS into fact table
            cur.execute(INSERT_COMMENT_SENTIMENT_SQL, (request_id, request_id))
            comments_inserted = cur.rowcount
            print(f"[GOLD] Inserted {comments_inserted} comment sentiment rows.")

            # 3. Mark Silver posts as gold_processed
            cur.execute("""
                UPDATE silver_reddit_posts 
                SET gold_processed = TRUE 
                WHERE global_keyword_id = %s AND gold_processed = FALSE
            """, (request_id,))
            print(f"[GOLD] Marked {cur.rowcount} silver posts as gold_processed.")

            # 4. Mark comment summaries as gold_processed
            cur.execute("""
                UPDATE silver_reddit_comment_sentiment_summary css
                SET gold_processed = TRUE
                FROM silver_reddit_posts sp
                WHERE css.silver_post_id = sp.silver_post_id
                AND sp.global_keyword_id = %s
                AND css.gold_processed = FALSE
            """, (request_id,))
            print(f"[GOLD] Marked {cur.rowcount} comment summaries as gold_processed.")

        conn.commit()
        print(f"[GOLD] Transaction committed: {posts_inserted} posts + {comments_inserted} comments.")
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
# =====================================================
# ENTRY POINT
# =====================================================

if __name__ == "__main__":
    import sys
    # Only runs if you call this script manually: python gold_layer.py <keyword> <id>
    if len(sys.argv) > 2:
        run_gold_etl(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python gold_layer.py <keyword> <request_id>")