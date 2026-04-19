"""
BrandPulse Clean – Gold Twitter Aggregator
============================================
Aggregates Silver Twitter data into fact_sentiment_events.

Mirrors: pipeline/gold/reddit_aggregator.py

Key difference: platform_id = 2, content_type_id = 3 (tweet),
source table = silver_twitter_tweets.
"""

from database.postgres import get_pg_connection

INSERT_TWEET_SENTIMENT_SQL = """
INSERT INTO fact_sentiment_events (
    silver_content_id, model_id, platform_id, content_type_id,
    sentiment_id, date_id, time_id, sentiment_score, request_id
)
SELECT
    st.silver_tweet_id,
    1,   -- Model: BERTweet
    2,   -- Platform: Twitter
    3,   -- Content Type: Tweet
    ds.sentiment_id,
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    st.tweet_sentiment_score,
    %s
FROM silver_twitter_tweets st
JOIN global_keywords gk ON gk.global_keyword_id = st.global_keyword_id
JOIN dim_sentiment ds ON ds.sentiment_label = st.tweet_sentiment_label
LEFT JOIN dim_date dd ON dd.calendar_date = DATE(st.tweet_created_at)
LEFT JOIN dim_time dt ON dt.time_id = (
    EXTRACT(HOUR FROM st.tweet_created_at) * 100 +
    EXTRACT(MINUTE FROM st.tweet_created_at)
)
WHERE st.global_keyword_id = %s
AND st.gold_processed = FALSE
AND (gk.start_date IS NULL OR DATE(st.tweet_created_at) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(st.tweet_created_at) <= gk.end_date)
ON CONFLICT ON CONSTRAINT fact_sentiment_events_unique_content DO NOTHING;
"""


def run_twitter_gold(keyword, request_id):
    conn = get_pg_connection()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(INSERT_TWEET_SENTIMENT_SQL, (request_id, request_id))
            tweets_inserted = cur.rowcount
            print(f"[GOLD] Inserted {tweets_inserted} tweet sentiment rows.")

            cur.execute("""
                UPDATE silver_twitter_tweets
                SET gold_processed = TRUE
                WHERE global_keyword_id = %s AND gold_processed = FALSE
            """, (request_id,))
            print(f"[GOLD] Marked {cur.rowcount} silver tweets as gold_processed.")

        conn.commit()
        print(f"[GOLD] Transaction committed for twitter.")
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
