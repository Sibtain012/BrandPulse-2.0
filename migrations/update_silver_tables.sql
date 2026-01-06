-- ============================================================
-- Migration: Update silver_reddit_posts to link with global_keywords
-- Purpose: Add global_keyword_id for tracking which keyword request this data belongs to
-- Date: January 2026
-- Database: PostgreSQL
-- ============================================================

-- Add global_keyword_id column to silver_reddit_posts
ALTER TABLE silver_reddit_posts 
ADD COLUMN
IF NOT EXISTS global_keyword_id INTEGER;

-- Add foreign key constraint (optional, for referential integrity)
ALTER TABLE silver_reddit_posts 
ADD CONSTRAINT
IF NOT EXISTS fk_silver_posts_global_keyword 
FOREIGN KEY
(global_keyword_id) REFERENCES global_keywords
(global_keyword_id) ON
DELETE CASCADE;

-- Create index for faster joins
CREATE INDEX
IF NOT EXISTS idx_silver_posts_global_keyword ON silver_reddit_posts
(global_keyword_id);

-- Add gold_processed column if missing
ALTER TABLE silver_reddit_posts 
ADD COLUMN
IF NOT EXISTS gold_processed BOOLEAN DEFAULT FALSE;

-- Add gold_processed to comments table too
ALTER TABLE silver_reddit_comments 
ADD COLUMN
IF NOT EXISTS gold_processed BOOLEAN DEFAULT FALSE;

-- Add gold_processed to comment summary
ALTER TABLE silver_reddit_comment_sentiment_summary 
ADD COLUMN
IF NOT EXISTS gold_processed BOOLEAN DEFAULT FALSE;

-- Add comments
COMMENT ON COLUMN silver_reddit_posts.global_keyword_id IS 'References the global_keywords.global_keyword_id (request ID)';
COMMENT ON COLUMN silver_reddit_posts.gold_processed IS 'Indicates if this row has been processed by Gold Layer';

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'silver_reddit_posts'
    AND column_name IN ('global_keyword_id', 'gold_processed')
ORDER BY ordinal_position;
