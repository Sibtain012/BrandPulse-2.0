-- ============================================================
-- Migration: Update fact_sentiment_events to track request_id
-- Purpose: Add request_id column to link fact records with user requests
-- Date: January 2026
-- Database: PostgreSQL
-- ============================================================

-- Add request_id column to fact_sentiment_events
ALTER TABLE fact_sentiment_events 
ADD COLUMN
IF NOT EXISTS request_id INTEGER;

-- Create index for faster filtering by request_id
CREATE INDEX
IF NOT EXISTS idx_fact_events_request_id ON fact_sentiment_events
(request_id);

-- Add foreign key constraint (optional)
ALTER TABLE fact_sentiment_events 
ADD CONSTRAINT
IF NOT EXISTS fk_fact_events_global_keyword 
FOREIGN KEY
(request_id) REFERENCES global_keywords
(global_keyword_id) ON
DELETE CASCADE;

-- Add comment
COMMENT ON COLUMN fact_sentiment_events.request_id IS 'References global_keywords.global_keyword_id (user request ID)';

-- Verify column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'fact_sentiment_events'
    AND column_name = 'request_id';
