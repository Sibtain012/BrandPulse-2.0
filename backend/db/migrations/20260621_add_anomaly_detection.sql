-- Migration: Anomaly Detection (Z-Score Spike Detection)
-- Adds fact_anomaly_events table. ADDITIVE ONLY.
-- Does NOT modify fact_sentiment_events, analysis_history, or any dim_* table.
--
-- NOTE on schema adaptation:
--   The real BrandPulse DB is a Kimball star schema. fact_sentiment_events has
--   NO brand_id and NO sentiment_label column (sentiment lives in dim_sentiment,
--   date lives in dim_date). There is no dim_brand table. The anomaly unit of
--   analysis is therefore request_id (the analysis identity used everywhere else
--   in the app), not brand_id. platform_id keeps its FK to dim_platform.

CREATE TABLE IF NOT EXISTS public.fact_anomaly_events (
  anomaly_id        SERIAL PRIMARY KEY,
  request_id        INT NOT NULL,                 -- analysis identity (global_keyword_id / request_id)
  metric_name       VARCHAR(50) NOT NULL,         -- e.g. "Negative_volume", "total_volume"
  event_date        DATE NOT NULL,
  platform_id       INT NOT NULL,
  sentiment_label   VARCHAR(20),                  -- Positive / Negative / Neutral (nullable for total_volume)

  -- Observed values
  observed_count    INT NOT NULL,
  baseline_mean     FLOAT NOT NULL,
  baseline_std      FLOAT NOT NULL,
  z_score           FLOAT NOT NULL,

  -- Configuration
  threshold_z       FLOAT NOT NULL DEFAULT 2.0,
  exceeded_threshold BOOLEAN NOT NULL,

  -- Metadata
  detected_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (platform_id) REFERENCES public.dim_platform(platform_id),

  -- Upsert key. sentiment_label nullable -> COALESCE in a unique index instead of
  -- a plain UNIQUE constraint, because NULLs are never equal in a UNIQUE constraint.
  UNIQUE (request_id, event_date, metric_name, sentiment_label, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_request  ON public.fact_anomaly_events(request_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_date     ON public.fact_anomaly_events(event_date);
CREATE INDEX IF NOT EXISTS idx_anomaly_exceeded ON public.fact_anomaly_events(exceeded_threshold);
