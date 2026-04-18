-- BrandPulse PostgreSQL Schema (DDL)
-- Extracted and synthesized from live database and ETL pipeline expectations.

-- Custom Enums
DO $
$ 
BEGIN
    CREATE TYPE pipeline_status AS ENUM
    ('IDLE', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ---------------------------------------------------------
-- 1. Pipeline Control & Metadata Tables
-- ---------------------------------------------------------

CREATE TABLE
IF NOT EXISTS global_keywords
(
    global_keyword_id SERIAL PRIMARY KEY,
    keyword VARCHAR
(255) NOT NULL,
    status pipeline_status DEFAULT 'IDLE',
    last_run_at TIMESTAMP,
    user_id INT, -- Reference to auth_identities/users (MERN backend)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    -- Note: Data audit identified overlapping unique constraints on keyword queries.
);

-- ---------------------------------------------------------
-- 2. Silver Layer (Cleaned & Enriched Data)
-- ---------------------------------------------------------

CREATE TABLE
IF NOT EXISTS silver_reddit_posts
(
    original_bronze_id VARCHAR
(255) PRIMARY KEY,
    global_keyword_id INT REFERENCES global_keywords
(global_keyword_id),
    author_hash VARCHAR
(255),
    title TEXT,
    content TEXT,
    created_utc TIMESTAMP,
    score INT,
    num_comments INT,
    upvote_ratio FLOAT,
    url TEXT,
    is_video BOOLEAN,
    sentiment_label VARCHAR
(50),
    sentiment_score FLOAT,
    keyword VARCHAR
(255),
    pipeline_run_id VARCHAR
(255),
    platform VARCHAR
(50),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE
IF NOT EXISTS silver_reddit_comments
(
    comment_id VARCHAR
(255) PRIMARY KEY,
    link_id VARCHAR
(255), -- Reference to silver_reddit_posts(original_bronze_id)
    parent_id VARCHAR
(255),
    global_keyword_id INT REFERENCES global_keywords
(global_keyword_id),
    author_hash VARCHAR
(255),
    content TEXT,
    created_utc TIMESTAMP,
    score INT,
    is_submitter BOOLEAN,
    sentiment_label VARCHAR
(50),
    sentiment_score FLOAT,
    keyword VARCHAR
(255),
    pipeline_run_id VARCHAR
(255),
    platform VARCHAR
(50),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE
IF NOT EXISTS silver_reddit_comment_sentiment_summary
(
    post_id VARCHAR
(255) PRIMARY KEY, -- Reference to silver_reddit_posts
    positive_count INT DEFAULT 0,
    neutral_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    total_comments INT DEFAULT 0,
    avg_sentiment_score FLOAT,
    summary_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------
-- 3. Gold Layer (Dimensional Modeling / Star Schema)
-- ---------------------------------------------------------

-- Dimensions
CREATE TABLE
IF NOT EXISTS dim_sentiment
(
    sentiment_id INT PRIMARY KEY,
    sentiment_label VARCHAR
(50) NOT NULL
    -- 1 = Negative, 2 = Neutral, 3 = Positive
);

CREATE TABLE
IF NOT EXISTS dim_platform
(
    platform_id INT PRIMARY KEY,
    platform_name VARCHAR
(50) NOT NULL
    -- 1 = Reddit, 2 = Twitter
);

CREATE TABLE
IF NOT EXISTS dim_content_type
(
    content_type_id INT PRIMARY KEY,
    content_type VARCHAR
(50) NOT NULL
    -- 1 = Post, 2 = Comment, 3 = Tweet
);

CREATE TABLE
IF NOT EXISTS dim_date
(
    date_id INT PRIMARY KEY, -- e.g., 20260105
    date_actual DATE NOT NULL,
    year INT,
    month INT,
    day INT,
    week_of_year INT
);

CREATE TABLE
IF NOT EXISTS dim_time
(
    time_id INT PRIMARY KEY, -- (hour * 60) + minute (0-1439)
    hour INT,
    minute INT,
    time_str VARCHAR
(5)
);

CREATE TABLE
IF NOT EXISTS dim_geographic_location
(
    geographic_location_id INT PRIMARY KEY,
    country VARCHAR
(100),
    region VARCHAR
(100)
);

CREATE TABLE
IF NOT EXISTS dim_model
(
    model_id INT PRIMARY KEY,
    model_name VARCHAR
(255),
    model_version VARCHAR
(50)
);

-- Facts
CREATE TABLE
IF NOT EXISTS fact_sentiment_events
(
    fact_id SERIAL PRIMARY KEY,
    time_id INT REFERENCES dim_time
(time_id),
    date_id INT REFERENCES dim_date
(date_id),
    platform_id INT REFERENCES dim_platform
(platform_id),
    content_type_id INT REFERENCES dim_content_type
(content_type_id),
    sentiment_id INT REFERENCES dim_sentiment
(sentiment_id),
    geographic_location_id INT REFERENCES dim_geographic_location
(geographic_location_id),
    keyword_id INT REFERENCES global_keywords
(global_keyword_id),
    model_id INT REFERENCES dim_model
(model_id),
    silver_content_id VARCHAR
(255), -- References silver_reddit_posts/comments IDs
    sentiment_score FLOAT,
    confidence_score FLOAT,
    event_timestamp TIMESTAMP,
    CONSTRAINT fact_sentiment_events_unique_content UNIQUE
(silver_content_id, model_id, platform_id, content_type_id)
);
