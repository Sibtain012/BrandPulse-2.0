# BrandPulse — Intent Classification Feature Implementation Plan

**Author:** Senior Engineering Guide
**Audience:** Junior engineer implementing the feature
**Model:** `ibrahimtime/bertweet-intent-classifier-v2`
**Estimated effort:** 2–3 working days
**Version:** 2.0

---

### TL;DR for time-pressed readers

- You're building a second analysis mode (Intent) parallel to the existing mode (Sentiment).
- Option B design: **intent gets its own tables** (`silver_reddit_posts_intent`, `silver_twitter_tweets_intent`, `fact_intent_events`). Sentiment schema is frozen, untouched.
- Execution: Phases 1–9 in Section 13. Database migrations are idempotent. Each Python/Node/React phase is self-contained and testable. **Read Section 3 carefully** — it's the crux of the design.
- **Critical**: do NOT add intent columns to existing sentiment tables. The whole point is separation.

---

**Changelog from v1.0:**
- **Section 3 flipped to Option B** (separate intent tables) for hard separation of concerns between sentiment and intent data. No NULL columns leaking into the sentiment schema, no `model_id` multiplexing on the fact table.
- Sections 4, 5, 9, 10, 12 updated to reflect the new `fact_intent_events` and `silver_*_intent` tables.
- **Trend Analysis** already shipped (UC-2) — noted in prerequisites. Intent version of trends is deferred to v3.
- **Twitter Integration** already shipped — intent mode now covers Reddit posts AND Twitter tweets from day one (not Reddit-only).

---

## 0. Read this first

This document tells you exactly what to build, in what order, and why each decision was made. Read the whole thing once before touching any code. Then work through Section 13 (the execution order) step by step, verifying each step before moving to the next.

You are not inventing anything new here. You are **copying the sentiment analysis feature and swapping the model, labels, and colors**. That is the entire job. If at any point you find yourself writing something that doesn't have a sentiment equivalent, stop and ask why.

**Core principle:** Every change must be defensible in the FYP-II evaluation. If you can't explain why you did it in one sentence, don't do it.

---

## 1. What we are building

A second analysis mode for BrandPulse called **Intent Classification**. The user picks between two modes from the home page:

1. **Analyze Brand Sentiment** — already exists. Classifies posts/comments/tweets as Positive / Neutral / Negative.
2. **Intent Classification** — NEW. Classifies posts/comments/tweets as Complaint / Inquiry / Praise.

The two modes run separately. A user who wants both runs two analyses on the same keyword. We do **not** run both models in one pipeline pass. This is a deliberate scope decision — combining them is next-evaluation work.

### What the model does

The intent model answers "what does the user want?" instead of "how does the user feel?" Specifically:

- **Complaint** → user is dissatisfied, has an issue, reports a problem
- **Inquiry** → user is asking a question, seeking information
- **Praise** → user is expressing positive feedback about the brand

Model input: one string of cleaned social media text (≤ 128 tokens).
Model output: `{"label": "Complaint", "score": 0.9997}`.

### What the user sees

A new page `/intent-analysis` that is near-identical to the existing `/sentiment-analysis` page. Same form (keyword, date range, platform selector including **both Reddit and Twitter, which are already integrated**), same processing flow, same result tabs (Charts / Posts / Comments or Charts / Tweets), but with intent labels, intent colors, and one extra chart (bar chart for magnitude comparison).

History page (`/history`) shows both sentiment runs and intent runs, distinguishable by an `analysis_mode` badge on each history card.

**Out of scope for this version:** Intent-mode trend chart. The Trend Analysis feature (UC-2) is already live on the sentiment page and reads from `fact_sentiment_events`. An intent-equivalent trend chart reading from `fact_intent_events` is a one-afternoon follow-up and is documented as TD-NEW-05 at the bottom of this plan.

### Pre-existing features this plan depends on

Before starting, confirm these are live in the codebase — they were shipped in earlier sprints and are prerequisites:

- **Twitter platform pipeline** — `TwitterPipeline` in `pipeline/registry.py`, `silver_twitter_tweets` table, `silver/twitter_processor.py`, `gold/twitter_aggregator.py`. Intent mode reuses all of this.
- **Platform registry pattern** — `get_pipeline(platform)` in `registry.py`. Intent mode does not add a new platform; it adds a new mode orthogonal to platform.
- **Trend Analysis (sentiment)** — `GET /api/data/trends/:requestId` route in `routes/data.js` and `TrendChart.jsx` component. Intent trend is NOT in scope here; do not modify either of these.

---

## 2. Architectural principles (do not deviate)

These govern every decision below. When in doubt, re-read this section.

1. **Explain-first over clever.** Two near-identical pages are easier to defend than one abstracted page. Duplicate the sentiment components, do not parameterize them.
2. **Parallel, not replacement.** The sentiment pipeline must continue to work exactly as it does today. Intent is an additional code path, never a modification of the existing path.
3. **Single mode per run.** One pipeline execution produces one kind of classification. User picks mode, pipeline runs that mode, done.
4. **Backward compatibility.** All existing data in the database must remain queryable. All existing rows must continue to render correctly on the history page after the migration.
5. **Traceable by user_id.** Every new row in every new table must link back to a user. The path should be `user_id → global_keyword_id → intent results`, identical to how sentiment traces today.
6. **Reuse the platform registry, the mode flag is orthogonal.** Platform (Reddit / Twitter) and mode (sentiment / intent) are independent dimensions. The registry already handles platform; we add mode as a parallel concept without touching the registry.

---

## 3. Database design

### 3.1 The decision: separate intent tables (Option B)

The sentiment schema stays untouched. Intent gets its own parallel fact + silver tables. This is a deliberate choice for **separation of concerns** — the sentiment pipeline's data model is clean and defensible, and we refuse to pollute it with nullable columns that only one mode ever writes to.

**What this buys us:**
- `silver_reddit_posts` and `silver_twitter_tweets` stay exactly as they are. No new nullable columns. No migration on tables that already hold production data.
- `fact_sentiment_events` stays single-purpose — every row is a sentiment classification. Reading it never requires a `model_id` filter to avoid mixing in intent rows.
- The two data models evolve independently. If intent eventually grows its own columns (e.g., aspect extraction, urgency score), they live on the intent tables and don't bloat the sentiment schema.
- Easier to explain in the eval: "Sentiment and intent are different products built on the same pipeline skeleton. They don't share storage; they share architecture."

**What this costs us:**
- More tables to create (3 new silver tables, 1 new fact table, 1 new dim table).
- Two separate aggregator SQL paths (one per mode) instead of one parameterized path.
- `analysis_history` still gets a mode column so a single history feed can list both — but it points to different result endpoints depending on mode.

We accept the cost. Duplication at the table level is cheaper to defend than a multi-tenant fact table that silently mixes rows from two different models.

### 3.2 What stays untouched

The existing sentiment schema is **frozen** for this feature. Do NOT alter any of these:

- `silver_reddit_posts`, `silver_reddit_comments`, `silver_twitter_tweets` — no new columns.
- `silver_reddit_comment_sentiment_summary` — no change.
- `fact_sentiment_events` — no change. Still model_id = 1, still sentiment-only.
- `dim_sentiment` — no change.

If you catch yourself writing `ALTER TABLE silver_*`, stop. You are violating the core premise of this plan.

