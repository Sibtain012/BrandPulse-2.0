-- Migration: Keyword Co-occurrence (PMI) analysis
-- Adds fact_keyword_cooccurrence. ADDITIVE ONLY.
-- Stores, per analysis (request_id) + primary keyword, the tokens that
-- co-occur with it across silver post/comment/tweet text, plus PMI scores.
--
-- request_id maps to global_keywords.global_keyword_id (the analysis identity
-- used across the app). platform_id keeps its FK to dim_platform.

CREATE TABLE IF NOT EXISTS public.fact_keyword_cooccurrence (
  cooccurrence_id    SERIAL PRIMARY KEY,
  request_id         INT NOT NULL,
  platform_id        INT NOT NULL,
  primary_keyword    VARCHAR(255) NOT NULL,   -- the searched keyword (lowercased)
  cooccur_token      VARCHAR(255) NOT NULL,   -- token appearing alongside it

  cooccurrence_count INT NOT NULL,            -- docs containing BOTH (= docs_with_both)
  pmi_score          FLOAT NOT NULL,

  -- PMI inputs (kept for transparency / viva auditability)
  total_documents    INT NOT NULL,
  docs_with_primary  INT NOT NULL,
  docs_with_token    INT NOT NULL,
  docs_with_both     INT NOT NULL,

  computed_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (request_id)  REFERENCES public.global_keywords(global_keyword_id),
  FOREIGN KEY (platform_id) REFERENCES public.dim_platform(platform_id),

  UNIQUE (request_id, primary_keyword, cooccur_token)
);

CREATE INDEX IF NOT EXISTS idx_cooccur_request ON public.fact_keyword_cooccurrence(request_id);
CREATE INDEX IF NOT EXISTS idx_cooccur_pmi     ON public.fact_keyword_cooccurrence(pmi_score);
CREATE INDEX IF NOT EXISTS idx_cooccur_count   ON public.fact_keyword_cooccurrence(cooccurrence_count);
