# BrandPulse 2.0 - Cache Strategy Gap Analysis & Revised Plan

**Document Version:** 1.0  
**Date:** January 3, 2026  
**Purpose:** Critical evaluation of proposed cache architecture, identification of gaps, and practical solutions  
**Audience:** Development team, academic evaluators

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Gap Analysis](#2-gap-analysis)
   - [Gap 1: Atomicity Across Heterogeneous Databases](#gap-1-atomicity-across-heterogeneous-databases)
   - [Gap 2: Coverage Ignores Data Density](#gap-2-coverage-ignores-data-density)
   - [Gap 3: Undefined Minimum Thresholds](#gap-3-undefined-minimum-thresholds)
   - [Gap 4: Vague Silent Failure Detection](#gap-4-vague-silent-failure-detection)
   - [Gap 5: Normalization Complexity Explosion](#gap-5-normalization-complexity-explosion)
   - [Gap 6: Optimistic Rate-Limit Assumptions](#gap-6-optimistic-rate-limit-assumptions)
3. [Revised Architecture](#3-revised-architecture)
4. [Revised Implementation Plan](#4-revised-implementation-plan)
5. [Academic Defense Points](#5-academic-defense-points)
6. [Known Limitations (Explicit)](#6-known-limitations-explicit)

---

## 1. Executive Summary

### Original Plan Strengths
- Clear problem identification (API bottleneck, no reuse)
- Sensible three-pillar approach (pre-seed, cache-first, incremental)
- Good UI/UX considerations

### Critical Gaps Identified

| Gap | Severity | Root Cause |
|-----|----------|------------|
| 1. Atomicity illusion | 🔴 High | MongoDB + PostgreSQL cannot share transactions |
| 2. Coverage ≠ Density | 🟡 Medium | Date overlap ignores post distribution |
| 3. Undefined minimums | 🟡 Medium | No concrete calibration rules |
| 4. Vague failure detection | 🟡 Medium | Conceptual, not operational |
| 5. Normalization complexity | 🟠 Medium-High | Multiple overlapping strategies |
| 6. Optimistic rate limits | 🟡 Medium | Assumes ideal API behavior |

### Revised Approach
Replace theoretical atomicity with **explicit eventual consistency**, add **density-aware coverage**, define **concrete thresholds**, and implement **pragmatic failure handling** suitable for FYP scope.

---

## 2. Gap Analysis

---

### Gap 1: Atomicity Across Heterogeneous Databases

#### The Problem

**Original claim:**
> "Use DB transactions to ensure atomicity."

**Reality:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    THE ATOMICITY ILLUSION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   MongoDB (Bronze)          PostgreSQL (Silver + Gold)          │
│   ────────────────          ──────────────────────────          │
│                                                                 │
│   Transaction A             Transaction B                       │
│   (independent)             (independent)                       │
│                                                                 │
│   ❌ NO SHARED TRANSACTION BOUNDARY EXISTS                      │
│                                                                 │
│   If Bronze commits and Silver fails:                          │
│   • Bronze data exists (orphaned)                              │
│   • Silver is empty                                            │
│   • Gold is empty                                              │
│   • Cache metadata says "complete"? Or "failed"?               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Failure scenarios not addressed:**

| Scenario | Bronze | Silver | Gold | Cache Status | Problem |
|----------|--------|--------|------|--------------|---------|
| Full success | ✅ | ✅ | ✅ | complete | None |
| Silver fails mid-write | ✅ | ⚠️ Partial | ❌ | ? | Orphaned Bronze, partial Silver |
| Gold fails after Silver | ✅ | ✅ | ❌ | ? | Missing aggregates |
| Cache update fails | ✅ | ✅ | ✅ | ❌ | Data exists but invisible |

#### The Solution: Explicit Saga Pattern with Compensation

**Principle:** Accept that true atomicity is impossible. Design for **eventual consistency** with explicit **compensation logic**.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SAGA PATTERN FOR ETL                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   STEP 1: Create Pipeline Record                               │
│   ─────────────────────────────                                │
│   INSERT INTO pipeline_runs (                                   │
│     run_id, keyword, status, started_at                        │
│   ) VALUES (uuid, 'iPhone', 'STARTED', NOW())                  │
│                                                                 │
│   STEP 2: Bronze Layer                                         │
│   ───────────────────                                          │
│   TRY:                                                          │
│     Execute Bronze ETL                                         │
│     UPDATE pipeline_runs SET bronze_status = 'SUCCESS',        │
│       bronze_doc_count = X WHERE run_id = uuid                 │
│   CATCH:                                                        │
│     UPDATE pipeline_runs SET bronze_status = 'FAILED',         │
│       error_message = '...' WHERE run_id = uuid                │
│     STOP (no compensation needed - nothing to undo)            │
│                                                                 │
│   STEP 3: Silver Layer                                         │
│   ────────────────────                                         │
│   TRY:                                                          │
│     Execute Silver ETL                                         │
│     UPDATE pipeline_runs SET silver_status = 'SUCCESS',        │
│       silver_post_count = X, silver_comment_count = Y          │
│   CATCH:                                                        │
│     UPDATE pipeline_runs SET silver_status = 'FAILED'          │
│     COMPENSATE: Mark Bronze docs as "orphaned" for cleanup     │
│     STOP                                                        │
│                                                                 │
│   STEP 4: Gold Layer                                           │
│   ──────────────────                                           │
│   TRY:                                                          │
│     Execute Gold ETL                                           │
│     UPDATE pipeline_runs SET gold_status = 'SUCCESS',          │
│       gold_fact_count = X                                      │
│   CATCH:                                                        │
│     UPDATE pipeline_runs SET gold_status = 'FAILED'            │
│     COMPENSATE: Delete Silver rows for this run_id             │
│     COMPENSATE: Mark Bronze docs as "orphaned"                 │
│     STOP                                                        │
│                                                                 │
│   STEP 5: Update Cache Metadata                                │
│   ─────────────────────────────                                │
│   TRY:                                                          │
│     UPSERT keyword_cache with new date ranges                  │
│     UPDATE pipeline_runs SET cache_status = 'SUCCESS',         │
│       status = 'COMPLETED'                                     │
│   CATCH:                                                        │
│     UPDATE pipeline_runs SET cache_status = 'FAILED'           │
│     (Data exists but cache stale - recoverable via retry)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**New table: `pipeline_runs`**

```sql
CREATE TABLE pipeline_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    keyword_normalized TEXT NOT NULL,
    request_id INTEGER REFERENCES global_keywords(global_keyword_id),
    
    -- Overall status
    status TEXT NOT NULL DEFAULT 'STARTED',
    -- Values: STARTED, BRONZE_DONE, SILVER_DONE, GOLD_DONE, COMPLETED, FAILED
    
    -- Layer-specific tracking
    bronze_status TEXT DEFAULT 'PENDING',
    bronze_doc_count INTEGER DEFAULT 0,
    bronze_completed_at TIMESTAMPTZ,
    
    silver_status TEXT DEFAULT 'PENDING',
    silver_post_count INTEGER DEFAULT 0,
    silver_comment_count INTEGER DEFAULT 0,
    silver_completed_at TIMESTAMPTZ,
    
    gold_status TEXT DEFAULT 'PENDING',
    gold_fact_count INTEGER DEFAULT 0,
    gold_completed_at TIMESTAMPTZ,
    
    cache_status TEXT DEFAULT 'PENDING',
    
    -- Error tracking
    error_layer TEXT,  -- Which layer failed
    error_message TEXT,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- For retry logic
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX idx_pipeline_runs_keyword ON pipeline_runs(keyword_normalized);
```

**Cache metadata update rule:**

```
keyword_cache.processing_status = 'complete' 
  ONLY IF 
    pipeline_runs.status = 'COMPLETED'
    AND bronze_status = 'SUCCESS'
    AND silver_status = 'SUCCESS'
    AND gold_status = 'SUCCESS'
    AND cache_status = 'SUCCESS'
```

**Compensation job (runs every 5 minutes):**

```python
def cleanup_failed_runs():
    """
    Find failed pipeline runs and execute compensation logic.
    """
    
    # 1. Find runs stuck in intermediate states for > 10 minutes
    stuck_runs = db.query("""
        SELECT * FROM pipeline_runs 
        WHERE status NOT IN ('COMPLETED', 'FAILED')
        AND started_at < NOW() - INTERVAL '10 minutes'
    """)
    
    for run in stuck_runs:
        if run.gold_status == 'FAILED':
            # Delete Silver data for this run
            db.execute("""
                DELETE FROM silver_reddit_posts 
                WHERE global_keyword_id = %s
                AND processed_at_utc >= %s
            """, [run.request_id, run.started_at])
            
        if run.silver_status == 'FAILED' or run.gold_status == 'FAILED':
            # Mark Bronze docs as orphaned
            mongo.update_many(
                {'global_keyword_id': run.request_id, 'ingested_at': {'$gte': run.started_at}},
                {'$set': {'orphaned': True}}
            )
        
        # Mark run as failed
        db.execute("""
            UPDATE pipeline_runs 
            SET status = 'FAILED', error_message = 'Compensation executed'
            WHERE run_id = %s
        """, [run.run_id])
```

**Academic defense point:**

> "True distributed transactions across MongoDB and PostgreSQL would require a two-phase commit protocol, which neither database natively supports together. Instead, we implement a Saga pattern with explicit compensation logic, accepting eventual consistency as a practical trade-off. This is the industry-standard approach for heterogeneous database systems (as seen in microservices architectures)."

---

### Gap 2: Coverage Ignores Data Density

#### The Problem

**Original claim:**
> Coverage = overlap_days / requested_days × 100

**Flaw example:**

```
User requests: Jan 1 - Jan 15 (15 days)
Cache contains:
  - Jan 1: 0 posts
  - Jan 2: 0 posts
  - Jan 3: 0 posts
  - Jan 4: 0 posts
  - Jan 5: 0 posts
  - Jan 6: 0 posts
  - Jan 7: 0 posts
  - Jan 8: 0 posts
  - Jan 9: 0 posts
  - Jan 10: 0 posts
  - Jan 11: 0 posts
  - Jan 12: 0 posts
  - Jan 13: 0 posts
  - Jan 14: 500 posts (viral day!)
  - Jan 15: 0 posts

Date-based coverage: 15/15 = 100% ✅
Actual data coverage: 1/15 days have data = 7% ❌

Result: User sees "100% coverage" but data is from ONE day.
Sentiment analysis is NOT representative of the 15-day period.
```

#### The Solution: Density-Aware Coverage Score

**New metric: Weighted Coverage Score**

```
┌─────────────────────────────────────────────────────────────────┐
│                    COVERAGE SCORE FORMULA                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   coverage_score = (date_coverage × 0.4) +                     │
│                    (density_coverage × 0.4) +                  │
│                    (volume_score × 0.2)                        │
│                                                                 │
│   WHERE:                                                        │
│                                                                 │
│   date_coverage = overlap_days / requested_days                │
│                                                                 │
│   density_coverage = days_with_posts / overlap_days            │
│                                                                 │
│   volume_score = MIN(1.0, total_posts / volume_threshold)      │
│                  volume_threshold = 20 posts (configurable)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Example recalculation:**

```
User requests: Jan 1 - Jan 15 (15 days)
Cache: Jan 1-15 with 500 posts on Jan 14 only

date_coverage = 15/15 = 1.0 (100%)
density_coverage = 1/15 = 0.067 (6.7%)
volume_score = MIN(1.0, 500/20) = 1.0 (100%)

coverage_score = (1.0 × 0.4) + (0.067 × 0.4) + (1.0 × 0.2)
               = 0.4 + 0.027 + 0.2
               = 0.627 (62.7%)

User sees: "62.7% coverage - data concentrated on 1 day"
```

**SQL query for density calculation:**

```sql
-- Calculate density for a keyword and date range
SELECT 
    COUNT(DISTINCT DATE(created_at_utc)) as days_with_posts,
    COUNT(*) as total_posts,
    MIN(DATE(created_at_utc)) as actual_earliest,
    MAX(DATE(created_at_utc)) as actual_latest
FROM silver_reddit_posts
WHERE global_keyword_id = $1
AND created_at_utc BETWEEN $2 AND $3;
```

**Updated `keyword_cache` table:**

```sql
ALTER TABLE keyword_cache ADD COLUMN IF NOT EXISTS days_with_data INTEGER DEFAULT 0;
ALTER TABLE keyword_cache ADD COLUMN IF NOT EXISTS avg_posts_per_day NUMERIC(10,2) DEFAULT 0;
ALTER TABLE keyword_cache ADD COLUMN IF NOT EXISTS data_distribution_score NUMERIC(5,2) DEFAULT 0;
-- distribution_score: 1.0 = evenly distributed, 0.0 = all on one day
```

**UI display:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   📊 Coverage Analysis                                          │
│                                                                 │
│   Overall Score: ████████████░░░░░░░░  62.7%                   │
│                                                                 │
│   Breakdown:                                                    │
│   • Date Range: 100% (15 of 15 days)                           │
│   • Data Density: 6.7% (1 of 15 days have posts) ⚠️            │
│   • Volume: 100% (500 posts, threshold: 20)                    │
│                                                                 │
│   ⚠️ Warning: Data is concentrated on Jan 14.                   │
│      Results may not represent the full period.                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Gap 3: Undefined Minimum Thresholds

#### The Problem

**Original claim:**
> "counts >= expected_min (configurable)"

**Unanswered questions:**
- What is `expected_min`?
- Is it per keyword? Per day? Per platform?
- How was it calibrated?
- What happens when keyword is genuinely low-volume?

#### The Solution: Tiered Threshold System

**Principle:** Different keywords have different natural volumes. A niche brand shouldn't be held to iPhone standards.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIERED THRESHOLD SYSTEM                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   TIER 1: HIGH-VOLUME KEYWORDS                                  │
│   ─────────────────────────────                                │
│   Examples: iPhone, Nike, Tesla, Bitcoin                       │
│   Expected: >= 50 posts per crawl                              │
│   Min for cache validity: 20 posts                             │
│   Confidence label: "High volume"                              │
│                                                                 │
│   TIER 2: MEDIUM-VOLUME KEYWORDS                               │
│   ───────────────────────────────                              │
│   Examples: OnePlus, Puma, Lucid Motors                        │
│   Expected: 10-50 posts per crawl                              │
│   Min for cache validity: 5 posts                              │
│   Confidence label: "Medium volume"                            │
│                                                                 │
│   TIER 3: LOW-VOLUME KEYWORDS                                  │
│   ──────────────────────────────                               │
│   Examples: Niche brands, new products                         │
│   Expected: 1-10 posts per crawl                               │
│   Min for cache validity: 1 post                               │
│   Confidence label: "Low volume - limited data"                │
│                                                                 │
│   TIER 0: NO DATA                                              │
│   ────────────────                                             │
│   Expected: 0 posts                                            │
│   Action: Show "No data found" message                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Tier assignment logic:**

```sql
-- Assign tier based on historical average
CREATE OR REPLACE FUNCTION get_keyword_tier(p_keyword_normalized TEXT)
RETURNS TEXT AS $$
DECLARE
    avg_posts NUMERIC;
BEGIN
    SELECT COALESCE(AVG(bronze_doc_count), 0)
    INTO avg_posts
    FROM pipeline_runs
    WHERE keyword_normalized = p_keyword_normalized
    AND status = 'COMPLETED'
    AND started_at > NOW() - INTERVAL '30 days';
    
    IF avg_posts >= 50 THEN
        RETURN 'HIGH';
    ELSIF avg_posts >= 10 THEN
        RETURN 'MEDIUM';
    ELSIF avg_posts >= 1 THEN
        RETURN 'LOW';
    ELSE
        RETURN 'UNKNOWN';  -- New keyword, no history
    END IF;
END;
$$ LANGUAGE plpgsql;
```

**Validation thresholds (concrete values):**

| Check | Tier HIGH | Tier MEDIUM | Tier LOW | Tier UNKNOWN |
|-------|-----------|-------------|----------|--------------|
| Min posts for valid cache | 20 | 5 | 1 | 1 |
| Min days with data | 3 | 1 | 1 | 1 |
| Max staleness (hours) | 24 | 48 | 72 | 24 |
| Confidence label shown | ✅ High | ⚠️ Medium | ⚠️ Low | ⚠️ New keyword |

**UI confidence indicator:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Results for "iPhone"                                          │
│   📊 Confidence: HIGH (456 posts analyzed)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Results for "Rivian R2"                                       │
│   ⚠️ Confidence: LOW (8 posts analyzed)                         │
│   Note: Limited data available for this keyword.               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Gap 4: Vague Silent Failure Detection

#### The Problem

**Original claim:**
> "Checksums, reprocessing samples, verification jobs..."

**Unanswered questions:**
- How often do we verify?
- What's the performance cost?
- What's the failure threshold?
- What if verification itself fails?

#### The Solution: Pragmatic Verification Strategy

**Principle:** For FYP scope, implement lightweight, scheduled verification with clear operational rules.

```
┌─────────────────────────────────────────────────────────────────┐
│                VERIFICATION STRATEGY (FYP SCOPE)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LEVEL 1: INLINE CHECKS (Every pipeline run)                  │
│   ────────────────────────────────────────────                 │
│   Cost: ~50ms per run                                          │
│   Checks:                                                       │
│   • Silver post count > 0 (if Bronze had docs)                 │
│   • Gold fact count > 0 (if Silver had rows)                   │
│   • No NULL sentiment labels in Silver                         │
│   • Timestamps are within expected range                       │
│                                                                 │
│   LEVEL 2: DAILY CONSISTENCY CHECK (Scheduled job)             │
│   ────────────────────────────────────────────────             │
│   Cost: ~30 seconds once per day                               │
│   Checks:                                                       │
│   • Bronze doc count ≈ Silver post count (within 10%)          │
│   • Silver post count = Gold fact count (for posts)            │
│   • No orphaned Bronze docs older than 24 hours                │
│   • Cache metadata matches actual Silver counts                │
│                                                                 │
│   LEVEL 3: WEEKLY SAMPLE REPROCESSING (Optional)               │
│   ──────────────────────────────────────────────               │
│   Cost: ~10 minutes once per week                              │
│   Action:                                                       │
│   • Pick 5 random completed keywords                           │
│   • Re-run sentiment analysis on sample of posts               │
│   • Compare with stored sentiment labels                       │
│   • Flag if drift > 15%                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Inline verification function:**

```python
def verify_pipeline_run(run_id: str) -> dict:
    """
    Quick inline verification after pipeline completion.
    Returns: { valid: bool, errors: list[str] }
    """
    errors = []
    
    run = db.get_pipeline_run(run_id)
    
    # Check 1: If Bronze has docs, Silver should have posts
    if run.bronze_doc_count > 0 and run.silver_post_count == 0:
        errors.append(f"Bronze has {run.bronze_doc_count} docs but Silver has 0 posts")
    
    # Check 2: Counts should be within 20% (some filtering is expected)
    if run.bronze_doc_count > 0:
        ratio = run.silver_post_count / run.bronze_doc_count
        if ratio < 0.5:  # Less than 50% made it to Silver
            errors.append(f"High drop rate: {ratio:.1%} Bronze→Silver")
    
    # Check 3: Gold facts should exist if Silver posts exist
    if run.silver_post_count > 0 and run.gold_fact_count == 0:
        errors.append(f"Silver has {run.silver_post_count} posts but Gold has 0 facts")
    
    # Check 4: Verify no NULL sentiments in Silver
    null_count = db.query("""
        SELECT COUNT(*) FROM silver_reddit_posts 
        WHERE global_keyword_id = %s AND post_sentiment_label IS NULL
    """, [run.request_id])
    
    if null_count > 0:
        errors.append(f"{null_count} posts have NULL sentiment labels")
    
    return {
        'valid': len(errors) == 0,
        'errors': errors,
        'run_id': run_id
    }
```

**Daily consistency check (cron job):**

```python
def daily_consistency_check():
    """
    Run once per day via cron/scheduler.
    Logs results and sends alert if issues found.
    """
    issues = []
    
    # Check 1: Orphaned Bronze docs
    orphaned = mongo.count({
        'orphaned': {'$ne': True},
        'processed_to_silver': {'$ne': True},
        'ingested_at': {'$lt': datetime.now() - timedelta(hours=24)}
    })
    if orphaned > 0:
        issues.append(f"Found {orphaned} orphaned Bronze docs (>24h old)")
    
    # Check 2: Cache metadata vs actual counts
    mismatches = db.query("""
        SELECT kc.keyword, kc.total_posts as cache_posts,
               COUNT(sp.silver_post_id) as actual_posts
        FROM keyword_cache kc
        LEFT JOIN silver_reddit_posts sp 
            ON sp.global_keyword_id = (
                SELECT global_keyword_id FROM global_keywords 
                WHERE keyword = kc.keyword LIMIT 1
            )
        GROUP BY kc.cache_id, kc.keyword, kc.total_posts
        HAVING ABS(kc.total_posts - COUNT(sp.silver_post_id)) > kc.total_posts * 0.1
    """)
    
    for m in mismatches:
        issues.append(f"Cache mismatch for '{m.keyword}': cache={m.cache_posts}, actual={m.actual_posts}")
    
    # Log results
    log_verification_result({
        'timestamp': datetime.now(),
        'issues_found': len(issues),
        'issues': issues,
        'status': 'PASS' if len(issues) == 0 else 'FAIL'
    })
    
    # Alert if issues (for FYP: just log, in production: email/Slack)
    if issues:
        print(f"⚠️ Daily verification found {len(issues)} issues")
        for issue in issues:
            print(f"  - {issue}")
    
    return issues
```

**Concrete operational rules:**

| Rule | Value | Rationale |
|------|-------|-----------|
| Inline check timeout | 5 seconds | Fail fast, don't block pipeline |
| Daily check time | 03:00 AM | Low traffic period |
| Max orphaned docs age | 24 hours | Then mark for cleanup |
| Cache-actual mismatch threshold | 10% | Allows for filtering variance |
| Verification failure action | Log + mark keyword as `needs_review` | Don't auto-delete |

---

### Gap 5: Normalization Complexity Explosion

#### The Problem

**Original plan mixes:**
1. Regex normalization (lowercase, trim, special chars)
2. Synonym tables (PS5 → PlayStation 5)
3. Fuzzy matching (pg_trgm similarity)
4. Version migrations

**Risks:**
- Synonym resolution is NOT transitive: If A→B and B→C, does A→C?
- Fuzzy matching can merge unrelated brands: "Nike" matches "Mike"?
- Version migrations fragment cache history

#### The Solution: Strict Separation of Concerns

**Principle:** Do ONE thing well at each layer. Don't mix normalization strategies.

```
┌─────────────────────────────────────────────────────────────────┐
│               NORMALIZATION: SEPARATION OF CONCERNS             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   LAYER 1: DETERMINISTIC NORMALIZATION (Always applied)        │
│   ─────────────────────────────────────────────────────        │
│   Purpose: Create consistent cache keys                        │
│   Rules (in order):                                            │
│   1. Trim whitespace                                           │
│   2. Lowercase                                                 │
│   3. Remove punctuation except hyphens                         │
│   4. Collapse multiple spaces to single space                  │
│   5. Trim again                                                │
│                                                                 │
│   Example: "  iPhone 15 Pro!!! " → "iphone 15 pro"            │
│                                                                 │
│   THIS IS THE CACHE KEY. NOTHING ELSE.                         │
│                                                                 │
│   ─────────────────────────────────────────────────────────    │
│                                                                 │
│   LAYER 2: SYNONYM EXPANSION (Query-time only)                 │
│   ────────────────────────────────────────────                 │
│   Purpose: Find related cached data, NOT create cache keys     │
│   Rules:                                                        │
│   • Synonyms are ONE-WAY mappings                              │
│   • User input "PS5" → also search "playstation 5"            │
│   • Each keyword has its own cache entry                       │
│   • NO transitive resolution                                   │
│                                                                 │
│   Table: keyword_synonyms                                      │
│   | input    | also_search       |                             │
│   |----------|-------------------|                             │
│   | ps5      | playstation 5     |                             │
│   | ps5      | playstation 5 pro |                             │
│   | iphone   | apple iphone      |                             │
│                                                                 │
│   ─────────────────────────────────────────────────────────    │
│                                                                 │
│   LAYER 3: FUZZY SUGGESTIONS (UI only, never cache)            │
│   ─────────────────────────────────────────────────            │
│   Purpose: Help users find similar cached keywords             │
│   Rules:                                                        │
│   • Only shown when exact match not found                      │
│   • Minimum similarity threshold: 0.4 (40%)                    │
│   • Maximum suggestions: 5                                     │
│   • User must CLICK to use suggestion (no auto-merge)          │
│   • NEVER auto-merge cache entries                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Simplified synonym table (NO version tracking for FYP):**

```sql
CREATE TABLE keyword_synonyms (
    synonym_id SERIAL PRIMARY KEY,
    input_normalized TEXT NOT NULL,      -- What user might type
    also_search_normalized TEXT NOT NULL, -- Additional keyword to check
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(input_normalized, also_search_normalized)
);

-- Seed with common synonyms
INSERT INTO keyword_synonyms (input_normalized, also_search_normalized) VALUES
('ps5', 'playstation 5'),
('playstation 5', 'ps5'),
('xbox series x', 'xbox'),
('xbox', 'xbox series x'),
('iphone', 'apple iphone'),
('macbook', 'apple macbook'),
('ev', 'electric vehicle'),
('btc', 'bitcoin'),
('eth', 'ethereum');
```

**Query-time synonym expansion:**

```sql
-- Find cache entries for keyword + synonyms
SELECT DISTINCT kc.* 
FROM keyword_cache kc
WHERE kc.keyword_normalized = $1  -- Exact match
   OR kc.keyword_normalized IN (
       SELECT also_search_normalized 
       FROM keyword_synonyms 
       WHERE input_normalized = $1
   );
```

**Fuzzy matching constraints:**

```javascript
const FUZZY_CONFIG = {
    MIN_SIMILARITY: 0.4,      // 40% minimum
    MAX_SUGGESTIONS: 5,
    MIN_KEYWORD_LENGTH: 3,    // Don't fuzzy match short keywords
    EXCLUDED_PAIRS: [         // Known false positives
        ['nike', 'mike'],
        ['apple', 'ample'],
    ]
};

function getSimilarKeywords(normalized, limit = 5) {
    // Don't fuzzy match short keywords
    if (normalized.length < FUZZY_CONFIG.MIN_KEYWORD_LENGTH) {
        return [];
    }
    
    const results = db.query(`
        SELECT keyword, keyword_normalized,
               similarity(keyword_normalized, $1) as score
        FROM keyword_cache
        WHERE similarity(keyword_normalized, $1) >= $2
        AND keyword_normalized != $1
        ORDER BY similarity(keyword_normalized, $1) DESC
        LIMIT $3
    `, [normalized, FUZZY_CONFIG.MIN_SIMILARITY, limit]);
    
    // Filter known false positives
    return results.filter(r => 
        !FUZZY_CONFIG.EXCLUDED_PAIRS.some(([a, b]) => 
            (normalized === a && r.keyword_normalized === b) ||
            (normalized === b && r.keyword_normalized === a)
        )
    );
}
```

---

### Gap 6: Optimistic Rate-Limit Assumptions

#### The Problem

**Original assumptions:**
- 60 requests/minute sustained
- Predictable crawl times
- Linear scaling with workers

**Reality:**
- Reddit enforces burst limits (may block after 10 rapid requests)
- Penalizes concurrent IPs from same network
- Throttles unpredictably during high traffic
- May return partial results under load

#### The Solution: Defensive Rate Limiting with Circuit Breaker

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEFENSIVE RATE LIMITING                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   STRATEGY 1: CONSERVATIVE BASELINE                            │
│   ─────────────────────────────────                            │
│   Instead of: 60 req/min (theoretical max)                     │
│   Use: 30 req/min (50% of limit)                               │
│   Delay between requests: 2 seconds (not 1)                    │
│                                                                 │
│   STRATEGY 2: ADAPTIVE BACKOFF                                 │
│   ────────────────────────────                                 │
│   On HTTP 429 (rate limited):                                  │
│   • Immediate: Wait Retry-After header (or 60 seconds)         │
│   • Reduce rate by 50% for next 10 minutes                     │
│   • Log incident for monitoring                                │
│                                                                 │
│   On HTTP 5xx (server error):                                  │
│   • Wait 30 seconds                                            │
│   • Retry up to 3 times                                        │
│   • Then skip keyword, mark for later retry                    │
│                                                                 │
│   STRATEGY 3: CIRCUIT BREAKER                                  │
│   ───────────────────────────                                  │
│   States: CLOSED (normal) → OPEN (blocked) → HALF-OPEN (test) │
│                                                                 │
│   CLOSED → OPEN: 5 failures in 2 minutes                       │
│   OPEN duration: 5 minutes (no requests)                       │
│   OPEN → HALF-OPEN: After 5 minutes, try 1 request             │
│   HALF-OPEN → CLOSED: Success → resume normal                  │
│   HALF-OPEN → OPEN: Failure → wait another 5 minutes           │
│                                                                 │
│   STRATEGY 4: DAILY BUDGET                                     │
│   ────────────────────────                                     │
│   Max requests per day: 20,000 (conservative)                  │
│   Tracked in: api_usage_log table                              │
│   When budget exhausted: Stop crawler, resume tomorrow         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Circuit breaker implementation:**

```python
class CircuitBreaker:
    def __init__(self):
        self.state = 'CLOSED'
        self.failure_count = 0
        self.failure_window_start = None
        self.open_until = None
        
        # Configuration
        self.FAILURE_THRESHOLD = 5
        self.FAILURE_WINDOW_SECONDS = 120  # 2 minutes
        self.OPEN_DURATION_SECONDS = 300   # 5 minutes
    
    def can_proceed(self) -> bool:
        if self.state == 'CLOSED':
            return True
        
        if self.state == 'OPEN':
            if datetime.now() >= self.open_until:
                self.state = 'HALF_OPEN'
                return True
            return False
        
        if self.state == 'HALF_OPEN':
            return True  # Allow one test request
        
        return False
    
    def record_success(self):
        if self.state == 'HALF_OPEN':
            self.state = 'CLOSED'
        self.failure_count = 0
        self.failure_window_start = None
    
    def record_failure(self):
        now = datetime.now()
        
        # Reset window if expired
        if self.failure_window_start and \
           (now - self.failure_window_start).seconds > self.FAILURE_WINDOW_SECONDS:
            self.failure_count = 0
            self.failure_window_start = now
        
        if not self.failure_window_start:
            self.failure_window_start = now
        
        self.failure_count += 1
        
        if self.failure_count >= self.FAILURE_THRESHOLD:
            self.state = 'OPEN'
            self.open_until = now + timedelta(seconds=self.OPEN_DURATION_SECONDS)
            print(f"⚠️ Circuit breaker OPEN until {self.open_until}")
        
        if self.state == 'HALF_OPEN':
            self.state = 'OPEN'
            self.open_until = now + timedelta(seconds=self.OPEN_DURATION_SECONDS)
```

**Daily budget tracking:**

```sql
CREATE TABLE api_usage_log (
    log_id SERIAL PRIMARY KEY,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    platform TEXT NOT NULL DEFAULT 'reddit',
    request_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    rate_limit_hits INTEGER DEFAULT 0,
    
    UNIQUE(log_date, platform)
);

-- Upsert on each API call
INSERT INTO api_usage_log (log_date, platform, request_count)
VALUES (CURRENT_DATE, 'reddit', 1)
ON CONFLICT (log_date, platform)
DO UPDATE SET request_count = api_usage_log.request_count + 1;

-- Check budget
SELECT request_count < 20000 as budget_available
FROM api_usage_log
WHERE log_date = CURRENT_DATE AND platform = 'reddit';
```

**Revised crawler with defensive measures:**

```python
class DefensiveCrawler:
    def __init__(self):
        self.circuit_breaker = CircuitBreaker()
        self.base_delay = 2.0  # seconds
        self.current_delay = self.base_delay
        self.daily_budget = 20000
    
    def crawl_keyword(self, keyword):
        # Check circuit breaker
        if not self.circuit_breaker.can_proceed():
            print(f"⏸️ Circuit breaker OPEN, skipping {keyword}")
            return None
        
        # Check daily budget
        if not self.has_budget():
            print(f"💰 Daily budget exhausted, stopping crawler")
            return None
        
        try:
            # Make request with current delay
            time.sleep(self.current_delay)
            result = self.fetch_from_reddit(keyword)
            
            # Success - record and potentially speed up
            self.circuit_breaker.record_success()
            self.current_delay = max(self.base_delay, self.current_delay * 0.9)
            
            return result
            
        except RateLimitError as e:
            # Rate limited - back off significantly
            self.circuit_breaker.record_failure()
            self.current_delay = min(60, self.current_delay * 2)
            retry_after = e.retry_after or 60
            print(f"⚠️ Rate limited, waiting {retry_after}s")
            time.sleep(retry_after)
            return None
            
        except ServerError as e:
            # Server error - moderate backoff
            self.circuit_breaker.record_failure()
            self.current_delay = min(30, self.current_delay * 1.5)
            return None
    
    def has_budget(self):
        result = db.query("""
            SELECT COALESCE(request_count, 0) < %s as available
            FROM api_usage_log
            WHERE log_date = CURRENT_DATE AND platform = 'reddit'
        """, [self.daily_budget])
        return result[0]['available'] if result else True
```

---

## 3. Revised Architecture

### Updated Data Flow with Gap Fixes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         REVISED ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   USER REQUEST                                                               │
│   ────────────                                                              │
│   Keyword: "PS5"                                                            │
│   Date Range: Jan 1-15, 2026                                                │
│                                                                              │
│                           │                                                  │
│                           ▼                                                  │
│                                                                              │
│   STEP 1: NORMALIZE (Deterministic only)                                    │
│   ───────────────────────────────────────                                   │
│   "PS5" → "ps5" (cache key)                                                │
│                                                                              │
│                           │                                                  │
│                           ▼                                                  │
│                                                                              │
│   STEP 2: CHECK CACHE + SYNONYMS                                            │
│   ──────────────────────────────                                            │
│   Search for: "ps5" AND synonyms ("playstation 5")                         │
│   Found: "ps5" (45 posts), "playstation 5" (120 posts)                     │
│                                                                              │
│                           │                                                  │
│                           ▼                                                  │
│                                                                              │
│   STEP 3: CALCULATE DENSITY-AWARE COVERAGE                                  │
│   ─────────────────────────────────────────                                 │
│   For "ps5":                                                                │
│     date_coverage = 100%                                                    │
│     density_coverage = 60% (9 of 15 days)                                  │
│     volume_score = 100% (45 posts)                                         │
│     TOTAL = 0.4(1.0) + 0.4(0.6) + 0.2(1.0) = 84%                          │
│                                                                              │
│                           │                                                  │
│                           ▼                                                  │
│                                                                              │
│   STEP 4: DECISION WITH TIER AWARENESS                                      │
│   ────────────────────────────────────                                      │
│   Keyword tier: MEDIUM (avg 30 posts)                                       │
│   Min threshold: 5 posts ✅                                                  │
│   Coverage: 84% ✅                                                           │
│   → CACHE HIT                                                               │
│                                                                              │
│                           │                                                  │
│                           ▼                                                  │
│                                                                              │
│   STEP 5: RETURN WITH CONFIDENCE INDICATORS                                 │
│   ─────────────────────────────────────────                                 │
│   {                                                                          │
│     status: "CACHE_HIT",                                                    │
│     coverage_score: 84,                                                     │
│     confidence: "MEDIUM",                                                   │
│     density_warning: null,  // 60% is acceptable                           │
│     data: { ... }                                                           │
│   }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                      REVISED PIPELINE (Saga Pattern)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   TRIGGER: Cache miss or force refresh                                      │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 1. CREATE pipeline_runs RECORD (status = 'STARTED')                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 2. BRONZE LAYER                                                      │   │
│   │    • Check circuit breaker                                          │   │
│   │    • Check daily budget                                             │   │
│   │    • Fetch with defensive rate limiting                             │   │
│   │    • Store in MongoDB                                               │   │
│   │    • UPDATE pipeline_runs (bronze_status = 'SUCCESS')               │   │
│   │                                                                      │   │
│   │    ON FAILURE:                                                      │   │
│   │    • UPDATE pipeline_runs (bronze_status = 'FAILED')                │   │
│   │    • STOP (nothing to compensate)                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 3. SILVER LAYER                                                      │   │
│   │    • Clean text                                                     │   │
│   │    • Run sentiment analysis                                         │   │
│   │    • Store in PostgreSQL                                            │   │
│   │    • INLINE VERIFY: No NULL sentiments                              │   │
│   │    • UPDATE pipeline_runs (silver_status = 'SUCCESS')               │   │
│   │                                                                      │   │
│   │    ON FAILURE:                                                      │   │
│   │    • UPDATE pipeline_runs (silver_status = 'FAILED')                │   │
│   │    • COMPENSATE: Mark Bronze docs as orphaned                       │   │
│   │    • STOP                                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 4. GOLD LAYER                                                        │   │
│   │    • Aggregate facts                                                │   │
│   │    • INLINE VERIFY: Fact count matches Silver                       │   │
│   │    • UPDATE pipeline_runs (gold_status = 'SUCCESS')                 │   │
│   │                                                                      │   │
│   │    ON FAILURE:                                                      │   │
│   │    • UPDATE pipeline_runs (gold_status = 'FAILED')                  │   │
│   │    • COMPENSATE: Delete Silver rows for this run                    │   │
│   │    • COMPENSATE: Mark Bronze docs as orphaned                       │   │
│   │    • STOP                                                           │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                  │
│                           ▼                                                  │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 5. UPDATE CACHE METADATA                                             │   │
│   │    • Calculate density metrics                                      │   │
│   │    • Update date ranges                                             │   │
│   │    • Set processing_status = 'complete'                             │   │
│   │    • UPDATE pipeline_runs (status = 'COMPLETED')                    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Revised Implementation Plan

### Phase 0: Database Foundation (45 minutes)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 0.1 | Create `pipeline_runs` table | Gap 1 (Saga tracking) |
| 0.2 | Create `api_usage_log` table | Gap 6 (Budget tracking) |
| 0.3 | Add density columns to `keyword_cache` | Gap 2 (Density) |
| 0.4 | Create `keyword_synonyms` table | Gap 5 (Simplified synonyms) |
| 0.5 | Add tier-related columns | Gap 3 (Tiered thresholds) |

### Phase 1: Normalization Module (20 minutes)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 1.1 | Create deterministic-only normalizer (JS) | Gap 5 |
| 1.2 | Create deterministic-only normalizer (Python) | Gap 5 |
| 1.3 | Test for consistency | Gap 5 |
| 1.4 | NO synonym resolution in normalizer | Gap 5 |

### Phase 2: Backend API with Gap Fixes (2 hours)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 2.1 | Implement density-aware coverage calculation | Gap 2 |
| 2.2 | Implement tiered threshold system | Gap 3 |
| 2.3 | Add synonym expansion at query time | Gap 5 |
| 2.4 | Add confidence indicators to response | Gap 3 |
| 2.5 | Implement saga orchestrator | Gap 1 |
| 2.6 | Add inline verification | Gap 4 |

### Phase 3: Crawler with Defensive Measures (1 hour)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 3.1 | Implement circuit breaker | Gap 6 |
| 3.2 | Implement adaptive backoff | Gap 6 |
| 3.3 | Implement daily budget check | Gap 6 |
| 3.4 | Add compensation logic | Gap 1 |
| 3.5 | Add pipeline_runs updates | Gap 1 |

### Phase 4: Verification Jobs (30 minutes)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 4.1 | Create inline verification function | Gap 4 |
| 4.2 | Create daily consistency check job | Gap 4 |
| 4.3 | Create compensation cleanup job | Gap 1 |

### Phase 5: Frontend Updates (1 hour)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 5.1 | Add density-aware coverage display | Gap 2 |
| 5.2 | Add confidence tier indicators | Gap 3 |
| 5.3 | Add density warnings | Gap 2 |
| 5.4 | Show synonym-expanded results | Gap 5 |

### Phase 6: Testing & Validation (1 hour)

| Task | Description | Gap Addressed |
|------|-------------|---------------|
| 6.1 | Test saga pattern failure scenarios | Gap 1 |
| 6.2 | Test coverage calculation edge cases | Gap 2 |
| 6.3 | Test circuit breaker behavior | Gap 6 |
| 6.4 | Document known limitations | All |

---

## 5. Academic Defense Points

### When Evaluator Says: "This can't be truly atomic"

**Response:**
> "Correct. True distributed transactions across MongoDB and PostgreSQL would require XA protocol or a distributed transaction coordinator, which adds significant complexity and latency. Instead, we implement a Saga pattern with explicit compensation logic. This is the industry-standard approach for microservices (as documented by Chris Richardson in 'Microservices Patterns'). We trade theoretical atomicity for practical eventual consistency with clear failure handling. The `pipeline_runs` table provides full audit trail and enables automated recovery."

### When Evaluator Says: "Coverage metric is misleading"

**Response:**
> "We identified this limitation and implemented a three-component coverage score: date overlap (40%), data density (40%), and volume (20%). The UI explicitly warns users when data is concentrated on few days. This is more informative than a simple date-range percentage. See the density_warning field in our API response."

### When Evaluator Says: "How do you handle partial failures?"

**Response:**
> "Each pipeline run is tracked in `pipeline_runs` with per-layer status. On failure, we execute compensation: Silver failure marks Bronze as orphaned; Gold failure deletes Silver rows. A scheduled cleanup job handles stuck runs. This is explicit eventual consistency, not hidden failure."

### When Evaluator Says: "Rate limiting seems optimistic"

**Response:**
> "We use 50% of theoretical limit (30 req/min vs 60), implement circuit breaker pattern (5 failures in 2 min → 5 min pause), adaptive backoff (double delay on 429), and daily budget cap (20,000 requests). The system degrades gracefully rather than failing catastrophically."

---

## 6. Known Limitations (Explicit)

### Limitation 1: No True Atomicity
**What:** Cannot guarantee atomic transactions across MongoDB + PostgreSQL.  
**Why accepted:** Would require distributed transaction coordinator (e.g., Saga orchestrator service), adding significant complexity beyond FYP scope.  
**Mitigation:** Saga pattern with compensation logic provides practical consistency.

### Limitation 2: Synonym Resolution is Limited
**What:** Only supports explicit one-to-one mappings, no transitive resolution.  
**Why accepted:** Transitive synonyms (A→B→C) require graph traversal and can create unexpected merges.  
**Mitigation:** Manual curation of synonym table; fuzzy matching as user-facing suggestions only.

### Limitation 3: Historical Data is Bounded
**What:** Cannot retrieve Reddit data older than what API returns (typically 7 days per crawl).  
**Why accepted:** Reddit API limitation, not system limitation.  
**Mitigation:** Daily crawler accumulates historical data over time; UI clearly shows available date range.

### Limitation 4: Density Calculation is Approximate
**What:** Uses day-level granularity, not hour-level.  
**Why accepted:** Hour-level would require more storage and computation.  
**Mitigation:** Day-level is sufficient for most sentiment analysis use cases.

### Limitation 5: Rate Limit Behavior is Unpredictable
**What:** Reddit may throttle unpredictably despite staying under limits.  
**Why accepted:** Cannot control external API behavior.  
**Mitigation:** Circuit breaker + adaptive backoff + graceful degradation.

### Limitation 6: Single Crawler Instance
**What:** No horizontal scaling of crawler.  
**Why accepted:** Would require distributed queue (Redis/RabbitMQ), adding infrastructure complexity.  
**Mitigation:** Single instance with defensive rate limiting is sufficient for FYP scale (~50 keywords/day).

---

## Summary of Changes from Original Plan

| Aspect | Original | Revised |
|--------|----------|---------|
| Atomicity | "Use DB transactions" | Saga pattern with compensation |
| Coverage | Date overlap only | Density-aware 3-component score |
| Thresholds | "Configurable" | Tiered system with concrete values |
| Verification | Vague "checksums" | Inline + daily checks with rules |
| Normalization | Mixed strategies | Strict separation (normalize vs synonym vs fuzzy) |
| Rate limiting | 60 req/min assumed | 30 req/min + circuit breaker + budget |

---

**Document End**
