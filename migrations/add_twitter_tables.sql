-- =====================================================
-- Twitter Integration Migration
-- =====================================================
-- This migration adds Twitter support to the BrandPulse ETL pipeline
-- Run this after backing up your database

BEGIN;

-- =====================================================
-- 1. UPDATE DIMENSION TABLES
-- =====================================================

-- Add columns to dim_platform
ALTER TABLE dim_platform 
ADD COLUMN IF NOT EXISTS platform_description TEXT,
ADD COLUMN IF NOT EXISTS api_type TEXT;

-- Insert Twitter platform (if not exists)
INSERT INTO dim_platform (platform_id, platform_name, platform_description, api_type)
VALUES (2, 'twitter', 'Twitter/X social platform', 'rapidapi')
ON CONFLICT (platform_id) DO UPDATE
SET platform_description = EXCLUDED.platform_description,
    api_type = EXCLUDED.api_type;

-- Add sentiment_order to dim_sentiment
ALTER TABLE dim_sentiment
ADD COLUMN IF NOT EXISTS sentiment_order SMALLINT;

-- Update sentiment order values
UPDATE dim_sentiment SET sentiment_order = 1 WHERE sentiment_label = 'Positive';
UPDATE dim_sentiment SET sentiment_order = 2 WHERE sentiment_label = 'Neutral';
UPDATE dim_sentiment SET sentiment_order = 3 WHERE sentiment_label = 'Negative';

-- Add created_at to dim_model
ALTER TABLE dim_model
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- =====================================================
-- 2. UPDATE FACT TABLE
-- =====================================================

-- Rename event_id to fact_id (if not already renamed)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'fact_sentiment_events' 
        AND column_name = 'event_id'
    ) THEN
        ALTER TABLE fact_sentiment_events RENAME COLUMN event_id TO fact_id;
    END IF;
END $$;

-- Add created_at column to fact_sentiment_events
ALTER TABLE fact_sentiment_events
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Ensure engagement_score column exists
ALTER TABLE fact_sentiment_events
ADD COLUMN IF NOT EXISTS engagement_score INTEGER;

-- =====================================================
-- 3. CREATE SILVER_TWITTER_TWEETS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS silver_twitter_tweets (
    silver_tweet_id SERIAL PRIMARY KEY,
    original_bronze_id TEXT UNIQUE,           -- MongoDB _id reference
    keyword TEXT NOT NULL,
    global_keyword_id INTEGER NOT NULL,       -- FK to global_keywords
    
    -- Tweet Identifiers
    tweet_id TEXT NOT NULL,                   -- Twitter's tweet ID
    tweet_url TEXT,                           -- Full URL to the tweet
    
    -- Cleaned Content
    text_clean TEXT,                          -- Cleaned tweet text (URLs/mentions removed)
    
    -- Author Information
    author_hash TEXT,                         -- SHA256(author) for privacy
    author_id_hash TEXT,                      -- SHA256(author_id)
    
    -- Engagement Metrics
    retweet_count INTEGER DEFAULT 0,
    favorite_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    quote_count INTEGER DEFAULT 0,
    
    -- Sentiment Analysis (RoBERTa)
    tweet_sentiment_label TEXT,              -- "Positive", "Neutral", "Negative"
    tweet_sentiment_score REAL,              -- Confidence score (0.0 - 1.0)
    
    -- Metadata
    tweet_created_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    gold_processed BOOLEAN DEFAULT FALSE,    -- Has Gold layer processed this?
    
    -- Constraints
    CONSTRAINT fk_twitter_global_keyword 
        FOREIGN KEY (global_keyword_id) 
        REFERENCES global_keywords(global_keyword_id)
        ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_twitter_global_keyword ON silver_twitter_tweets(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_twitter_gold_processed ON silver_twitter_tweets(gold_processed);
CREATE INDEX IF NOT EXISTS idx_twitter_sentiment ON silver_twitter_tweets(tweet_sentiment_label);
CREATE INDEX IF NOT EXISTS idx_twitter_created_at ON silver_twitter_tweets(tweet_created_at);
CREATE INDEX IF NOT EXISTS idx_twitter_tweet_id ON silver_twitter_tweets(tweet_id);

-- =====================================================
-- 4. VERIFY CONTENT TYPE FOR TWEETS
-- =====================================================

-- Ensure 'tweet' content type exists (should already exist from dump)
INSERT INTO dim_content_type (content_type_id, content_type)
VALUES (3, 'tweet')
ON CONFLICT (content_type_id) DO NOTHING;

-- =====================================================
-- 5. CREATE HELPER FUNCTION FOR ENGAGEMENT SCORE
-- =====================================================

-- Function to calculate engagement score for Twitter
CREATE OR REPLACE FUNCTION calculate_twitter_engagement(
    retweets INTEGER,
    favorites INTEGER,
    replies INTEGER,
    quotes INTEGER
) RETURNS INTEGER AS $$
BEGIN
    RETURN COALESCE(retweets, 0) + 
           COALESCE(favorites, 0) + 
           COALESCE(replies, 0) + 
           COALESCE(quotes, 0);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these after migration to verify success

-- Check dim_platform
-- SELECT * FROM dim_platform WHERE platform_name = 'twitter';

-- Check dim_sentiment
-- SELECT * FROM dim_sentiment ORDER BY sentiment_order;

-- Check silver_twitter_tweets structure
-- \d silver_twitter_tweets

-- Check fact_sentiment_events columns
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'fact_sentiment_events' 
-- ORDER BY ordinal_position;
