-- =====================================================
-- Rollback Twitter Integration Migration
-- =====================================================
-- Use this to revert the add_twitter_tables.sql migration
-- WARNING: This will delete all Twitter data

BEGIN;

-- Drop silver_twitter_tweets table
DROP TABLE IF EXISTS silver_twitter_tweets CASCADE;

-- Drop helper function
DROP FUNCTION IF EXISTS calculate_twitter_engagement(INTEGER, INTEGER, INTEGER, INTEGER);

-- Remove Twitter platform
DELETE FROM dim_platform WHERE platform_name = 'twitter';

-- Remove columns added to dimension tables
ALTER TABLE dim_platform DROP COLUMN IF EXISTS platform_description;
ALTER TABLE dim_platform DROP COLUMN IF EXISTS api_type;

ALTER TABLE dim_sentiment DROP COLUMN IF EXISTS sentiment_order;

ALTER TABLE dim_model DROP COLUMN IF EXISTS created_at;

-- Rename fact_id back to event_id (if needed)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fact_sentiment_events' 
        AND column_name = 'fact_id'
    ) THEN
        ALTER TABLE fact_sentiment_events RENAME COLUMN fact_id TO event_id;
    END IF;
END $$;

-- Remove columns from fact table
ALTER TABLE fact_sentiment_events DROP COLUMN IF EXISTS created_at;
ALTER TABLE fact_sentiment_events DROP COLUMN IF EXISTS engagement_score;

COMMIT;
