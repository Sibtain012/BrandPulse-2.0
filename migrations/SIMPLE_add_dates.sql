-- ============================================================
-- Migration: Add date filter columns to global_keywords table
-- Purpose: Store user-selected date ranges for Gold Layer filtering
-- Date: January 5, 2026
-- Database: PostgreSQL
-- ============================================================

-- Your table already has: user_id, status, last_run_at
-- We only need to add: start_date, end_date

-- Add start_date and end_date columns
ALTER TABLE global_keywords 
ADD COLUMN
IF NOT EXISTS start_date DATE,
ADD COLUMN
IF NOT EXISTS end_date DATE;

-- Add index for faster date filtering queries
CREATE INDEX
IF NOT EXISTS idx_global_keywords_dates 
ON global_keywords
(start_date, end_date);

-- Add comments for documentation
COMMENT ON COLUMN global_keywords.start_date IS 'User-selected start date for filtering sentiment data in Gold Layer';
COMMENT ON COLUMN global_keywords.end_date IS 'User-selected end date for filtering sentiment data in Gold Layer';

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'global_keywords'
    AND column_name IN ('start_date', 'end_date');
