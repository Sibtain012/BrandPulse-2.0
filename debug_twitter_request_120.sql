-- Diagnostic queries for Request ID 120 Twitter data

-- 1. Check if tweets exist in silver layer
SELECT COUNT(*) as total_tweets
FROM silver_twitter_tweets
WHERE global_keyword_id = 120;

-- 2. Check tweet timestamps
SELECT 
    silver_tweet_id,
    LEFT(text_clean, 50) as tweet_text,
    tweet_sentiment_label,
    tweet_created_at,
    gold_processed
FROM silver_twitter_tweets
WHERE global_keyword_id = 120
LIMIT 5;

-- 3. Check global_keywords dates
SELECT 
    global_keyword_id,
    keyword,
    start_date,
    end_date,
    platform_id
FROM global_keywords
WHERE global_keyword_id = 120;

-- 4. Check if fact_sentiment_events has any data
SELECT COUNT(*) as fact_count
FROM fact_sentiment_events
WHERE request_id = 120;

-- 5. Check why Gold layer might have skipped (date filter issue)
SELECT 
    st.silver_tweet_id,
    st.tweet_created_at,
    gk.start_date,
    gk.end_date,
    DATE(st.tweet_created_at) as tweet_date,
    CASE 
        WHEN gk.start_date IS NULL OR DATE(st.tweet_created_at) >= gk.start_date THEN 'Pass start'
        ELSE 'Fail start'
    END as start_check,
    CASE 
        WHEN gk.end_date IS NULL OR DATE(st.tweet_created_at) <= gk.end_date THEN 'Pass end'
        ELSE 'Fail end'
    END as end_check
FROM silver_twitter_tweets st
JOIN global_keywords gk ON gk.global_keyword_id = st.global_keyword_id
WHERE st.global_keyword_id = 120
LIMIT 5;
