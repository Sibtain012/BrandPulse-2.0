-- ============================================================
-- BrandPulse Intent Classification — Phase 1 Database Migration
-- Plan v2.0, Section 3.3 — Option B (separate intent tables)
-- All statements are idempotent (safe to re-run).
-- ============================================================

-- 3.3.1  Register the intent model in dim_model
INSERT INTO dim_model (model_id, model_name, model_version)
VALUES (2, 'bertweet-intent-classifier-v2', 'ibrahimtime/bertweet-intent-classifier-v2')
ON CONFLICT (model_id) DO NOTHING;

-- 3.3.2  Register intent classes in dim_intent
CREATE TABLE IF NOT EXISTS dim_intent (
    intent_id    INT PRIMARY KEY,
    intent_label VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO dim_intent (intent_id, intent_label) VALUES
    (1, 'Complaint'),
    (2, 'Inquiry'),
    (3, 'Praise')
ON CONFLICT (intent_id) DO NOTHING;

-- 3.3.3  Silver intent tables (mirroring LIVE schema, NOT plan sketch)
--
-- silver_reddit_posts live columns preserved verbatim:
--   original_bronze_id, platform, keyword, post_id, title_clean, body_clean,
--   author_hash, subreddit_name, post_url, post_score, created_at_utc,
--   processed_at_utc, gold_processed, model_id, global_keyword_id,
--   upvote_ratio, total_comments
-- Swapped: post_sentiment_label → intent_label, post_sentiment_score → intent_score

CREATE TABLE IF NOT EXISTS silver_reddit_posts_intent (
    silver_post_id      SERIAL PRIMARY KEY,
    original_bronze_id  TEXT NOT NULL,
    platform            TEXT NOT NULL,
    keyword             TEXT,
    post_id             TEXT NOT NULL,
    title_clean         TEXT,
    body_clean          TEXT,
    author_hash         TEXT,
    subreddit_name      TEXT,
    post_url            TEXT,
    post_score          INTEGER,
    intent_label        VARCHAR(50) NOT NULL,
    intent_score        DOUBLE PRECISION NOT NULL,
    created_at_utc      TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at_utc    TIMESTAMP WITH TIME ZONE NOT NULL,
    gold_processed      BOOLEAN DEFAULT FALSE,
    model_id            INTEGER,
    global_keyword_id   INTEGER,
    upvote_ratio        DOUBLE PRECISION,
    total_comments      INTEGER,
    UNIQUE (original_bronze_id, global_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_srpi_gk ON silver_reddit_posts_intent(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_srpi_gold ON silver_reddit_posts_intent(gold_processed) WHERE gold_processed = FALSE;

-- silver_twitter_tweets live columns preserved verbatim:
--   original_bronze_id, keyword, global_keyword_id, tweet_id, tweet_url,
--   text_clean, author_hash, author_id_hash, retweet_count, favorite_count,
--   reply_count, quote_count, tweet_created_at, processed_at, gold_processed
-- Swapped: tweet_sentiment_label → intent_label, tweet_sentiment_score → intent_score

CREATE TABLE IF NOT EXISTS silver_twitter_tweets_intent (
    silver_tweet_id     SERIAL PRIMARY KEY,
    original_bronze_id  TEXT,
    keyword             TEXT NOT NULL,
    global_keyword_id   INTEGER NOT NULL,
    tweet_id            TEXT NOT NULL,
    tweet_url           TEXT,
    text_clean          TEXT,
    author_hash         TEXT,
    author_id_hash      TEXT,
    retweet_count       INTEGER,
    favorite_count      INTEGER,
    reply_count         INTEGER,
    quote_count         INTEGER,
    intent_label        VARCHAR(50) NOT NULL,
    intent_score        REAL NOT NULL,
    tweet_created_at    TIMESTAMP WITH TIME ZONE,
    processed_at        TIMESTAMP WITH TIME ZONE,
    gold_processed      BOOLEAN DEFAULT FALSE,
    UNIQUE (tweet_id, global_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_stti_gk ON silver_twitter_tweets_intent(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_stti_gold ON silver_twitter_tweets_intent(gold_processed) WHERE gold_processed = FALSE;

-- 3.3.4  fact_intent_events (mirrors fact_sentiment_events shape)
CREATE TABLE IF NOT EXISTS fact_intent_events (
    fact_id             BIGSERIAL PRIMARY KEY,
    silver_content_id   BIGINT NOT NULL,
    model_id            INT NOT NULL REFERENCES dim_model(model_id),
    platform_id         INT NOT NULL REFERENCES dim_platform(platform_id),
    content_type_id     INT NOT NULL REFERENCES dim_content_type(content_type_id),
    intent_id           INT NOT NULL REFERENCES dim_intent(intent_id),
    date_id             INT NOT NULL REFERENCES dim_date(date_id),
    time_id             INT REFERENCES dim_time(time_id),
    intent_score        FLOAT NOT NULL,
    request_id          INT NOT NULL REFERENCES global_keywords(global_keyword_id),
    inserted_at         TIMESTAMP DEFAULT NOW(),
    CONSTRAINT fact_intent_events_unique_content
        UNIQUE (silver_content_id, model_id, platform_id, content_type_id)
);

CREATE INDEX IF NOT EXISTS idx_fie_request ON fact_intent_events(request_id);
CREATE INDEX IF NOT EXISTS idx_fie_date ON fact_intent_events(date_id);
CREATE INDEX IF NOT EXISTS idx_fie_platform ON fact_intent_events(platform_id);

-- 3.3.5  Extend analysis_history with mode + intent summary columns
ALTER TABLE analysis_history
    ADD COLUMN IF NOT EXISTS analysis_mode        VARCHAR(20) DEFAULT 'sentiment',
    ADD COLUMN IF NOT EXISTS dominant_intent      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS intent_distribution  JSONB;

-- 3.3.6  Update the uniqueness constraint on analysis_history
-- Live DB has TWO duplicate constraints; drop both before creating new one
ALTER TABLE analysis_history
    DROP CONSTRAINT IF EXISTS analysis_history_unique_per_platform;

ALTER TABLE analysis_history
    DROP CONSTRAINT IF EXISTS uq_history_user_keyword_dates_platform;

ALTER TABLE analysis_history
    ADD CONSTRAINT analysis_history_user_mode_unique
    UNIQUE (user_id, keyword, start_date, end_date, platform_id, analysis_mode);

-- 3.3.7  Add analysis_mode to global_keywords
ALTER TABLE global_keywords
    ADD COLUMN IF NOT EXISTS analysis_mode VARCHAR(20) DEFAULT 'sentiment';

-- 3.3.8  Update unique constraint on global_keywords to include analysis_mode
-- The old constraint blocks intent rows when a sentiment row exists for same user+keyword+platform
ALTER TABLE global_keywords
    DROP CONSTRAINT IF EXISTS uq_user_keyword_dates;

ALTER TABLE global_keywords
    DROP CONSTRAINT IF EXISTS global_keywords_user_id_keyword_platform_id_key;

ALTER TABLE global_keywords
    ADD CONSTRAINT uq_user_keyword_mode
    UNIQUE (user_id, keyword, platform_id, analysis_mode);
