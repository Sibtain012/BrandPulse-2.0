-- ============================================================
-- Migration: Update unique constraint to include dates
-- Purpose: Prevent duplicate pipeline runs for same keyword + date range
-- Date: January 6, 2026
-- Database: PostgreSQL
-- ============================================================

-- Drop the old constraint (user_id, keyword)
ALTER TABLE global_keywords 
DROP CONSTRAINT IF EXISTS uq_user_keyword;

-- Add new constraint (user_id, keyword, start_date, end_date)
-- This allows same keyword with different date ranges
ALTER TABLE global_keywords 
ADD CONSTRAINT uq_user_keyword_dates 
UNIQUE (user_id, keyword, start_date, end_date);

-- Verify the constraint was added
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'global_keywords'
::regclass
AND conname = 'uq_user_keyword_dates';
