-- Migration: Add platform_id to analysis_history table
-- Purpose: Support platform tracking for Twitter integration
-- Date: 2026-01-17
-- Note: Other columns (dominant_sentiment, avg_post_sentiment_score, avg_comment_sentiment_score) already exist

-- Add platform_id column (defaults to 1 for existing Reddit data)
ALTER TABLE analysis_history 
ADD COLUMN IF NOT EXISTS platform_id INTEGER DEFAULT 1;

-- Add foreign key to dim_platform
ALTER TABLE analysis_history
ADD CONSTRAINT fk_analysis_platform 
FOREIGN KEY (platform_id) REFERENCES dim_platform(platform_id);

-- Update unique constraint to include platform_id
-- This allows same keyword+dates for different platforms
ALTER TABLE analysis_history
DROP CONSTRAINT IF EXISTS uq_history_user_keyword_dates;

ALTER TABLE analysis_history
ADD CONSTRAINT uq_history_user_keyword_dates_platform 
UNIQUE (user_id, keyword, start_date, end_date, platform_id);

-- Create index on platform_id for faster queries
CREATE INDEX IF NOT EXISTS idx_history_platform_id ON analysis_history(platform_id);

-- Add comment
COMMENT ON COLUMN analysis_history.platform_id IS 'Platform source: 1=Reddit, 2=Twitter';

-- Verify the change
SELECT 'Migration completed successfully!' AS status;
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'analysis_history' 
AND column_name = 'platform_id';
