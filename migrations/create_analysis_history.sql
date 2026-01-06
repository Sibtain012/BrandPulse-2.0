-- Migration: Create analysis_history table for storing user's past sentiment analyses
-- Purpose: Allow users to view their search history with complete results
-- Date: 2026-01-06
-- 
-- ARCHITECTURE: Constellation Schema
-- This table acts as a SUMMARY/AGGREGATE FACT table in the dimensional model:
-- 
--   user_profiles (dim_user)
--        │
--        └──> analysis_history (aggregate fact - THIS TABLE)
--                  │
--                  └──> global_keywords (dim_request)
--                            │
--                            └──> fact_sentiment_events (detail fact)
--
-- Relationships:
-- - analysis_history.user_id → user_profiles.user_id (dimensional link)
-- - analysis_history.request_id → global_keywords.global_keyword_id (conformed dimension)
-- - fact_sentiment_events.request_id → global_keywords.global_keyword_id (shared link)
-- 
-- This design allows:
-- 1. Fast user history queries (use analysis_history - pre-aggregated)
-- 2. Detailed drill-down (join to fact_sentiment_events when needed)
-- 3. User demographics (join to user_profiles for name, subscription tier)
-- 4. Chart results storage at correct granularity (one chart per analysis)

-- Create analysis_history table (Summary Fact Table in Constellation Schema)
-- Purpose: Store pre-aggregated analysis results for fast user history queries
-- Connects to: user_profiles (dim_user), global_keywords (dim_request), fact_sentiment_events (detail fact)
CREATE TABLE
IF NOT EXISTS analysis_history
(
    history_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    keyword VARCHAR
(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    
    -- Result summary (pre-aggregated from fact table)
    total_posts INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    
    -- Sentiment distribution (stored as JSONB for flexibility)
    sentiment_distribution JSONB,
    -- Example: {"positive": 45, "neutral": 30, "negative": 25}
    
    -- Top keywords (stored as array)
    top_keywords JSONB,
    -- Example: ["bitcoin", "crypto", "blockchain"]
    
    -- Sentiment scores
    avg_sentiment_score DECIMAL
(5, 4),
    positive_percentage DECIMAL
(5, 2),
    neutral_percentage DECIMAL
(5, 2),
    negative_percentage DECIMAL
(5, 2),
    
    -- Metadata and foreign keys
    request_id INTEGER NOT NULL,
    analysis_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key to global_keywords (connects to fact table through this)
    CONSTRAINT fk_analysis_request FOREIGN KEY
(request_id) 
        REFERENCES global_keywords
(global_keyword_id) ON
DELETE CASCADE,
    
    -- Foreign key to user_profiles (dimensional relationship)
    CONSTRAINT fk_analysis_user FOREIGN KEY
(user_id) 
        REFERENCES user_profiles
(user_id) ON
DELETE CASCADE,
    
    -- Prevent duplicate entries for same search
    CONSTRAINT uq_history_user_keyword_dates UNIQUE
(user_id, keyword, start_date, end_date)
);

-- Create indexes for performance
CREATE INDEX idx_history_user_id ON analysis_history(user_id);
CREATE INDEX idx_history_timestamp ON analysis_history(analysis_timestamp DESC);
CREATE INDEX idx_history_keyword ON analysis_history(keyword);
CREATE INDEX idx_history_request_id ON analysis_history(request_id);

-- Add comment
COMMENT ON TABLE analysis_history IS 'Stores complete analysis results for user history tracking';
COMMENT ON COLUMN analysis_history.sentiment_distribution IS 'JSONB object with sentiment counts';
COMMENT ON COLUMN analysis_history.top_keywords IS 'JSONB array of most frequent keywords';

-- Grant permissions (adjust as needed for your database user)
-- GRANT SELECT, INSERT ON analysis_history TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE analysis_history_history_id_seq TO your_app_user;