### 3.3 Required schema changes

Run these once, before touching any code. Each is idempotent (safe to re-run). All new object names carry the `_intent` suffix so they're instantly grep-able.

**3.3.1 Register the intent model in `dim_model`:**

```sql
INSERT INTO dim_model (model_id, model_name, model_version)
VALUES (2, 'bertweet-intent-classifier-v2', 'ibrahimtime/bertweet-intent-classifier-v2')
ON CONFLICT (model_id) DO NOTHING;
```

`dim_model` itself is shared. It's a model catalog, not a fact table — registering a second model here is the exact use case it was built for. Confirm `dim_model` actually has columns `model_id`, `model_name`, `model_version` (match your `database/schema.sql`).

**3.3.2 Register intent classes in a new `dim_intent` table:**

```sql
CREATE TABLE IF NOT EXISTS dim_intent (
    intent_id    INT PRIMARY KEY,
    intent_label VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO dim_intent (intent_id, intent_label) VALUES
    (1, 'Complaint'),
    (2, 'Inquiry'),
    (3, 'Praise')
ON CONFLICT (intent_id) DO NOTHING;
```

Separate from `dim_sentiment` on purpose. Do not reuse `dim_sentiment` rows for intent labels — the semantic meaning is different.

**3.3.3 Create parallel silver tables for intent:**

These mirror the shape of the sentiment silver tables but store intent classification only. Copy the structure field-for-field from your existing `silver_reddit_posts` / `silver_twitter_tweets` definitions, swapping the sentiment columns for intent columns. Below is the minimum viable shape — if your existing silver tables carry extra columns (e.g., `score`, `url`, `subreddit`), carry those over unchanged.

```sql
-- Reddit posts, intent-classified
CREATE TABLE IF NOT EXISTS silver_reddit_posts_intent (
    silver_post_id      SERIAL PRIMARY KEY,
    bronze_post_id      TEXT NOT NULL,           -- FK-style link to raw mongo id
    global_keyword_id   INT NOT NULL REFERENCES global_keywords(global_keyword_id),
    title               TEXT,
    body                TEXT,
    cleaned_text        TEXT NOT NULL,
    score               INT,
    url                 TEXT,
    subreddit           TEXT,
    author              TEXT,
    created_at_utc      TIMESTAMP NOT NULL,
    intent_label        VARCHAR(50) NOT NULL,
    intent_score        FLOAT NOT NULL,
    gold_processed      BOOLEAN DEFAULT FALSE,
    inserted_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE (bronze_post_id, global_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_srpi_gk ON silver_reddit_posts_intent(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_srpi_gold ON silver_reddit_posts_intent(gold_processed) WHERE gold_processed = FALSE;

-- Twitter tweets, intent-classified
CREATE TABLE IF NOT EXISTS silver_twitter_tweets_intent (
    silver_tweet_id     SERIAL PRIMARY KEY,
    bronze_tweet_id     TEXT NOT NULL,
    global_keyword_id   INT NOT NULL REFERENCES global_keywords(global_keyword_id),
    text                TEXT,
    cleaned_text        TEXT NOT NULL,
    author              TEXT,
    like_count          INT,
    retweet_count       INT,
    tweet_created_at    TIMESTAMP NOT NULL,
    intent_label        VARCHAR(50) NOT NULL,
    intent_score        FLOAT NOT NULL,
    gold_processed      BOOLEAN DEFAULT FALSE,
    inserted_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE (bronze_tweet_id, global_keyword_id)
);

CREATE INDEX IF NOT EXISTS idx_stti_gk ON silver_twitter_tweets_intent(global_keyword_id);
CREATE INDEX IF NOT EXISTS idx_stti_gold ON silver_twitter_tweets_intent(gold_processed) WHERE gold_processed = FALSE;
```

**Deliberate omission:** no `silver_reddit_comments_intent` table. Reddit comments are NOT classified for intent in this iteration (see 4.7 and TD-NEW-01). If you add it later, the naming convention is already established.

