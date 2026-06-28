-- Migration: Complaint Classification (analysis_mode = 'complaint')
-- ADDITIVE ONLY. Mirrors the intent feature's schema shape exactly.
-- Does NOT modify sentiment/intent tables.
--
-- Model: ibrahimtime/complaint-classifier-v2 (DistilBERT).
-- Real labels probed: 'complaint' / 'non-complaint' -> normalized to
-- canonical 'Complaint' / 'Non-Complaint' in pipeline/silver/complaint.py.

-- ===========================================================================
-- dim_complaint  (mirrors dim_intent)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.dim_complaint (
  complaint_id    integer PRIMARY KEY,
  complaint_label character varying(50) NOT NULL UNIQUE
);

INSERT INTO public.dim_complaint (complaint_id, complaint_label) VALUES
  (1, 'Complaint'),
  (2, 'Non-Complaint')
ON CONFLICT (complaint_id) DO NOTHING;

-- ===========================================================================
-- dim_model row for the complaint classifier (model_id = 3)
-- ===========================================================================
INSERT INTO public.dim_model (model_id, model_name, model_version) VALUES
  (3, 'complaint-classifier-v2', 'ibrahimtime/complaint-classifier-v2')
ON CONFLICT (model_id) DO NOTHING;

-- ===========================================================================
-- silver_reddit_posts_complaint  (mirrors silver_reddit_posts_intent)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.silver_reddit_posts_complaint (
  silver_post_id     SERIAL PRIMARY KEY,
  original_bronze_id text NOT NULL,
  platform           text NOT NULL,
  keyword            text,
  post_id            text NOT NULL,
  title_clean        text,
  body_clean         text,
  author_hash        text,
  subreddit_name     text,
  post_url           text,
  post_score         integer,
  complaint_label    character varying(50) NOT NULL,
  complaint_score    double precision NOT NULL,
  created_at_utc     timestamp with time zone NOT NULL,
  processed_at_utc   timestamp with time zone NOT NULL,
  gold_processed     boolean DEFAULT false,
  model_id           integer,
  global_keyword_id  integer,
  upvote_ratio       double precision,
  total_comments     integer,
  CONSTRAINT silver_reddit_posts_complaint_unique
    UNIQUE (original_bronze_id, global_keyword_id)
);

-- ===========================================================================
-- silver_twitter_tweets_complaint  (mirrors silver_twitter_tweets_intent)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.silver_twitter_tweets_complaint (
  silver_tweet_id    SERIAL PRIMARY KEY,
  original_bronze_id text,
  keyword            text NOT NULL,
  global_keyword_id  integer NOT NULL,
  tweet_id           text NOT NULL,
  tweet_url          text,
  text_clean         text,
  author_hash        text,
  author_id_hash     text,
  retweet_count      integer,
  favorite_count     integer,
  reply_count        integer,
  quote_count        integer,
  complaint_label    character varying(50) NOT NULL,
  complaint_score    real NOT NULL,
  tweet_created_at   timestamp with time zone,
  processed_at       timestamp with time zone,
  gold_processed     boolean DEFAULT false,
  CONSTRAINT silver_twitter_tweets_complaint_unique
    UNIQUE (tweet_id, global_keyword_id)
);

-- ===========================================================================
-- fact_complaint_events  (mirrors fact_intent_events)
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.fact_complaint_events (
  fact_id           BIGSERIAL PRIMARY KEY,
  silver_content_id bigint NOT NULL,
  model_id          integer NOT NULL,
  platform_id       integer NOT NULL,
  content_type_id   integer NOT NULL,
  complaint_id      integer NOT NULL,
  date_id           integer NOT NULL,
  time_id           integer NOT NULL,
  complaint_score   double precision,
  request_id        integer,
  inserted_at       timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fact_complaint_events_unique_content
    UNIQUE (silver_content_id, model_id, platform_id, content_type_id, request_id),
  FOREIGN KEY (platform_id)  REFERENCES public.dim_platform(platform_id),
  FOREIGN KEY (complaint_id) REFERENCES public.dim_complaint(complaint_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_complaint_request ON public.fact_complaint_events(request_id);
CREATE INDEX IF NOT EXISTS idx_silver_reddit_complaint_gk ON public.silver_reddit_posts_complaint(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_silver_twitter_complaint_gk ON public.silver_twitter_tweets_complaint(global_keyword_id);
