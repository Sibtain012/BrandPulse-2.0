-- Fix sentiment_summary JSONB data in analysis_history
-- Issue: Sentiment labels are capitalized ("Positive", "Negative", "Neutral") not lowercase

UPDATE analysis_history ah
SET 
    sentiment_summary = (
        SELECT jsonb_build_object(
            'posts', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'positive'),
                'neutral', COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'neutral'),
                'negative', COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'negative')
            ),
            'comments', jsonb_build_object(
                'positive', COUNT(*) FILTER (WHERE LOWER(comment_sentiment_label) = 'positive'),
                'neutral', COUNT(*) FILTER (WHERE LOWER(comment_sentiment_label) = 'neutral'),
                'negative', COUNT(*) FILTER (WHERE LOWER(comment_sentiment_label) = 'negative')
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
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'positive' OR LOWER(comment_sentiment_label) = 'positive') as positive_count,
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'neutral' OR LOWER(comment_sentiment_label) = 'neutral') as neutral_count,
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'negative' OR LOWER(comment_sentiment_label) = 'negative') as negative_count
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
    sentiment_summary
FROM analysis_history
ORDER BY analysis_timestamp DESC
LIMIT 5;