**Verify your column list against the live sentiment tables before running this.** Use the MCP Postgres connection:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'silver_reddit_posts'
ORDER BY ordinal_position;
```

Mirror every non-sentiment column into the intent table verbatim. If `silver_reddit_posts` has a column the sketch above is missing, add it. The intent table should differ from the sentiment table in exactly one way: `{sentiment_label, sentiment_score}` → `{intent_label, intent_score}`.

**3.3.4 Create the new `fact_intent_events` table:**

```sql
CREATE TABLE IF NOT EXISTS fact_intent_events (
    fact_id             BIGSERIAL PRIMARY KEY,
    silver_content_id   INT NOT NULL,
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
```

The shape mirrors `fact_sentiment_events` almost exactly. Differences:
- `sentiment_id` → `intent_id` (references `dim_intent`, not `dim_sentiment`).
- `sentiment_score` → `intent_score`.
- Table-scoped unique constraint name (`fact_intent_events_unique_content`) so it never collides with the sentiment one.
- `model_id` is still present for future-proofing (if you ever add a second intent model, v3 vs v2, the constraint lets both coexist), but in this iteration only `model_id = 2` rows ever land here.

**Why keep `model_id` on a single-model table?** Cheap insurance. Adding the column now costs nothing and means you never need another schema migration if the intent model gets retrained and you want to A/B compare v2 vs v3 outputs on the same content.

**3.3.5 Extend `analysis_history` with mode + intent summary columns:**

```sql
ALTER TABLE analysis_history
    ADD COLUMN IF NOT EXISTS analysis_mode        VARCHAR(20) DEFAULT 'sentiment',
    ADD COLUMN IF NOT EXISTS dominant_intent      VARCHAR(50),
    ADD COLUMN IF NOT EXISTS intent_distribution  JSONB;
```

`analysis_mode` defaults to `'sentiment'` so every existing row stays semantically correct after migration. `dominant_intent` and `intent_distribution` are NULL for sentiment rows and populated for intent rows.

`analysis_history` is the one place we DO allow mode multiplexing, because it's a thin index/pointer table, not a fact table. A single history card needs to render in a unified feed regardless of which mode produced it. Storing a mode flag here is cheaper than maintaining two parallel history tables that the UI would have to UNION on every read.

**3.3.6 Update the uniqueness constraint on `analysis_history`:**

```sql
-- Check the existing constraint name first
SELECT conname FROM pg_constraint
WHERE conrelid = 'analysis_history'::regclass
  AND contype = 'u';

-- Then drop the old one (name from above) and create a new one including mode
ALTER TABLE analysis_history
    DROP CONSTRAINT IF EXISTS analysis_history_user_id_keyword_start_date_end_date_platform_id_key;

ALTER TABLE analysis_history
    ADD CONSTRAINT analysis_history_user_mode_unique
    UNIQUE (user_id, keyword, start_date, end_date, platform_id, analysis_mode);
```

The old constraint name is a guess — use the actual name from the `pg_constraint` query. This change is critical: without it, running intent analysis on a keyword that has an existing sentiment row will trigger an `ON CONFLICT ... DO UPDATE` and overwrite the sentiment history.

**3.3.7 Add `analysis_mode` to `global_keywords`:**

```sql
ALTER TABLE global_keywords
    ADD COLUMN IF NOT EXISTS analysis_mode VARCHAR(20) DEFAULT 'sentiment';
```

`global_keywords` tracks the most recent run per (user, keyword, platform). Storing the mode here lets the cache check (Section 5.2) distinguish a cached sentiment run from a cached intent run without joining to `analysis_history`.

### 3.4 Traceability: how user_id connects to everything

The path mirrors sentiment exactly, just down the intent branch:

```
fact_intent_events.request_id
    → global_keywords.global_keyword_id
        → global_keywords.user_id
            → auth_identities.user_id
```

And from silver:

```
silver_reddit_posts_intent.global_keyword_id
    → global_keywords.global_keyword_id
        → global_keywords.user_id

silver_twitter_tweets_intent.global_keyword_id
    → global_keywords.global_keyword_id
        → global_keywords.user_id
```

`analysis_history.user_id` is stored directly on the row, same as today. Filter by `analysis_mode = 'intent'` to see only intent runs:

```sql
SELECT * FROM analysis_history
WHERE user_id = 42 AND analysis_mode = 'intent'
ORDER BY analysis_timestamp DESC;
```

No new join paths. No orphaned tables. Every intent row traces back to a user via the same skeleton sentiment already uses.

### 3.5 Verifying the schema is right

After running all the SQL above, run these sanity checks via your MCP Postgres connection:

```sql
-- dim_model has both models
SELECT * FROM dim_model ORDER BY model_id;
-- Expect: model_id 1 (sentiment model), model_id 2 (intent model)

-- dim_intent seeded
SELECT * FROM dim_intent ORDER BY intent_id;
-- Expect: 3 rows: Complaint, Inquiry, Praise

-- New silver tables exist with expected columns
\d silver_reddit_posts_intent
\d silver_twitter_tweets_intent
-- Expect intent_label, intent_score, gold_processed present

-- New fact table exists
\d fact_intent_events
-- Expect intent_id, intent_score, request_id, unique constraint on (silver_content_id, model_id, platform_id, content_type_id)

-- analysis_history has mode columns
\d analysis_history
-- Expect analysis_mode, dominant_intent, intent_distribution

-- New history constraint is in place
SELECT conname FROM pg_constraint
WHERE conrelid = 'analysis_history'::regclass AND contype = 'u';
-- Expect: analysis_history_user_mode_unique

-- Existing sentiment tables are UNTOUCHED (critical)
\d silver_reddit_posts
\d fact_sentiment_events
-- Expect: zero new columns compared to pre-migration state
```

If any of these fail, stop and fix the schema before writing code. Pay particular attention to the last check — if you see `intent_label` on `silver_reddit_posts`, you ran the wrong SQL and must roll back before proceeding.

---

## 4. Python ETL layer changes

### 4.1 Directory layout after your changes

You are adding files, not modifying them. The only edits to existing files are adding a CLI argument and one branch in two small router functions.

```
brandpulse_clean/
├── main.py                           [MODIFIED: 1 new CLI arg]
├── pipeline/
│   ├── orchestrator.py               [MODIFIED: pass mode through]
│   ├── registry.py                   [UNCHANGED]
│   ├── silver/
│   │   ├── sentiment.py              [UNCHANGED]
│   │   ├── intent.py                 [NEW]
│   │   ├── reddit_processor.py       [MODIFIED: mode-aware]
│   │   └── twitter_processor.py      [MODIFIED: mode-aware]
│   └── gold/
│       ├── aggregator.py             [MODIFIED: pass mode through]
│       ├── reddit_aggregator.py      [MODIFIED: mode-aware SQL]
│       └── twitter_aggregator.py     [MODIFIED: mode-aware SQL]
├── models/
│   └── enums.py                      [MODIFIED: add IntentLabel + AnalysisMode]
└── config/
    └── settings.py                   [MODIFIED: add INTENT_MODEL]
```

### 4.2 New file: `pipeline/silver/intent.py`

This is the exact sibling of `pipeline/silver/sentiment.py`. Copy that file verbatim, then change the following:

- Module docstring to describe intent, not sentiment.
- `LABEL_MAP` → the intent model returns human-readable labels directly (`"Complaint"`, `"Inquiry"`, `"Praise"`). Confirm this by running the model once standalone before writing code. If it returns `LABEL_0/1/2`, map them; otherwise, the map is the identity function.
- `_get_intent_pipeline()` instead of `_get_sentiment_pipeline()`, using a different module-level singleton `_intent_pipeline`.
- Model name imported from `config.settings.INTENT_MODEL` instead of `SENTIMENT_MODEL`.
- Function renamed `run_intent_batch()` instead of `run_sentiment_batch()`.

Lazy loading pattern must match exactly. Do not load the model at import time. Do not share the singleton between files.

### 4.3 `config/settings.py` additions

Add one constant after `SENTIMENT_MODEL`:

```python
INTENT_MODEL: str = os.getenv(
    "INTENT_MODEL",
    "ibrahimtime/bertweet-intent-classifier-v2",
)
```

Add to `.env.example` too so future devs know the knob exists.

### 4.4 `models/enums.py` additions

Append two new enums after the existing ones. Do not modify the existing `SentimentLabel` enum.

```python
class IntentLabel(str, Enum):
    COMPLAINT = "Complaint"
    INQUIRY = "Inquiry"
    PRAISE = "Praise"

    @property
    def dim_id(self) -> int:
        return _INTENT_DIM_IDS[self]

_INTENT_DIM_IDS = {
    IntentLabel.COMPLAINT: 1,
    IntentLabel.INQUIRY: 2,
    IntentLabel.PRAISE: 3,
}

class AnalysisMode(str, Enum):
    SENTIMENT = "sentiment"
    INTENT = "intent"
```

### 4.5 Modifying `pipeline/silver/reddit_processor.py`

The function signature becomes:

```python
def run_silver(request_id, batch_size=50, mode="sentiment"):
```

Inside the function, the change is small and contained. At the top of the inference phase, pick the right classifier, target table, and target columns based on mode:

```python
from models.enums import AnalysisMode

if mode == AnalysisMode.INTENT.value:
    from pipeline.silver.intent import run_intent_batch as classify_batch
    target_table = "silver_reddit_posts_intent"
    label_col = "intent_label"
    score_col = "intent_score"
else:
    from pipeline.silver.sentiment import run_sentiment_batch as classify_batch
    target_table = "silver_reddit_posts"
    label_col = "sentiment_label"
    score_col = "sentiment_score"
```

Then the INSERT statement routes to the correct table. Given our "explain-first" rule, **duplicate the INSERT statement once inside an `if mode == 'intent': ... else: ...` block**. Each branch writes to its own table with no nullable-column shenanigans:

```python
if mode == AnalysisMode.INTENT.value:
    cur.execute("""
        INSERT INTO silver_reddit_posts_intent
            (bronze_post_id, global_keyword_id, title, body, cleaned_text,
             score, url, subreddit, author, created_at_utc,
             intent_label, intent_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (bronze_post_id, global_keyword_id) DO NOTHING
    """, (...))
else:
    cur.execute("""
        INSERT INTO silver_reddit_posts
            (bronze_post_id, global_keyword_id, title, body, cleaned_text,
             score, url, subreddit, author, created_at_utc,
             sentiment_label, sentiment_score)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (bronze_post_id, global_keyword_id) DO NOTHING
    """, (...))
```

The column list and param list are identical between the two branches — only the table name and the two classification columns differ. Fifteen lines of copy-paste is easier to explain in the eval than a dynamic SQL builder.

**Do not use comment summary in intent mode.** The aggregation helper (`aggregate_sentiment` in `utils/text_processing/base.py`) is sentiment-specific logic (strong-signal thresholds for polarity). For intent, aggregation does not apply the same way, and there is no `silver_reddit_comments_intent` table. Guard the entire comment summary block with `if mode == 'sentiment':` and skip it in intent mode.

### 4.6 Modifying `pipeline/silver/twitter_processor.py`

Same pattern as Reddit processor. Add `mode` parameter, pick classifier + target table based on mode:

- `mode == 'sentiment'` → INSERT into `silver_twitter_tweets` with `tweet_sentiment_label` + `tweet_sentiment_score`.
- `mode == 'intent'` → INSERT into `silver_twitter_tweets_intent` with `intent_label` + `intent_score`.

Twitter has no comment summary table to skip. Duplicate the INSERT once per branch, same as Reddit.

### 4.7 Modifying `pipeline/gold/reddit_aggregator.py`

One new SQL statement. Keep the existing sentiment SQL untouched. Add:

```python
INSERT_POST_INTENT_SQL = """
INSERT INTO fact_intent_events (
    silver_content_id, model_id, platform_id, content_type_id,
    intent_id, date_id, time_id, intent_score, request_id
)
SELECT
    sp.silver_post_id,
    2,    -- Model: intent classifier
    1,    -- Platform: Reddit
    1,    -- Content Type: Post
    di.intent_id,
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    sp.intent_score,
    %s
FROM silver_reddit_posts_intent sp
JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
JOIN dim_intent di ON di.intent_label = sp.intent_label
LEFT JOIN dim_date dd ON dd.calendar_date = DATE(sp.created_at_utc)
LEFT JOIN dim_time dt ON dt.time_id = (EXTRACT(HOUR FROM sp.created_at_utc) * 100 + EXTRACT(MINUTE FROM sp.created_at_utc))
WHERE sp.global_keyword_id = %s
  AND sp.intent_label IS NOT NULL
  AND sp.gold_processed = FALSE
  AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
  AND (gk.end_date   IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
ON CONFLICT ON CONSTRAINT fact_intent_events_unique_content DO NOTHING;
"""
```

**Key difference from v1 of this plan:** this writes to `fact_intent_events`, not to `fact_sentiment_events`. The tables are fully separate. When the backend reads intent data, it queries `fact_intent_events` directly — no `model_id = 2` filter needed to avoid mixing with sentiment rows, because sentiment rows simply aren't in this table.

The aggregator function becomes:

```python
def run_reddit_gold(keyword, request_id, mode="sentiment"):
    conn = get_pg_connection()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            if mode == "intent":
                cur.execute(INSERT_POST_INTENT_SQL, (request_id, request_id))
                # No comments in intent mode — future improvement (TD-NEW-01)
                cur.execute("""
                    UPDATE silver_reddit_posts_intent
                    SET gold_processed = TRUE
                    WHERE global_keyword_id = %s AND gold_processed = FALSE
                """, (request_id,))
            else:
                cur.execute(INSERT_POST_SENTIMENT_SQL, (request_id, request_id))
                cur.execute(INSERT_COMMENT_SENTIMENT_SQL, (request_id, request_id))
                cur.execute("""
                    UPDATE silver_reddit_posts
                    SET gold_processed = TRUE
                    WHERE global_keyword_id = %s AND gold_processed = FALSE
                """, (request_id,))

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
```

Notice the `gold_processed` UPDATE is also mode-aware — each mode's silver table has its own `gold_processed` flag, and they're tracked independently. A post that's been intent-classified and sentiment-classified ends up in TWO silver rows (one per table), each with its own `gold_processed` state.

**Deliberate scope decision:** Reddit comments are NOT classified for intent in this iteration. Comments are often context-dependent replies to the parent post and their intent labels are noisy without the thread context. Post-level intent is the meaningful signal. Document this in the Technical Debt register as a known limitation (TD-NEW-01). This is the kind of honest scope call that scores well in evaluation.

### 4.8 Modifying `pipeline/gold/twitter_aggregator.py`

Same pattern. Add `INSERT_TWEET_INTENT_SQL` that reads from `silver_twitter_tweets_intent` and writes to `fact_intent_events` (platform_id = 2, content_type_id = 3 for Tweet). Branch `run_twitter_gold()` on mode. Tweets are flat so there's no comment/post split to worry about. Update `gold_processed` on the intent silver table in the intent branch.

### 4.9 Modifying `pipeline/gold/aggregator.py` (the router)

```python
def run_gold_etl(keyword, request_id, platform='reddit', mode='sentiment'):
    if platform == 'reddit':
        run_reddit_gold(keyword, request_id, mode=mode)
    elif platform == 'twitter':
        run_twitter_gold(keyword, request_id, mode=mode)
    else:
        raise ValueError(f"Unsupported platform: {platform}")
```

### 4.10 Modifying `pipeline/orchestrator.py`

`run_pipeline` grows one parameter:

```python
def run_pipeline(keyword, request_id, platform='reddit', mode='sentiment'):
    ...
    pipeline = get_pipeline(platform)
    pipeline.ingest(keyword, request_id)          # Bronze — mode-agnostic
    pipeline.process(request_id, mode=mode)       # Silver — mode-aware
    pipeline.aggregate(keyword, request_id, mode=mode)  # Gold — mode-aware
```

The bronze layer is intentionally mode-agnostic. Raw data is raw data; the model you run on it later is a downstream decision. This lets you run intent on bronze data that was originally fetched for sentiment, if you ever want to (you don't need this feature now, but the architecture supports it for free).

Update `registry.py` pipeline classes to accept `mode` in their `process()` and `aggregate()` methods and pass it through. The `ingest()` method ignores mode.

### 4.11 Modifying `main.py`

```python
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python main.py <keyword> <request_id> [platform] [mode]")
        sys.exit(1)

    keyword = sys.argv[1]
    request_id = sys.argv[2]
    platform = sys.argv[3] if len(sys.argv) > 3 else "reddit"
    mode = sys.argv[4] if len(sys.argv) > 4 else "sentiment"

    try:
        run_pipeline(keyword, request_id, platform, mode)
        sys.exit(0)
    except Exception as e:
        print(f"Pipeline failed: {e}")
        sys.exit(1)
```

Default to `"sentiment"` for backward compat with any callers that don't know about mode yet.

---

## 5. Node.js backend changes

### 5.1 `routes/pipeline.js` — accepting the mode parameter

The `/api/pipeline/analyze` endpoint already receives `platform` in the body. Add `mode` in the same way.

```js
const { keyword, user_id, start_date, end_date, platform: rawPlatform, mode: rawMode } = req.body;
const mode = (rawMode || "sentiment").toString().toLowerCase();
if (!["sentiment", "intent"].includes(mode)) {
  return res.status(400).json({ error: `Unsupported mode: ${mode}` });
}
```

Store mode on `global_keywords` so it's retrievable later:

```js
await pool.query(`
    INSERT INTO global_keywords
        (keyword, user_id, platform_id, analysis_mode, status,
         bronze_processed, last_run_at, start_date, end_date)
    VALUES ($1, $2, $3, $4, 'PROCESSING', FALSE, NOW(), $5, $6)
    ON CONFLICT (user_id, keyword, platform_id)
    DO UPDATE SET
        analysis_mode = EXCLUDED.analysis_mode,
        status = 'PROCESSING',
        bronze_processed = FALSE,
        last_run_at = NOW(),
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date
    RETURNING global_keyword_id
`, [keyword, user_id, platformId, mode, finalStartDate, finalEndDate]);
```

**Subtle issue:** the existing `ON CONFLICT` on `global_keywords` is `(user_id, keyword, platform_id)`. A user who runs sentiment first and then intent on the same keyword+platform will have the row's `analysis_mode` flip from `sentiment` to `intent`. That's fine for this table because it just tracks the latest run — history is preserved separately in `analysis_history`. But add a comment explaining this so no one mistakes it for a bug.

Update the spawn call:

```js
spawn(pythonExe, [pythonScript, keyword, requestId.toString(), platform, mode]);
```

### 5.2 Cache coverage must consider mode

Your existing cache helper (`routes/cacheHelper.js`) returns a cached analysis if ≥75% date coverage. Right now, a user who runs sentiment first and then intent on the same keyword will get the **sentiment** cached result back — wrong.

Pass mode into the cache check. The filter now points at a different fact table depending on mode:

```js
// calculateCacheCoverage signature gets a new `mode` param
// Pick the right existence check based on mode:
const factTable = mode === 'intent' ? 'fact_intent_events' : 'fact_sentiment_events';

// In the SQL:
WHERE gk.keyword = $1
  AND gk.user_id = $2
  AND gk.platform_id = $3
  AND gk.analysis_mode = $4    -- NEW
  AND gk.status = 'COMPLETED'
  AND EXISTS (
      SELECT 1 FROM ${factTable}
      WHERE request_id = gk.global_keyword_id
        AND platform_id = $3
      LIMIT 1
  )
```

Because the two fact tables are fully separate, the EXISTS check naturally scopes to the right mode — no `model_id` filter required. Cache hit is mode-specific: a user gets the cached sentiment result for sentiment requests, cached intent for intent requests, a fresh run if neither exists.

**Avoid SQL injection** even though `factTable` is chosen from a whitelist: the two string values are hard-coded in the conditional, not pulled from user input. If you refactor this, keep the whitelist explicit.

### 5.3 History save — new `saveIntentAnalysisToHistory` function

In `routes/pipeline.js`, alongside `saveAnalysisToHistory` and `saveTwitterAnalysisToHistory`, add an intent equivalent that reads from the intent silver tables:

```js
async function saveIntentAnalysisToHistory(requestId, keyword, userId, startDate, endDate, platformId) {
    const table   = platformId === 2 ? 'silver_twitter_tweets_intent' : 'silver_reddit_posts_intent';
    const dateCol = platformId === 2 ? 'tweet_created_at'              : 'created_at_utc';

    const res = await pool.query(`
        SELECT
            COUNT(*) FILTER (WHERE intent_label = 'Complaint') AS complaint_count,
            COUNT(*) FILTER (WHERE intent_label = 'Inquiry')   AS inquiry_count,
            COUNT(*) FILTER (WHERE intent_label = 'Praise')    AS praise_count,
            COUNT(*) FILTER (WHERE intent_label IS NOT NULL)   AS total_count
        FROM ${table} s
        JOIN global_keywords gk ON gk.global_keyword_id = s.global_keyword_id
        WHERE s.global_keyword_id = $1
          AND (gk.start_date IS NULL OR DATE(s.${dateCol}) >= gk.start_date)
          AND (gk.end_date   IS NULL OR DATE(s.${dateCol}) <= gk.end_date)
    `, [requestId]);

    const row = res.rows[0];
    const total = parseInt(row.total_count) || 0;
    if (total === 0) return;

    const counts = {
        Complaint: parseInt(row.complaint_count) || 0,
        Inquiry:   parseInt(row.inquiry_count)   || 0,
        Praise:    parseInt(row.praise_count)    || 0,
    };
    const dominant = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

    await pool.query(`
        INSERT INTO analysis_history (
            keyword, user_id, start_date, end_date,
            total_posts, total_comments,
            request_id, platform_id,
            analysis_mode, dominant_intent, intent_distribution
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'intent', $9, $10)
        ON CONFLICT (user_id, keyword, start_date, end_date, platform_id, analysis_mode)
        DO UPDATE SET
            total_posts = EXCLUDED.total_posts,
            total_comments = EXCLUDED.total_comments,
            dominant_intent = EXCLUDED.dominant_intent,
            intent_distribution = EXCLUDED.intent_distribution,
            analysis_timestamp = CURRENT_TIMESTAMP
    `, [keyword, userId, startDate, endDate, total, 0, requestId, platformId, dominant, JSON.stringify(counts)]);
}
```

The table-name switch between `silver_reddit_posts_intent` and `silver_twitter_tweets_intent` is string interpolation and is safe here because `platformId` is a server-side integer we control. Do not accept the table name from the client.

Note: `total_posts` holds the total for intent, `total_comments` is 0. This is because intent doesn't classify comments (see 4.7). The column name is a slight misnomer in intent mode, but keeping the history schema identical across modes avoids a separate history table. Noted as TD-NEW-02.

In the pipeline's `pythonProcess.on("close")` handler, branch on mode:

```js
if (mode === 'intent') {
    await saveIntentAnalysisToHistory(requestId, keyword, user_id, finalStartDate, finalEndDate, platformId);
} else if (platform === 'twitter') {
    await saveTwitterAnalysisToHistory(requestId, keyword, user_id, finalStartDate, finalEndDate);
} else {
    await saveAnalysisToHistory(requestId, keyword, user_id, finalStartDate, finalEndDate);
}
```

### 5.4 `routes/data.js` — new endpoints for intent

Add two new endpoints that mirror the existing sentiment ones:

**`GET /api/data/intent/results/:requestId?platform=reddit`**

Returns:

```json
{
    "posts": [
        { "name": "Complaint", "value": 12 },
        { "name": "Inquiry", "value": 5 },
        { "name": "Praise", "value": 8 }
    ],
    "comments": [],
    "totals": { "posts": 25, "comments": 0, "total": 25 },
    "mode": "intent"
}
```

SQL (Reddit case) — reads directly from the intent silver table, no `model_id` filter needed:

```sql
SELECT
    sp.intent_label AS name,
    COUNT(*)::INT   AS value
FROM silver_reddit_posts_intent sp
JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
WHERE sp.global_keyword_id = $1
  AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
  AND (gk.end_date   IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
GROUP BY sp.intent_label
ORDER BY value DESC;
```

Twitter case: same query against `silver_twitter_tweets_intent`, using `tweet_created_at` as the date column.

**`GET /api/data/intent/details/:requestId?platform=reddit`**

Returns a `posts` array (or `tweets` array for Twitter) with fields: `id`, `title`, `body`, `score`, `intent` (the label), `confidence` (the score), `created_at`, `url`, `subreddit`. Same shape as the sentiment details endpoint, but SELECT is against `silver_reddit_posts_intent` / `silver_twitter_tweets_intent`.

Keep the sentiment endpoints (`/api/data/results/:requestId`, `/api/data/details/:requestId`) exactly as they are today. Do not change them.

### 5.5 History endpoint — return mode and appropriate dominant value

The existing `GET /api/data/history/:userId` already returns `dominant_sentiment`. Update the SELECT to also return `analysis_mode`, `dominant_intent`, `intent_distribution`:

```sql
SELECT
    history_id, keyword, start_date, end_date,
    total_posts, total_comments,
    dominant_sentiment, dominant_intent,
    intent_distribution,
    analysis_mode,
    avg_post_sentiment_score, avg_comment_sentiment_score,
    request_id, platform_id,
    analysis_timestamp
FROM analysis_history
WHERE user_id = $1
ORDER BY analysis_timestamp DESC
LIMIT $2 OFFSET $3
```

The frontend decides which dominant field to show based on `analysis_mode`.

---

## 6. Frontend changes

### 6.1 New files to create

```
client/src/
├── components/
│   ├── IntentChart.jsx       [NEW — pie chart, copy of SentimentChart]
│   ├── IntentBarChart.jsx    [NEW — magnitude bar chart]
│   └── IntentBadge.jsx       [NEW — per-item badge]
├── pages/
│   └── IntentAnalysis.jsx    [NEW — copy of SentimentAnalysis, swaps components]
└── hooks/
    └── useAnalysis.js        [MODIFIED — accepts mode param]
```

`App.jsx` gets one new route. `Landing.jsx` gets one more card.

### 6.2 `IntentChart.jsx` — the pie chart

Start by copying `SentimentChart.jsx` wholesale. Then change only these:

```js
const COLORS = {
    Complaint: '#EF4444',   // red — urgency
    Inquiry:   '#3B82F6',   // blue — information
    Praise:    '#10B981',   // green — positive
};
```

Change the default title to `"Brand Intent Analysis"` and the default subtitle logic to reference "items classified" instead of "items analyzed". Everything else — tooltip, legend, stat cards below the chart — works as-is because it's driven by the `data` array structure, which is identical (`{name, value}`).

### 6.3 `IntentBarChart.jsx` — the magnitude chart

This is the one new component that has no sentiment equivalent. Use Recharts `<BarChart>` horizontally. The reason: pies compare proportions well, bars compare absolute counts well. For intent, the brand manager wants to know "how many complaints are there" (magnitude), not just "what percent are complaints". Both visuals together tell the full story.

```jsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = {
    Complaint: '#EF4444',
    Inquiry:   '#3B82F6',
    Praise:    '#10B981',
};

const IntentBarChart = ({ data, title }) => {
    if (!data || data.length === 0) {
        return (
            <div className="flex items-center justify-center h-80 bg-gray-50 rounded-xl">
                <p className="text-gray-400">No intent data available</p>
            </div>
        );
    }

    return (
        <div className="w-full">
            <h3 className="text-2xl font-bold mb-4 text-center text-gray-800">{title || 'Intent Count Comparison'}</h3>
            <div className="w-full h-80 min-h-80">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" />
                        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                            {data.map((entry) => (
                                <Cell key={entry.name} fill={COLORS[entry.name] || '#8884d8'} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default IntentBarChart;
```

Place it next to the pie in a 2-column grid on desktop, stacked on mobile. Same pattern as the existing post/comment pie grid.

### 6.4 `IntentBadge.jsx`

Copy `SentimentBadge` (defined inline in `SentimentAnalysis.jsx`). Swap colors:

```jsx
const IntentBadge = ({ intent, confidence }) => {
    const colors = {
        Complaint: 'bg-red-100 text-red-700 border-red-200',
        Inquiry:   'bg-blue-100 text-blue-700 border-blue-200',
        Praise:    'bg-green-100 text-green-700 border-green-200',
    };
    return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[intent] || colors.Inquiry}`}>
            {intent} {confidence ? `(${(confidence * 100).toFixed(0)}%)` : ''}
        </span>
    );
};
```

Extract it to its own file so both `IntentAnalysis.jsx` and the history cards can reuse it.

### 6.5 `IntentAnalysis.jsx` — the page

Near-exact copy of `SentimentAnalysis.jsx`. The diff:

- Axios URLs: `/api/data/intent/results/:id` and `/api/data/intent/details/:id`
- `startAnalysis()` is called with `mode='intent'`
- Charts tab: uses `<IntentChart>` for the pie and adds `<IntentBarChart>` next to it
- No separate "posts" and "comments" pies — only posts for Reddit, only tweets for Twitter (since intent is not computed for comments). Reflect this in the tab labels and in the summary cards
- Summary cards: Total / Complaints (red) / Inquiries (blue) / Praise (green). Four cards for Reddit and Twitter alike (no separate comment count)
- Each detail item shows `<IntentBadge>` instead of `<SentimentBadge>`
- Page heading: "BrandPulse Intent Analyzer"

Do not try to make one page handle both modes. The duplication is intentional and defensible.

### 6.6 `useAnalysis.js` changes

Add a `mode` parameter to `startAnalysis`:

```js
const startAnalysis = async (keyword, userId, startDate = null, endDate = null, platform = 'reddit', mode = 'sentiment') => {
    // ... existing code ...
    body: JSON.stringify({
        keyword,
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        platform,
        mode,        // NEW
    })
    // ... existing code ...
};
```

Default `mode='sentiment'` keeps the existing sentiment page working unchanged.

### 6.7 Landing page — add the intent card

Your `Landing.jsx` already has three cards (Sentiment, History, Profile). Change the top CTAs and cards so the **two analysis modes** are the prominent options:

Primary CTAs section:
- Keep "Analyze Brand Sentiment" linking to `/sentiment-analysis`
- Add "Classify Intent" linking to `/intent-analysis` as a second primary button

Feature cards section (the three-up grid):
- Card 1: Sentiment Analysis (existing)
- Card 2: Intent Classification (NEW) — icon: `MessageSquareWarning` or `Tag` from lucide-react, description: "Detect complaints, inquiries, and praise in brand conversations"
- Card 3: History (existing, maybe demote or keep)
- Profile card moves into the header dropdown (it already is there, so just drop it from the landing grid)

This layout puts both analysis modes at equal visual weight, which is what the feature-parity implies.

### 6.8 History page — mode-aware rendering

In `History.jsx`, each analysis card currently shows `dominant_sentiment`. Update to:

1. Show a new small badge on every card: "Sentiment" or "Intent" (small, subtle, top-right of card).
2. The "dominant" label line:
   - If `analysis_mode === 'sentiment'`, show `Dominant: {dominant_sentiment}` with existing color logic.
   - If `analysis_mode === 'intent'`, show `Dominant: {dominant_intent}` with IntentBadge colors.
3. The "View Details" button:
   - Sentiment → `/sentiment-analysis?requestId=...` (existing behavior)
   - Intent → `/intent-analysis?requestId=...` (new route)
4. Stats display:
   - Sentiment: "Posts" and "Comments" as today.
   - Intent: "Items Classified" (sum) instead of posts/comments split, because comments aren't classified. You could also render the intent distribution (Complaint X / Inquiry Y / Praise Z) as three mini-stats.

### 6.9 `App.jsx` — register the new route

```jsx
<Route path="/intent-analysis" element={<ProtectedRoute><IntentAnalysis /></ProtectedRoute>} />
```

### 6.10 Historical view support on IntentAnalysis page

Same pattern as sentiment: if `?requestId=X` is in the URL, fetch historical results instead of showing the form. Copy the exact `useEffect` block from `SentimentAnalysis.jsx` that handles `searchParams.get('requestId')`, just point it at the intent endpoints.

---

## 7. Things you must NOT do

Explicit list to keep scope tight. If you catch yourself doing any of these, stop.

1. **Do not run sentiment and intent in the same pipeline pass.** Two separate user actions, two separate pipeline runs.
2. **Do not classify Reddit comments for intent in this iteration.** Document as deferred debt (TD-NEW-01).
3. **Do not try to parameterize `SentimentChart.jsx` and `IntentChart.jsx` into one component.** Duplication is cheaper than abstraction here.
4. **Do not change the existing sentiment endpoints.** They must continue to work exactly as they do today.
5. **Do not touch `silver_reddit_posts`, `silver_reddit_comments`, `silver_twitter_tweets`, or `fact_sentiment_events`.** The whole point of Option B is that these tables stay frozen. Adding `intent_*` columns to them is a violation of the plan. If you find yourself writing `ALTER TABLE silver_reddit_posts`, stop and re-read Section 3.
6. **Do not write intent rows into `fact_sentiment_events`.** They go to `fact_intent_events`. If you accidentally mix the two, you'll have silent data corruption that only surfaces at demo time when sentiment counts look inflated.
7. **Do not add intent support to `TrendChart.jsx` yet.** That's v3 — deferred as TD-NEW-05.
8. **Do not merge the two analysis modes into one endpoint.** `/api/data/intent/*` stays separate from `/api/data/*`. Same reason: explainability over cleverness.
9. **Do not overwrite the old `analysis_history` uniqueness constraint without first verifying its name** via `pg_constraint` query.
10. **Do not hard-code the model name in `intent.py`.** It must come from `config.settings.INTENT_MODEL`.
11. **Do not forget to update `.env.example`** with the new `INTENT_MODEL` env var.
12. **Do not skip `gold_processed` updates on the intent silver tables.** Each silver table (sentiment and intent) tracks its own flag independently. Forgetting to flip this flag causes gold re-inserts to attempt duplicate writes.

---

## 8. What the data visualization shows — the final UX

When the user runs an intent analysis and the results come back, they see:

**Top row — 4 summary cards:**
1. Total Classified (brand color)
2. Complaints (red) — the number brand managers care about most
3. Inquiries (blue) — support load indicator
4. Praise (green) — marketing win signal

**Middle row — 2 charts side by side (stacked on mobile):**
1. Pie chart — proportion of each intent class
2. Horizontal bar chart — absolute count of each class

**Tabs:**
- **Charts** (default) — shows the two charts above
- **Posts** (Reddit) / **Tweets** (Twitter) — scrollable list of individual items, each with an IntentBadge showing class + confidence

**When filtering by date range:** same behavior as sentiment page — filters are applied, subtitle reflects the filter.

**When viewing historical run:** same banner as sentiment page ("Viewing Past Analysis"), same data display.

---

## 9. Technical debt to register after shipping

Add these to `brandpulse_clean/docs/technical_debt.md`:

- **TD-NEW-01:** Reddit comment intent classification deferred. Current iteration classifies posts only. Comments are context-dependent and noisy without thread structure. Acceptable for v1; revisit for v2.
- **TD-NEW-02:** `analysis_history.total_comments` is always 0 for intent mode. Column name is a slight misnomer in this mode; keeping the single history table across modes to avoid UNION queries on the feed read. Document via inline comment in `saveIntentAnalysisToHistory`.
- **TD-NEW-03:** Intent mode produces a `gold_processed` flag on its own silver table, tracked separately from the sentiment flag. A post re-analyzed across both modes will exist as two rows (one per silver table). Not a bug — a consequence of Option B separation — but worth flagging so future devs understand why the same bronze post appears in multiple silver rows.
- **TD-NEW-04:** Cache coverage uses exact mode match. A user who ran sentiment then requests intent gets a fresh run (correct). A user who re-requests the same mode within the coverage window gets cached data (correct). No cross-mode cache contamination.
- **TD-NEW-05:** Intent-mode Trend Chart deferred. The sentiment Trend Analysis feature (UC-2) is live and reads from `fact_sentiment_events`. An intent-equivalent trend chart reading from `fact_intent_events` is a one-afternoon follow-up — the SQL shape is identical, only the fact table name and the color/label mapping change. Scheduled for v3.

---

## 10. Testing checklist

Before calling the feature done, verify every item:

**Database:**
- [ ] `SELECT * FROM dim_model` returns 2 rows (sentiment + intent)
- [ ] `SELECT * FROM dim_intent` returns 3 rows
- [ ] `\d silver_reddit_posts_intent` exists with `intent_label`, `intent_score`, `gold_processed`
- [ ] `\d silver_twitter_tweets_intent` exists with `intent_label`, `intent_score`, `gold_processed`
- [ ] `\d fact_intent_events` exists with unique constraint `fact_intent_events_unique_content`
- [ ] `\d analysis_history` shows `analysis_mode`, `dominant_intent`, `intent_distribution`
- [ ] Constraint `analysis_history_user_mode_unique` exists on `analysis_history`
- [ ] **`\d silver_reddit_posts` shows NO `intent_label` column** (sentiment schema untouched)
- [ ] **`\d fact_sentiment_events` shows NO new columns** (sentiment schema untouched)

**Python ETL:**
- [ ] `python -c "from pipeline.silver.intent import run_intent_batch; print(run_intent_batch(['my wifi is broken', 'what are your hours', 'love this product']))"` returns three dicts with labels matching input intent
- [ ] `python main.py "tesla" 999 reddit intent` runs end-to-end with exit code 0
- [ ] `python main.py "tesla" 998 reddit sentiment` still runs end-to-end with exit code 0 (no regression)
- [ ] `python main.py "tesla" 997 twitter intent` runs end-to-end with exit code 0
- [ ] After intent run, `SELECT intent_label, COUNT(*) FROM silver_reddit_posts_intent WHERE global_keyword_id = 999 GROUP BY intent_label` shows up to 3 distinct labels
- [ ] After intent run, `SELECT COUNT(*) FROM fact_intent_events WHERE request_id = 999` is > 0
- [ ] After intent run, `SELECT COUNT(*) FROM fact_sentiment_events WHERE request_id = 999` is 0 (intent run did NOT write to sentiment fact)

**Node backend:**
- [ ] `POST /api/pipeline/analyze` with `{keyword, user_id, platform: "reddit", mode: "intent"}` returns 202 with a requestId
- [ ] `GET /api/data/intent/results/:requestId` returns the expected shape with up to 3 intent labels
- [ ] `GET /api/data/history/:userId` returns both sentiment and intent rows, distinguishable by `analysis_mode`
- [ ] Cache test: run intent analysis twice on the same keyword+range+user → second call returns `cached: true`
- [ ] Cross-mode test: run sentiment then intent on same keyword → intent run is NOT cached, executes freshly, and the sentiment cached result is not served by mistake

**Frontend:**
- [ ] Landing page shows two analysis cards (sentiment + intent)
- [ ] Clicking "Classify Intent" navigates to `/intent-analysis`
- [ ] Running an intent analysis shows pie + bar chart side by side
- [ ] Each item in the Posts/Tweets tab shows IntentBadge with correct color
- [ ] History page shows a mode badge on each card
- [ ] Clicking "View Details" on an intent history card routes to `/intent-analysis?requestId=...` and loads data correctly
- [ ] Existing sentiment flow still works unchanged
- [ ] Existing Trend Analysis tab on sentiment page still works unchanged

**Traceability:**
- [ ] From any row in `silver_reddit_posts_intent`, following `global_keyword_id` leads to a valid `user_id`
- [ ] `SELECT * FROM analysis_history WHERE user_id = <YOUR_ID> AND analysis_mode = 'intent'` returns your intent runs and only your intent runs
- [ ] `SELECT * FROM fact_intent_events fie JOIN global_keywords gk ON fie.request_id = gk.global_keyword_id WHERE gk.user_id = <YOUR_ID>` returns the expected count

---

## 11. Rollout / deployment notes

This is a local-dev-only project (no cloud). Rollout for you means:

1. Pull the changes.
2. Run the schema migration SQL from Section 3.3.
3. Add `INTENT_MODEL` to your `.env`.
4. Restart the Node backend.
5. Restart the Vite dev server.
6. Smoke test using the testing checklist in Section 10.

No Docker, no CI/CD. If/when you deploy, the migration SQL needs to run on the production database once, before the new Python ETL tries to read the new columns.

---

## 12. What to write in the evaluation document

When you defend this at FYP-II evaluation, here are the one-sentence answers to the questions you will be asked:

- **Why intent classification in addition to sentiment?** "Sentiment tells you how users feel; intent tells you what action they want. Brand managers need both signals to triage."
- **Why not one combined pipeline?** "Model inference cost doubles per row. Users pick the signal they need; combining is v3 work with UI for joint visualization."
- **Why separate React page, not a toggle?** "Explain-first design. Two focused pages with different KPIs are easier to maintain and demo than one mode-switching page."
- **Why separate fact and silver tables instead of reusing the sentiment ones with a `model_id` discriminator?** "Separation of concerns. The sentiment pipeline's data model is clean and single-purpose; adding nullable intent columns and a shared fact table would mean every sentiment query carries a defensive `model_id = 1` filter to avoid contaminating counts. Parallel tables cost more DDL but zero query-time tax, and each pipeline evolves independently."
- **Why only posts for intent, not comments?** "Comment intent is noisy without thread context. Post-level intent is the unambiguous signal. Comment intent is documented technical debt for v2."
- **Why a bar chart and a pie chart?** "Pie shows proportion, bar shows magnitude. Brand managers care about both — 'what fraction are complaints' and 'how many absolute complaints.'"
- **Why does the history table multiplex modes while the fact tables don't?** "History is a thin pointer/feed table used for listing — cheap to scan, never joined in analytics queries. Facts are what the dashboards aggregate over, so they stay single-purpose. The cost of a mode filter on a small table is negligible; the cost on a large fact table compounds."

---

## 13. Execution order (do these in order, verify each step)

This is the ordered checklist of every task. Do them in this sequence; each one has a verification step.

### Phase 1: Database (30 minutes)
1. Run Section 3.3 SQL statements via MCP.
2. Run Section 3.5 sanity checks. All must pass before moving on.

### Phase 2: Python ETL — isolated model test (1 hour)
3. Add `INTENT_MODEL` to `config/settings.py` and `.env` / `.env.example`.
4. Add `IntentLabel` and `AnalysisMode` enums to `models/enums.py`.
5. Create `pipeline/silver/intent.py` by copying `sentiment.py` and adapting.
6. Standalone test: `python -c "from pipeline.silver.intent import run_intent_batch; print(run_intent_batch(['my internet is broken', 'what are your store hours', 'amazing service thank you']))"`. Expect three labeled dicts.

### Phase 3: Python ETL — silver layer (2 hours)
7. Add `mode` parameter to `run_silver()` in `reddit_processor.py`. Branch INSERT SQL. Skip comment summary in intent mode.
8. Add `mode` parameter to `run_silver_twitter()` in `twitter_processor.py`. Branch INSERT SQL.
9. Add `mode` parameter to `RedditPipeline.process()` and `TwitterPipeline.process()` in `registry.py` (pass through).

### Phase 4: Python ETL — gold layer (1.5 hours)
10. Add `INSERT_POST_INTENT_SQL` to `reddit_aggregator.py`. Branch `run_reddit_gold()` on mode.
11. Add `INSERT_TWEET_INTENT_SQL` to `twitter_aggregator.py`. Branch `run_twitter_gold()` on mode.
12. Add `mode` parameter to `run_gold_etl()` router. Pass through.
13. Add `mode` parameter to `RedditPipeline.aggregate()` and `TwitterPipeline.aggregate()`.

### Phase 5: Python ETL — orchestrator + CLI (30 minutes)
14. Add `mode` parameter to `run_pipeline()` in `orchestrator.py`.
15. Add `mode` CLI arg to `main.py`.
16. **End-to-end Python test:** `python main.py "tesla" 1001 reddit intent`. Exit code 0. Check silver + fact rows exist with correct labels.
17. **Regression test:** `python main.py "tesla" 1002 reddit sentiment`. Exit code 0. Sentiment flow unchanged.

### Phase 6: Node backend (2 hours)
18. Update `routes/pipeline.js` to accept `mode` in request body, store on `global_keywords`, pass to spawn.
19. Update `routes/cacheHelper.js` to filter cache lookups by `mode`. Parameterize `factTable` selection (sentiment vs intent) based on mode.
20. Add `saveIntentAnalysisToHistory()` function. Branch the pipeline `close` handler to call it.
21. Add `GET /api/data/intent/results/:requestId` and `GET /api/data/intent/details/:requestId` endpoints.
22. Update `GET /api/data/history/:userId` SELECT to include mode + intent columns.
23. **Backend test via curl or Postman:** POST analyze with `mode: 'intent'`, poll status, fetch intent results. Confirm response shape.

### Phase 7: Frontend (3 hours)
24. Create `IntentBadge.jsx`, `IntentChart.jsx`, `IntentBarChart.jsx`.
25. Create `IntentAnalysis.jsx` by copying `SentimentAnalysis.jsx` and editing.
26. Update `useAnalysis.js` to accept `mode`.
27. Add `/intent-analysis` route in `App.jsx`.
28. Update `Landing.jsx` with new intent card and CTA.
29. Update `History.jsx` to render mode badge and route to correct page on "View Details".
30. **Frontend test:** full user flow — log in, run intent analysis, see charts, view posts, check history, click into a history item.

### Phase 8: Technical debt + docs (30 minutes)
31. Add entries TD-NEW-01 through TD-NEW-05 to `docs/technical_debt.md`.
32. Update the project README / status document to mention intent classification as a supported mode.

### Phase 9: Final verification (30 minutes)
33. Run every item in the testing checklist (Section 10).
34. Commit in logical chunks matching the phases above, with descriptive messages.

---

## 14. Contact escalation

If you hit something this plan doesn't cover — especially if the model output format differs from what's documented (e.g., it returns `LABEL_0/1/2` instead of `Complaint/Inquiry/Praise`), or if the dim_model/dim_sentiment/dim_content_type schema on the live database differs from `database/schema.sql` — stop coding, re-read the relevant section, and ask for clarification before continuing. Do not guess.

**End of plan.**
