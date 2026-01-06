-- Migration: Backfill existing analyses into analysis_history
-- Purpose: Populate history table with past completed analyses
-- Date: 2026-01-06
-- Run this AFTER create_analysis_history.sql

-- This script populates the analysis_history table with data from existing completed analyses

INSERT INTO analysis_history
    (
    user_id,
    keyword,
    start_date,
    end_date,
    total_posts,
    total_comments,
    sentiment_distribution,
    top_keywords,
    avg_sentiment_score,
    positive_percentage,
    neutral_percentage,
    negative_percentage,
    request_id,
    analysis_timestamp,
    created_at
    )
SELECT
    gk.user_id,
    gk.keyword,
    gk.start_date,
    gk.end_date,

    -- Count posts (with date filtering)
    (SELECT COUNT(*)
    FROM silver_reddit_posts sp
    WHERE sp.global_keyword_id = gk.global_keyword_id
        AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
        AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
    ) as total_posts,

    -- Count comments (with date filtering)
    (SELECT COUNT(*)
    FROM silver_reddit_comments sc
        JOIN silver_reddit_posts sp ON sc.silver_post_id = sp.silver_post_id
    WHERE sp.global_keyword_id = gk.global_keyword_id
        AND (gk.start_date IS NULL OR DATE(sc.comment_created_at_utc) >= gk.start_date)
        AND (gk.end_date IS NULL OR DATE(sc.comment_created_at_utc) <= gk.end_date)
    ) as total_comments,

    -- Sentiment distribution
    jsonb_build_object(
        'positive', (SELECT COUNT(*)
    FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
    WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'positive'),
        'neutral', (SELECT COUNT(*)
    FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
    WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'neutral'),
        'negative', (SELECT COUNT(*)
    FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
    WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'negative')
    ) as sentiment_distribution,

    -- Top keywords (empty array for backfill - can be populated later)
    '[]'
::jsonb as top_keywords,

-- Average sentiment score
(SELECT AVG(sentiment_score)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
as avg_sentiment_score,
    
    -- Sentiment percentages
    CASE 
        WHEN
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
> 0
        THEN
((SELECT COUNT(*)
FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'positive')
::DECIMAL 
              /
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
::DECIMAL * 100)
        ELSE 0
END as positive_percentage,
    
    CASE 
        WHEN
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
> 0
        THEN
((SELECT COUNT(*)
FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'neutral')
::DECIMAL 
              /
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
::DECIMAL * 100)
        ELSE 0
END as neutral_percentage,
    
    CASE 
        WHEN
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
> 0
        THEN
((SELECT COUNT(*)
FROM fact_sentiment_events fse JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
WHERE fse.request_id = gk.global_keyword_id AND ds.sentiment_label = 'negative')
::DECIMAL 
              /
(SELECT COUNT(*)
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
::DECIMAL * 100)
        ELSE 0
END as negative_percentage,
    
    gk.global_keyword_id as request_id,
    gk.last_run_at as analysis_timestamp,
    gk.last_run_at as created_at
    
FROM global_keywords gk
WHERE gk.status = 'COMPLETED'
  AND gk.bronze_processed = TRUE
  -- Only backfill if sentiment data exists
  AND EXISTS
(SELECT 1
FROM fact_sentiment_events
WHERE request_id = gk.global_keyword_id)
-- Don't duplicate existing entries
AND NOT EXISTS
(
      SELECT 1
FROM analysis_history ah
WHERE ah.user_id = gk.user_id
    AND ah.keyword = gk.keyword
    AND ah.start_date IS NOT DISTINCT FROM gk.start_date
    AND ah.end_date IS NOT DISTINCT FROM gk.end_date
  );

-- Show summary of backfilled data
SELECT
    COUNT(*) as total_backfilled,
    COUNT(DISTINCT user_id) as unique_users,
    MIN(analysis_timestamp) as oldest_analysis,
    MAX(analysis_timestamp) as newest_analysis
FROM analysis_history
WHERE created_at >= (SELECT MAX(created_at) - INTERVAL '1 minute'
FROM analysis_history);

-- Optional: Display the backfilled entries
-- SELECT 
--     history_id,
--     user_id,
--     keyword,
--     start_date,
--     end_date,
--     total_posts,
--     total_comments,
--     analysis_timestamp
-- FROM analysis_history
-- ORDER BY analysis_timestamp DESC;
