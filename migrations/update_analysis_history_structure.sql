-- Migration: Update analysis_history table structure
-- Purpose: Remove empty percentage columns and add proper sentiment data columns
-- Date: 2026-01-06
-- Reason: Silver tables store dominant sentiment labels, not detailed percentages

-- Step 1: Drop the unused percentage columns
ALTER TABLE analysis_history 
    DROP COLUMN IF EXISTS positive_percentage,
    DROP COLUMN IF EXISTS neutral_percentage,
    DROP COLUMN IF EXISTS negative_percentage;

-- Step 2: Add new columns for actual sentiment data from silver tables
ALTER TABLE analysis_history
    ADD COLUMN IF NOT EXISTS dominant_sentiment VARCHAR(20),
    ADD COLUMN IF NOT EXISTS avg_post_sentiment_score DECIMAL(5, 4),
    ADD COLUMN IF NOT EXISTS avg_comment_sentiment_score DECIMAL(5, 4),
    ADD COLUMN IF NOT EXISTS sentiment_summary JSONB;

-- Step 3: Add comments
COMMENT ON COLUMN analysis_history.dominant_sentiment IS 'Most common sentiment label (positive/neutral/negative) across all content';
COMMENT ON COLUMN analysis_history.avg_post_sentiment_score IS 'Average sentiment score from posts (from silver_reddit_posts)';
COMMENT ON COLUMN analysis_history.avg_comment_sentiment_score IS 'Average sentiment score from comments (from silver_reddit_comments)';
COMMENT ON COLUMN analysis_history.sentiment_summary IS 'Summary of sentiment distribution from silver tables';

-- Step 4: Update existing records with correct data from silver tables
UPDATE analysis_history ah
SET 
    avg_post_sentiment_score = (
        SELECT AVG(post_sentiment_score)
        FROM silver_reddit_posts sp
        JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
        WHERE sp.global_keyword_id = ah.request_id
        AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
        AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
    ),
    avg_comment_sentiment_score = (
        SELECT AVG(comment_sentiment_score)
        FROM silver_reddit_comments sc
        JOIN silver_reddit_posts sp ON sc.silver_post_id = sp.silver_post_id
        JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
        WHERE sp.global_keyword_id = ah.request_id
        AND (gk.start_date IS NULL OR DATE(sc.comment_created_at_utc) >= gk.start_date)
        AND (gk.end_date IS NULL OR DATE(sc.comment_created_at_utc) <= gk.end_date)
    ),
    sentiment_summary = (
        SELECT jsonb_build_object(
            'posts', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE post_sentiment_label = 'positive'),
                'neutral', COUNT(*) FILTER (WHERE post_sentiment_label = 'neutral'),
                'negative', COUNT(*) FILTER (WHERE post_sentiment_label = 'negative')
            ),
            'comments', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE comment_sentiment_label = 'positive'),
                'neutral', COUNT(*) FILTER (WHERE comment_sentiment_label = 'neutral'),
                'negative', COUNT(*) FILTER (WHERE comment_sentiment_label = 'negative')
            )
        )
        FROM silver_reddit_posts sp
        LEFT JOIN silver_reddit_comments sc ON sc.silver_post_id = sp.silver_post_id
        JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
        WHERE sp.global_keyword_id = ah.request_id
        AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
        AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
    ),
    dominant_sentiment = (
        SELECT CASE 
            WHEN positive_count >= neutral_count AND positive_count >= negative_count THEN 'positive'
            WHEN negative_count >= neutral_count AND negative_count >= positive_count THEN 'negative'
            ELSE 'neutral'
        END
        FROM (
            SELECT 
                COUNT(*) FILTER (WHERE post_sentiment_label = 'positive' OR comment_sentiment_label = 'positive') as positive_count,
                COUNT(*) FILTER (WHERE post_sentiment_label = 'neutral' OR comment_sentiment_label = 'neutral') as neutral_count,
                COUNT(*) FILTER (WHERE post_sentiment_label = 'negative' OR comment_sentiment_label = 'negative') as negative_count
            FROM silver_reddit_posts sp
            LEFT JOIN silver_reddit_comments sc ON sc.silver_post_id = sp.silver_post_id
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            WHERE sp.global_keyword_id = ah.request_id
            AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
        ) counts
    );

-- Verify the update
SELECT 
    history_id,
    keyword,
    total_posts,
    total_comments,
    dominant_sentiment,
    avg_post_sentiment_score,
    avg_comment_sentiment_score,
    sentiment_summary
FROM analysis_history
ORDER BY analysis_timestamp DESC
LIMIT 5;
