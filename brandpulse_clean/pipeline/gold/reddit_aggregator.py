"""
BrandPulse Clean – Gold Reddit Aggregator
==========================================
Aggregates Silver Reddit data (posts + comments) into the Gold
fact_sentiment_events table.

Source: ETL_2/gold_layer.py (Reddit branch only, lines 141-169)

ARCHITECTURAL FIX:
    Module-level psycopg2.connect() replaced with get_pg_connection()
    called inside run_reddit_gold().

SQL STATEMENTS:
    INSERT_POST_SENTIMENT_SQL and INSERT_COMMENT_SENTIMENT_SQL are
    copied EXACTLY from the original — zero SQL changes. All
    hardcoded dimension IDs (model=1, platform=1, content_type=1|2),
    COALESCE fallbacks, and the ON CONFLICT constraint name are
    preserved verbatim.

"""

from database.postgres import get_pg_connection

# =====================================================
# SQL STATEMENTS (SET-BASED) — EXACT COPIES
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
ON CONFLICT ON CONSTRAINT fact_sentiment_events_unique_content DO NOTHING;
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
ON CONFLICT ON CONSTRAINT fact_sentiment_events_unique_content DO NOTHING;
"""


# =====================================================
# MAIN FUNCTION
# =====================================================

def run_reddit_gold(keyword, request_id):
    """
    Aggregate Silver Reddit data into Gold fact tables.
    
    Executes in a single transaction:
    1. Insert post sentiments into fact_sentiment_events
    2. Insert comment sentiments into fact_sentiment_events
    3. Mark silver_reddit_posts as gold_processed
    4. Mark silver_reddit_comment_sentiment_summary as gold_processed
    
    On any failure the entire transaction is rolled back.
    """
    conn = get_pg_connection()
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
        print(f"[GOLD] Transaction committed for reddit.")
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
