# BrandPulse 2.0 - Revised Implementation Plan

**Document Version:** 1.0  
**Date:** January 3, 2026  
**Status:** Ready for Implementation  
**Based on:** CACHE_STRATEGY_GAP_ANALYSIS.md

---

## Table of Contents

1. [Implementation Overview](#1-implementation-overview)
2. [Phase 0: Database Foundation](#2-phase-0-database-foundation)
3. [Phase 1: Normalization Module](#3-phase-1-normalization-module)
4. [Phase 2: Backend API Updates](#4-phase-2-backend-api-updates)
5. [Phase 3: Defensive Crawler](#5-phase-3-defensive-crawler)
6. [Phase 4: Verification Jobs](#6-phase-4-verification-jobs)
7. [Phase 5: Frontend Updates](#7-phase-5-frontend-updates)
8. [Phase 6: Testing & Validation](#8-phase-6-testing--validation)
9. [Execution Schedule](#9-execution-schedule)
10. [File Inventory](#10-file-inventory)
11. [Rollback Plan](#11-rollback-plan)

---

## 1. Implementation Overview

### 1.1 Goals

| Goal | Success Criteria |
|------|------------------|
| Cache-first queries | < 100ms response for cached keywords |
| Density-aware coverage | Coverage score reflects actual data distribution |
| Explicit failure handling | Every failure is tracked and recoverable |
| Defensive rate limiting | No API bans, graceful degradation |
| Consistent normalization | JS, Python, SQL produce identical cache keys |

### 1.2 Total Effort

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Database | 45 min | None |
| Phase 1: Normalization | 20 min | Phase 0 |
| Phase 2: Backend API | 2 hours | Phases 0, 1 |
| Phase 3: Crawler | 1 hour | Phases 0, 1 |
| Phase 4: Verification | 30 min | Phases 2, 3 |
| Phase 5: Frontend | 1 hour | Phase 2 |
| Phase 6: Testing | 1 hour | All phases |
| **Total Active Work** | **~7 hours** | |
| Initial Data Population | 2-3 hours (background) | Phase 3 |

### 1.3 Dependency Graph

```
Phase 0 (Database)
    │
    ├──────────────────┐
    ▼                  ▼
Phase 1             Phase 1
(Normalize JS)      (Normalize Python)
    │                  │
    ▼                  ▼
Phase 2             Phase 3
(Backend API)       (Crawler)
    │                  │
    ├──────────────────┤
    ▼                  ▼
Phase 4             Phase 4
(Verification)      (Verification)
    │
    ▼
Phase 5
(Frontend)
    │
    ▼
Phase 6
(Testing)
```

---

## 2. Phase 0: Database Foundation

**Duration:** 45 minutes  
**Dependencies:** None  
**Deliverable:** SQL migration file + executed tables

### 2.1 Tasks

| Task ID | Task | Description | Gap Addressed |
|---------|------|-------------|---------------|
| 0.1 | Create `pipeline_runs` table | Saga pattern tracking | Gap 1 |
| 0.2 | Create `api_usage_log` table | Daily budget tracking | Gap 6 |
| 0.3 | Create `keyword_cache` table | With density columns | Gap 2 |
| 0.4 | Create `keyword_categories` table | Organize keywords | - |
| 0.5 | Create `seed_keywords` table | Pre-defined keywords | - |
| 0.6 | Create `keyword_synonyms` table | Simple synonym mapping | Gap 5 |
| 0.7 | Enable `pg_trgm` extension | Fuzzy matching | - |
| 0.8 | Create `normalize_keyword()` function | SQL normalization | Gap 5 |
| 0.9 | Create `get_keyword_tier()` function | Tier assignment | Gap 3 |
| 0.10 | Insert seed data | Categories + keywords | - |

### 2.2 SQL Migration File

**File:** `sql/001_cache_foundation.sql`

```sql
-- ============================================================
-- PHASE 0: DATABASE FOUNDATION
-- BrandPulse 2.0 Cache-First Architecture
-- Run this migration once against your PostgreSQL database
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: pipeline_runs (Saga Pattern Tracking)
-- Addresses Gap 1: Atomicity
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_runs (
    run_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword TEXT NOT NULL,
    keyword_normalized TEXT NOT NULL,
    request_id INTEGER,  -- References global_keywords if exists
    
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
    error_layer TEXT,
    error_message TEXT,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    
    -- Source tracking
    source TEXT DEFAULT 'user'  -- 'user', 'seed', 'refresh'
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_keyword ON pipeline_runs(keyword_normalized);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at);

-- ============================================================
-- TABLE: api_usage_log (Rate Limit Budget)
-- Addresses Gap 6: Rate Limiting
-- ============================================================
CREATE TABLE IF NOT EXISTS api_usage_log (
    log_id SERIAL PRIMARY KEY,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    platform TEXT NOT NULL DEFAULT 'reddit',
    request_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    rate_limit_hits INTEGER DEFAULT 0,
    
    UNIQUE(log_date, platform)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage_log(log_date);

-- ============================================================
-- TABLE: keyword_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS keyword_categories (
    category_id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default categories
INSERT INTO keyword_categories (name, description, icon) VALUES
('Technology', 'Tech brands, gadgets, software, AI', '💻'),
('Fashion & Apparel', 'Clothing, sportswear, luxury brands', '👕'),
('Automotive', 'Car manufacturers, EVs, motorcycles', '🚗'),
('Entertainment', 'Streaming, gaming, movies, music', '🎮'),
('E-commerce', 'Online marketplaces, retail', '🛒'),
('Finance', 'Banks, crypto, fintech, trading', '💰'),
('Food & Beverage', 'Restaurants, drinks, snacks', '🍔'),
('Social Media', 'Platforms, apps, networks', '📱')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- TABLE: seed_keywords
-- ============================================================
CREATE TABLE IF NOT EXISTS seed_keywords (
    seed_id SERIAL PRIMARY KEY,
    keyword TEXT UNIQUE NOT NULL,
    category_id INTEGER REFERENCES keyword_categories(category_id),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    is_active BOOLEAN DEFAULT TRUE,
    crawl_frequency_hours INTEGER DEFAULT 24,
    last_crawled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seed_keywords_priority ON seed_keywords(priority DESC);
CREATE INDEX IF NOT EXISTS idx_seed_keywords_active ON seed_keywords(is_active) WHERE is_active = TRUE;

-- Insert seed keywords
-- Technology (category_id = 1)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('iPhone', 1, 10),
('iPhone 15', 1, 9),
('iPhone 16', 1, 10),
('Samsung Galaxy', 1, 10),
('Google Pixel', 1, 8),
('MacBook', 1, 8),
('MacBook Pro', 1, 8),
('iPad', 1, 7),
('Apple Watch', 1, 7),
('AirPods', 1, 7),
('PlayStation 5', 1, 9),
('PS5', 1, 9),
('Xbox Series X', 1, 9),
('Nintendo Switch', 1, 8),
('Steam Deck', 1, 7),
('Windows 11', 1, 6),
('ChatGPT', 1, 10),
('Claude AI', 1, 8),
('Nvidia RTX', 1, 8),
('AMD Ryzen', 1, 7),
('Meta Quest', 1, 7),
('Apple Vision Pro', 1, 8)
ON CONFLICT (keyword) DO NOTHING;

-- Fashion (category_id = 2)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('Nike', 2, 10),
('Adidas', 2, 10),
('Puma', 2, 7),
('Lululemon', 2, 7),
('Zara', 2, 6),
('H&M', 2, 6),
('Uniqlo', 2, 6),
('Supreme', 2, 7),
('Jordan sneakers', 2, 8),
('Yeezy', 2, 7)
ON CONFLICT (keyword) DO NOTHING;

-- Automotive (category_id = 3)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('Tesla', 3, 10),
('Tesla Model 3', 3, 8),
('Tesla Model Y', 3, 8),
('Cybertruck', 3, 9),
('BMW', 3, 7),
('Mercedes', 3, 7),
('Toyota', 3, 6),
('Ford F-150', 3, 6),
('Rivian', 3, 8),
('Lucid Motors', 3, 7)
ON CONFLICT (keyword) DO NOTHING;

-- Entertainment (category_id = 4)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('Netflix', 4, 9),
('Disney Plus', 4, 8),
('Spotify', 4, 8),
('HBO Max', 4, 7),
('YouTube Premium', 4, 6),
('Twitch', 4, 7),
('Steam', 4, 8)
ON CONFLICT (keyword) DO NOTHING;

-- E-commerce (category_id = 5)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('Amazon', 5, 9),
('Amazon Prime', 5, 8),
('Temu', 5, 9),
('Shein', 5, 8),
('AliExpress', 5, 6),
('Walmart', 5, 6)
ON CONFLICT (keyword) DO NOTHING;

-- Finance (category_id = 6)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('Bitcoin', 6, 10),
('Ethereum', 6, 9),
('Robinhood', 6, 7),
('Coinbase', 6, 7),
('PayPal', 6, 6)
ON CONFLICT (keyword) DO NOTHING;

-- Social Media (category_id = 8)
INSERT INTO seed_keywords (keyword, category_id, priority) VALUES
('TikTok', 8, 10),
('Instagram', 8, 9),
('Twitter', 8, 9),
('Reddit', 8, 8),
('Snapchat', 8, 6),
('Threads', 8, 7)
ON CONFLICT (keyword) DO NOTHING;

-- ============================================================
-- TABLE: keyword_cache (Core Cache Metadata)
-- Addresses Gap 2: Density-aware coverage
-- ============================================================
CREATE TABLE IF NOT EXISTS keyword_cache (
    cache_id SERIAL PRIMARY KEY,
    keyword TEXT NOT NULL,
    keyword_normalized TEXT NOT NULL,
    platform_id INTEGER DEFAULT 1,  -- 1 = Reddit
    
    -- Volume metrics
    total_posts INTEGER DEFAULT 0,
    total_comments INTEGER DEFAULT 0,
    
    -- Date coverage
    earliest_post_date DATE,
    latest_post_date DATE,
    date_coverage_days INTEGER DEFAULT 0,
    
    -- Density metrics (Gap 2)
    days_with_data INTEGER DEFAULT 0,
    avg_posts_per_day NUMERIC(10, 2) DEFAULT 0,
    data_distribution_score NUMERIC(5, 2) DEFAULT 0,
    -- distribution_score: 1.0 = evenly distributed, 0.0 = all on one day
    
    -- Processing status (Gap 1)
    processing_status TEXT DEFAULT 'pending',
    -- Values: pending, processing, complete, failed, needs_review
    last_run_id UUID,  -- References pipeline_runs
    
    -- Tier assignment (Gap 3)
    volume_tier TEXT DEFAULT 'UNKNOWN',
    -- Values: HIGH, MEDIUM, LOW, UNKNOWN
    
    -- Freshness tracking
    last_ingested_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    refresh_priority INTEGER DEFAULT 0,
    
    -- Metadata
    source TEXT DEFAULT 'user',  -- 'seed', 'user', 'trending'
    category_id INTEGER REFERENCES keyword_categories(category_id),
    is_stale BOOLEAN DEFAULT FALSE,
    
    UNIQUE(keyword_normalized, platform_id)
);

CREATE INDEX IF NOT EXISTS idx_keyword_cache_normalized ON keyword_cache(keyword_normalized);
CREATE INDEX IF NOT EXISTS idx_keyword_cache_status ON keyword_cache(processing_status);
CREATE INDEX IF NOT EXISTS idx_keyword_cache_stale ON keyword_cache(is_stale) WHERE is_stale = TRUE;

-- ============================================================
-- TABLE: keyword_synonyms (Simple Synonym Mapping)
-- Addresses Gap 5: Normalization complexity
-- ============================================================
CREATE TABLE IF NOT EXISTS keyword_synonyms (
    synonym_id SERIAL PRIMARY KEY,
    input_normalized TEXT NOT NULL,
    also_search_normalized TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(input_normalized, also_search_normalized)
);

-- Insert common synonyms (bidirectional)
INSERT INTO keyword_synonyms (input_normalized, also_search_normalized) VALUES
('ps5', 'playstation 5'),
('playstation 5', 'ps5'),
('xbox', 'xbox series x'),
('xbox series x', 'xbox'),
('iphone', 'apple iphone'),
('macbook', 'apple macbook'),
('ev', 'electric vehicle'),
('electric vehicle', 'ev'),
('btc', 'bitcoin'),
('bitcoin', 'btc'),
('eth', 'ethereum'),
('ethereum', 'eth'),
('ai', 'artificial intelligence'),
('chatgpt', 'openai chatgpt'),
('gpt', 'chatgpt')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FUNCTION: normalize_keyword (Deterministic)
-- Addresses Gap 5: Single source of truth
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_keyword(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    IF input_text IS NULL THEN
        RETURN '';
    END IF;
    
    RETURN TRIM(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                LOWER(TRIM(input_text)),
                '[^a-z0-9\s\-]', '', 'g'  -- Remove special chars except hyphen
            ),
            '\s+', ' ', 'g'  -- Collapse multiple spaces
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- FUNCTION: get_keyword_tier (Tier Assignment)
-- Addresses Gap 3: Tiered thresholds
-- ============================================================
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
        RETURN 'UNKNOWN';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: calculate_density_score
-- Addresses Gap 2: Density-aware coverage
-- ============================================================
CREATE OR REPLACE FUNCTION calculate_density_score(
    p_keyword_id INTEGER,
    p_date_from DATE,
    p_date_to DATE
)
RETURNS TABLE (
    date_coverage NUMERIC,
    density_coverage NUMERIC,
    volume_score NUMERIC,
    total_score NUMERIC,
    days_requested INTEGER,
    days_with_posts INTEGER,
    total_posts_in_range INTEGER
) AS $$
DECLARE
    v_days_requested INTEGER;
    v_earliest DATE;
    v_latest DATE;
    v_overlap_start DATE;
    v_overlap_end DATE;
    v_overlap_days INTEGER;
    v_days_with_posts INTEGER;
    v_total_posts INTEGER;
    v_volume_threshold INTEGER := 20;
BEGIN
    v_days_requested := p_date_to - p_date_from + 1;
    
    -- Get cache date range
    SELECT earliest_post_date, latest_post_date
    INTO v_earliest, v_latest
    FROM keyword_cache kc
    JOIN global_keywords gk ON normalize_keyword(gk.keyword) = kc.keyword_normalized
    WHERE gk.global_keyword_id = p_keyword_id
    LIMIT 1;
    
    IF v_earliest IS NULL THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, v_days_requested, 0, 0;
        RETURN;
    END IF;
    
    -- Calculate overlap
    v_overlap_start := GREATEST(p_date_from, v_earliest);
    v_overlap_end := LEAST(p_date_to, v_latest);
    
    IF v_overlap_start > v_overlap_end THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, v_days_requested, 0, 0;
        RETURN;
    END IF;
    
    v_overlap_days := v_overlap_end - v_overlap_start + 1;
    
    -- Get density metrics
    SELECT 
        COUNT(DISTINCT DATE(created_at_utc)),
        COUNT(*)
    INTO v_days_with_posts, v_total_posts
    FROM silver_reddit_posts
    WHERE global_keyword_id = p_keyword_id
    AND created_at_utc BETWEEN p_date_from AND p_date_to + INTERVAL '1 day';
    
    -- Calculate scores
    RETURN QUERY SELECT
        (v_overlap_days::NUMERIC / v_days_requested) AS date_coverage,
        CASE WHEN v_overlap_days > 0 
            THEN (v_days_with_posts::NUMERIC / v_overlap_days) 
            ELSE 0 
        END AS density_coverage,
        LEAST(1.0, v_total_posts::NUMERIC / v_volume_threshold) AS volume_score,
        (
            (v_overlap_days::NUMERIC / v_days_requested) * 0.4 +
            CASE WHEN v_overlap_days > 0 
                THEN (v_days_with_posts::NUMERIC / v_overlap_days) * 0.4
                ELSE 0 
            END +
            LEAST(1.0, v_total_posts::NUMERIC / v_volume_threshold) * 0.2
        ) AS total_score,
        v_days_requested,
        v_days_with_posts,
        v_total_posts;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABLE: verification_log (Audit Trail)
-- Addresses Gap 4: Silent failure detection
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_log (
    log_id SERIAL PRIMARY KEY,
    verification_type TEXT NOT NULL,  -- 'inline', 'daily', 'weekly'
    run_id UUID,  -- Optional reference to pipeline_runs
    keyword TEXT,
    status TEXT NOT NULL,  -- 'PASS', 'FAIL', 'WARNING'
    issues_found INTEGER DEFAULT 0,
    issues JSONB DEFAULT '[]'::JSONB,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_log_date ON verification_log(executed_at);
CREATE INDEX IF NOT EXISTS idx_verification_log_status ON verification_log(status);

-- ============================================================
-- DONE
-- ============================================================
```

### 2.3 Execution Steps

```powershell
# 1. Connect to PostgreSQL
psql -U postgres -d loginDB2-22-NOV

# 2. Run the migration
\i sql/001_cache_foundation.sql

# 3. Verify tables created
\dt

# 4. Verify seed keywords
SELECT COUNT(*) FROM seed_keywords;
-- Expected: ~60 rows

# 5. Test normalization function
SELECT normalize_keyword('  iPhone 15 Pro!!! ');
-- Expected: 'iphone 15 pro'
```

### 2.4 Validation Checklist

- [ ] All 10 tables created successfully
- [ ] `pg_trgm` extension enabled
- [ ] 8 categories inserted
- [ ] 60+ seed keywords inserted
- [ ] `normalize_keyword()` function works
- [ ] `get_keyword_tier()` function works
- [ ] Synonyms inserted

---

## 3. Phase 1: Normalization Module

**Duration:** 20 minutes  
**Dependencies:** Phase 0  
**Deliverable:** Consistent normalization across JS and Python

### 3.1 Tasks

| Task ID | Task | Description |
|---------|------|-------------|
| 1.1 | Create `utils/normalizeKeyword.js` | Node.js normalization |
| 1.2 | Create `ETL_2/utils/normalize.py` | Python normalization |
| 1.3 | Write consistency tests | Verify identical output |

### 3.2 JavaScript Module

**File:** `utils/normalizeKeyword.js`

```javascript
/**
 * BrandPulse Keyword Normalization
 * 
 * CRITICAL: This is the single source of truth for cache keys.
 * The same algorithm must be implemented in:
 * - JavaScript (this file)
 * - Python (ETL_2/utils/normalize.py)
 * - SQL (normalize_keyword function)
 * 
 * DO NOT modify this algorithm without updating all three.
 */

/**
 * Normalize a keyword for cache key generation.
 * 
 * Rules (in order):
 * 1. Handle null/undefined → empty string
 * 2. Convert to string
 * 3. Trim whitespace
 * 4. Convert to lowercase
 * 5. Remove special characters (keep alphanumeric, spaces, hyphens)
 * 6. Collapse multiple spaces to single space
 * 7. Trim again
 * 
 * @param {string} input - The keyword to normalize
 * @returns {string} - Normalized keyword (cache key)
 */
function normalizeKeyword(input) {
    // Handle null/undefined
    if (input === null || input === undefined) {
        return '';
    }
    
    // Convert to string
    let normalized = String(input);
    
    // Trim
    normalized = normalized.trim();
    
    // Lowercase
    normalized = normalized.toLowerCase();
    
    // Remove special characters except hyphens
    // Keep: a-z, 0-9, spaces, hyphens
    normalized = normalized.replace(/[^a-z0-9\s\-]/g, '');
    
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Final trim
    normalized = normalized.trim();
    
    return normalized;
}

/**
 * Test cases for validation
 * Run these against Python and SQL implementations
 */
const TEST_CASES = [
    { input: 'iPhone', expected: 'iphone' },
    { input: '  iPhone 15 Pro  ', expected: 'iphone 15 pro' },
    { input: 'SAMSUNG GALAXY!!!', expected: 'samsung galaxy' },
    { input: 'tesla-model-3', expected: 'tesla-model-3' },
    { input: '', expected: '' },
    { input: '   ', expected: '' },
    { input: '@#$%', expected: '' },
    { input: 'PlayStation 5', expected: 'playstation 5' },
    { input: 'Nike  Air  Max', expected: 'nike air max' },
    { input: null, expected: '' },
    { input: undefined, expected: '' },
    { input: 123, expected: '123' },
    { input: 'café', expected: 'caf' },  // Note: removes non-ASCII
    { input: 'iPhone—Pro', expected: 'iphonepro' },  // em-dash removed
];

/**
 * Validate normalization function
 */
function validateNormalization() {
    let passed = 0;
    let failed = 0;
    
    for (const test of TEST_CASES) {
        const result = normalizeKeyword(test.input);
        if (result === test.expected) {
            passed++;
        } else {
            failed++;
            console.error(`FAIL: normalizeKeyword(${JSON.stringify(test.input)})`);
            console.error(`  Expected: "${test.expected}"`);
            console.error(`  Got: "${result}"`);
        }
    }
    
    console.log(`\nNormalization validation: ${passed}/${TEST_CASES.length} passed`);
    return failed === 0;
}

// Export for use in other modules
module.exports = {
    normalizeKeyword,
    validateNormalization,
    TEST_CASES
};

// Run validation if executed directly
if (require.main === module) {
    const success = validateNormalization();
    process.exit(success ? 0 : 1);
}
```

### 3.3 Python Module

**File:** `ETL_2/utils/normalize.py`

```python
"""
BrandPulse Keyword Normalization

CRITICAL: This is the single source of truth for cache keys.
The same algorithm must be implemented in:
- JavaScript (utils/normalizeKeyword.js)
- Python (this file)
- SQL (normalize_keyword function)

DO NOT modify this algorithm without updating all three.
"""

import re
from typing import Any, List, Dict


def normalize_keyword(input_val: Any) -> str:
    """
    Normalize a keyword for cache key generation.
    
    Rules (in order):
    1. Handle None → empty string
    2. Convert to string
    3. Trim whitespace
    4. Convert to lowercase
    5. Remove special characters (keep alphanumeric, spaces, hyphens)
    6. Collapse multiple spaces to single space
    7. Trim again
    
    Args:
        input_val: The keyword to normalize (any type)
        
    Returns:
        Normalized keyword (cache key)
    """
    # Handle None
    if input_val is None:
        return ''
    
    # Convert to string
    normalized = str(input_val)
    
    # Trim
    normalized = normalized.strip()
    
    # Lowercase
    normalized = normalized.lower()
    
    # Remove special characters except hyphens
    # Keep: a-z, 0-9, spaces, hyphens
    normalized = re.sub(r'[^a-z0-9\s\-]', '', normalized)
    
    # Collapse multiple spaces
    normalized = re.sub(r'\s+', ' ', normalized)
    
    # Final trim
    normalized = normalized.strip()
    
    return normalized


# Test cases for validation (must match JavaScript and SQL)
TEST_CASES: List[Dict[str, Any]] = [
    {'input': 'iPhone', 'expected': 'iphone'},
    {'input': '  iPhone 15 Pro  ', 'expected': 'iphone 15 pro'},
    {'input': 'SAMSUNG GALAXY!!!', 'expected': 'samsung galaxy'},
    {'input': 'tesla-model-3', 'expected': 'tesla-model-3'},
    {'input': '', 'expected': ''},
    {'input': '   ', 'expected': ''},
    {'input': '@#$%', 'expected': ''},
    {'input': 'PlayStation 5', 'expected': 'playstation 5'},
    {'input': 'Nike  Air  Max', 'expected': 'nike air max'},
    {'input': None, 'expected': ''},
    {'input': 123, 'expected': '123'},
    {'input': 'café', 'expected': 'caf'},  # Note: removes non-ASCII
    {'input': 'iPhone—Pro', 'expected': 'iphonepro'},  # em-dash removed
]


def validate_normalization() -> bool:
    """
    Validate normalization function against test cases.
    
    Returns:
        True if all tests pass, False otherwise
    """
    passed = 0
    failed = 0
    
    for test in TEST_CASES:
        result = normalize_keyword(test['input'])
        if result == test['expected']:
            passed += 1
        else:
            failed += 1
            print(f"FAIL: normalize_keyword({repr(test['input'])})")
            print(f"  Expected: \"{test['expected']}\"")
            print(f"  Got: \"{result}\"")
    
    print(f"\nNormalization validation: {passed}/{len(TEST_CASES)} passed")
    return failed == 0


if __name__ == '__main__':
    import sys
    success = validate_normalization()
    sys.exit(0 if success else 1)
```

### 3.4 Validation Steps

```powershell
# Test JavaScript
node utils/normalizeKeyword.js

# Test Python
python ETL_2/utils/normalize.py

# Test SQL (in psql)
SELECT normalize_keyword('  iPhone 15 Pro!!! ');
-- Expected: 'iphone 15 pro'
```

### 3.5 Validation Checklist

- [ ] JS module created and tests pass
- [ ] Python module created and tests pass
- [ ] SQL function produces same output as JS/Python
- [ ] All 13 test cases pass in all three implementations

---

## 4. Phase 2: Backend API Updates

**Duration:** 2 hours  
**Dependencies:** Phases 0, 1  
**Deliverable:** Updated pipeline routes with cache-first logic

### 4.1 Tasks

| Task ID | Task | Description | Gap Addressed |
|---------|------|-------------|---------------|
| 2.1 | Add cache check logic | Query keyword_cache first | - |
| 2.2 | Add density-aware coverage | Use 3-component score | Gap 2 |
| 2.3 | Add tiered thresholds | Check against tier minimums | Gap 3 |
| 2.4 | Add synonym expansion | Query-time only | Gap 5 |
| 2.5 | Add saga orchestration | Track in pipeline_runs | Gap 1 |
| 2.6 | Add inline verification | After each layer | Gap 4 |
| 2.7 | Update results endpoint | Date filtering | - |

### 4.2 Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `routes/pipeline.js` | Modify | Add cache-first logic |
| `utils/coverageCalculator.js` | Create | Density-aware coverage |
| `utils/sagaOrchestrator.js` | Create | Pipeline run tracking |
| `utils/verification.js` | Create | Inline verification |
| `routes/data.js` | Modify | Add date filtering |

### 4.3 Key Code Components

**Coverage Calculator:**

```javascript
// utils/coverageCalculator.js

const pool = require('../db');

const WEIGHTS = {
    DATE_COVERAGE: 0.4,
    DENSITY_COVERAGE: 0.4,
    VOLUME_SCORE: 0.2
};

const VOLUME_THRESHOLD = 20;
const COVERAGE_THRESHOLD = 0.7;  // 70%

async function calculateCoverage(keywordNormalized, dateFrom, dateTo) {
    const result = await pool.query(`
        SELECT * FROM calculate_density_score(
            (SELECT global_keyword_id FROM global_keywords 
             WHERE normalize_keyword(keyword) = $1 LIMIT 1),
            $2::DATE,
            $3::DATE
        )
    `, [keywordNormalized, dateFrom, dateTo]);
    
    if (result.rows.length === 0) {
        return {
            totalScore: 0,
            dateCoverage: 0,
            densityCoverage: 0,
            volumeScore: 0,
            sufficient: false,
            warning: null
        };
    }
    
    const row = result.rows[0];
    const densityWarning = row.density_coverage < 0.3 
        ? `Data concentrated on ${row.days_with_posts} of ${row.days_requested} days`
        : null;
    
    return {
        totalScore: Math.round(row.total_score * 100),
        dateCoverage: Math.round(row.date_coverage * 100),
        densityCoverage: Math.round(row.density_coverage * 100),
        volumeScore: Math.round(row.volume_score * 100),
        daysRequested: row.days_requested,
        daysWithPosts: row.days_with_posts,
        totalPostsInRange: row.total_posts_in_range,
        sufficient: row.total_score >= COVERAGE_THRESHOLD,
        warning: densityWarning
    };
}

module.exports = { calculateCoverage, COVERAGE_THRESHOLD };
```

**Saga Orchestrator:**

```javascript
// utils/sagaOrchestrator.js

const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

class SagaOrchestrator {
    constructor() {
        this.runId = null;
    }
    
    async startRun(keyword, keywordNormalized, requestId, source = 'user') {
        const result = await pool.query(`
            INSERT INTO pipeline_runs 
            (run_id, keyword, keyword_normalized, request_id, source, status)
            VALUES ($1, $2, $3, $4, $5, 'STARTED')
            RETURNING run_id
        `, [uuidv4(), keyword, keywordNormalized, requestId, source]);
        
        this.runId = result.rows[0].run_id;
        return this.runId;
    }
    
    async markBronzeComplete(docCount) {
        await pool.query(`
            UPDATE pipeline_runs SET 
                bronze_status = 'SUCCESS',
                bronze_doc_count = $2,
                bronze_completed_at = NOW(),
                status = 'BRONZE_DONE'
            WHERE run_id = $1
        `, [this.runId, docCount]);
    }
    
    async markBronzeFailed(error) {
        await pool.query(`
            UPDATE pipeline_runs SET 
                bronze_status = 'FAILED',
                error_layer = 'BRONZE',
                error_message = $2,
                status = 'FAILED'
            WHERE run_id = $1
        `, [this.runId, error]);
    }
    
    async markSilverComplete(postCount, commentCount) {
        await pool.query(`
            UPDATE pipeline_runs SET 
                silver_status = 'SUCCESS',
                silver_post_count = $2,
                silver_comment_count = $3,
                silver_completed_at = NOW(),
                status = 'SILVER_DONE'
            WHERE run_id = $1
        `, [this.runId, postCount, commentCount]);
    }
    
    async markSilverFailed(error) {
        // Mark failed
        await pool.query(`
            UPDATE pipeline_runs SET 
                silver_status = 'FAILED',
                error_layer = 'SILVER',
                error_message = $2,
                status = 'FAILED'
            WHERE run_id = $1
        `, [this.runId, error]);
        
        // Compensation: Mark Bronze docs as orphaned
        await this.compensateBronze();
    }
    
    async markGoldComplete(factCount) {
        await pool.query(`
            UPDATE pipeline_runs SET 
                gold_status = 'SUCCESS',
                gold_fact_count = $2,
                gold_completed_at = NOW(),
                status = 'GOLD_DONE'
            WHERE run_id = $1
        `, [this.runId, factCount]);
    }
    
    async markGoldFailed(error) {
        await pool.query(`
            UPDATE pipeline_runs SET 
                gold_status = 'FAILED',
                error_layer = 'GOLD',
                error_message = $2,
                status = 'FAILED'
            WHERE run_id = $1
        `, [this.runId, error]);
        
        // Compensation: Delete Silver rows + mark Bronze as orphaned
        await this.compensateSilver();
        await this.compensateBronze();
    }
    
    async markComplete() {
        await pool.query(`
            UPDATE pipeline_runs SET 
                cache_status = 'SUCCESS',
                status = 'COMPLETED',
                completed_at = NOW()
            WHERE run_id = $1
        `, [this.runId]);
    }
    
    async compensateBronze() {
        // This would mark Bronze docs in MongoDB as orphaned
        // Implementation depends on MongoDB access pattern
        console.log(`[SAGA] Compensation: Marking Bronze docs as orphaned for run ${this.runId}`);
    }
    
    async compensateSilver() {
        const run = await this.getRun();
        if (run && run.request_id) {
            await pool.query(`
                DELETE FROM silver_reddit_posts 
                WHERE global_keyword_id = $1 
                AND created_at_utc >= $2
            `, [run.request_id, run.started_at]);
            console.log(`[SAGA] Compensation: Deleted Silver rows for request ${run.request_id}`);
        }
    }
    
    async getRun() {
        const result = await pool.query(
            'SELECT * FROM pipeline_runs WHERE run_id = $1',
            [this.runId]
        );
        return result.rows[0];
    }
}

module.exports = { SagaOrchestrator };
```

### 4.4 Validation Checklist

- [ ] Cache check logic implemented
- [ ] Coverage calculation uses 3-component formula
- [ ] Tier-based thresholds enforced
- [ ] Synonyms expanded at query time
- [ ] Pipeline runs tracked in `pipeline_runs` table
- [ ] Compensation logic works on failure
- [ ] Date filtering works on results endpoint

---

## 5. Phase 3: Defensive Crawler

**Duration:** 1 hour  
**Dependencies:** Phases 0, 1  
**Deliverable:** Crawler with circuit breaker and budget control

### 5.1 Tasks

| Task ID | Task | Description | Gap Addressed |
|---------|------|-------------|---------------|
| 3.1 | Implement circuit breaker | 5 failures → 5 min pause | Gap 6 |
| 3.2 | Implement adaptive backoff | Double delay on 429 | Gap 6 |
| 3.3 | Implement daily budget | 20,000 requests max | Gap 6 |
| 3.4 | Integrate saga orchestrator | Track each run | Gap 1 |
| 3.5 | Add CLI commands | --init, --refresh, --keyword | - |

### 5.2 File to Create

**File:** `ETL_2/seed_crawler.py`

Key components:
- CircuitBreaker class
- DefensiveCrawler class
- Budget checking
- Saga integration
- CLI interface

### 5.3 Configuration

```python
CRAWLER_CONFIG = {
    'BASE_DELAY_SECONDS': 2.0,      # Minimum delay between requests
    'MAX_DELAY_SECONDS': 120.0,     # Maximum backoff delay
    'DAILY_BUDGET': 20000,          # Max requests per day
    'CIRCUIT_BREAKER': {
        'FAILURE_THRESHOLD': 5,     # Failures to trip
        'FAILURE_WINDOW_SECONDS': 120,  # 2 minutes
        'OPEN_DURATION_SECONDS': 300,   # 5 minutes
    },
    'RATE_LIMIT_MULTIPLIER': 2.0,   # Multiply delay on 429
    'ERROR_MULTIPLIER': 1.5,        # Multiply delay on 5xx
}
```

### 5.4 Validation Checklist

- [ ] Circuit breaker trips after 5 failures
- [ ] Circuit breaker recovers after 5 minutes
- [ ] Daily budget stops crawler when exhausted
- [ ] Saga orchestrator tracks each run
- [ ] `--init` crawls all active seeds
- [ ] `--refresh` crawls stale keywords
- [ ] `--keyword` crawls specific keyword

---

## 6. Phase 4: Verification Jobs

**Duration:** 30 minutes  
**Dependencies:** Phases 2, 3  
**Deliverable:** Inline and scheduled verification

### 6.1 Tasks

| Task ID | Task | Description | Gap Addressed |
|---------|------|-------------|---------------|
| 4.1 | Create inline verification | After each pipeline run | Gap 4 |
| 4.2 | Create daily consistency check | Scheduled job | Gap 4 |
| 4.3 | Create cleanup job | Remove orphaned data | Gap 1 |

### 6.2 Verification Rules

| Check | Condition | Action on Failure |
|-------|-----------|-------------------|
| Bronze → Silver | Silver count > 0 if Bronze > 0 | Mark as FAILED |
| Drop rate | Silver/Bronze > 50% | Log WARNING |
| Silver → Gold | Gold count > 0 if Silver > 0 | Mark as FAILED |
| NULL sentiments | Count = 0 | Mark as needs_review |
| Cache-actual mismatch | Difference < 10% | Log WARNING, mark stale |
| Orphaned Bronze | Age > 24 hours | Queue for cleanup |

### 6.3 Validation Checklist

- [ ] Inline verification runs after each pipeline
- [ ] Daily check scheduled (cron or Windows Task Scheduler)
- [ ] Cleanup job removes orphaned data
- [ ] Verification results logged to `verification_log`

---

## 7. Phase 5: Frontend Updates

**Duration:** 1 hour  
**Dependencies:** Phase 2  
**Deliverable:** Updated UI with date picker and coverage display

### 7.1 Tasks

| Task ID | Task | Description | Gap Addressed |
|---------|------|-------------|---------------|
| 5.1 | Create DateRangePicker | Presets + custom | - |
| 5.2 | Create CoverageDisplay | 3-component breakdown | Gap 2 |
| 5.3 | Create DensityWarning | When data is concentrated | Gap 2 |
| 5.4 | Create ConfidenceIndicator | Tier-based | Gap 3 |
| 5.5 | Update useAnalysis hook | Handle new response formats | - |
| 5.6 | Update PipelineTester | Integrate components | - |

### 7.2 Files to Create

| File | Description |
|------|-------------|
| `components/analysis/DateRangePicker.tsx` | Date selection |
| `components/analysis/CoverageDisplay.tsx` | Coverage breakdown |
| `components/analysis/DensityWarning.tsx` | Density alert |
| `components/analysis/ConfidenceIndicator.tsx` | Tier badge |

### 7.3 Validation Checklist

- [ ] Date picker shows 5 presets (7d, 30d, 90d, All, Custom)
- [ ] Coverage shows 3-component breakdown
- [ ] Density warning appears when < 30% density
- [ ] Confidence indicator shows tier
- [ ] Synonym matches display correctly

---

## 8. Phase 6: Testing & Validation

**Duration:** 1 hour  
**Dependencies:** All phases  
**Deliverable:** Verified system with documented limitations

### 8.1 Tasks

| Task ID | Task | Description |
|---------|------|-------------|
| 6.1 | Test normalization consistency | JS = Python = SQL |
| 6.2 | Test coverage edge cases | 0%, partial, 100% |
| 6.3 | Test saga failure scenarios | Each layer failure |
| 6.4 | Test circuit breaker | Trip and recovery |
| 6.5 | Test end-to-end flow | Cache hit, miss, partial |
| 6.6 | Document limitations | Update docs |

### 8.2 Test Scenarios

**Scenario 1: Cache Hit**
```
1. Ensure keyword "iPhone" exists in cache with data
2. Search "iPhone" for date range within cache
3. Verify response has status: "CACHE_HIT"
4. Verify response time < 100ms
```

**Scenario 2: Partial Coverage**
```
1. Ensure keyword "Nike" has data from Jan 10-15
2. Search "Nike" for Jan 1-15
3. Verify response has status: "PARTIAL_COVERAGE"
4. Verify coverage breakdown shows correct percentages
```

**Scenario 3: Saga Failure Recovery**
```
1. Simulate Gold layer failure
2. Verify Silver rows are deleted (compensation)
3. Verify Bronze docs marked as orphaned
4. Verify pipeline_runs status = 'FAILED'
```

**Scenario 4: Circuit Breaker**
```
1. Simulate 5 consecutive API failures
2. Verify circuit breaker state = 'OPEN'
3. Verify next request is rejected
4. Wait 5 minutes
5. Verify circuit breaker state = 'HALF_OPEN'
6. Simulate success
7. Verify circuit breaker state = 'CLOSED'
```

### 8.3 Validation Checklist

- [ ] All normalization tests pass (3 implementations)
- [ ] Coverage calculation correct for edge cases
- [ ] Saga compensation works correctly
- [ ] Circuit breaker trips and recovers
- [ ] End-to-end flow works for all scenarios
- [ ] Known limitations documented

---

## 9. Execution Schedule

### Day 1: Foundation (4 hours)

| Time | Phase | Tasks |
|------|-------|-------|
| Hour 1 | Phase 0 | Run SQL migration, verify tables |
| Hour 2 | Phase 1 | Create normalization modules, test |
| Hour 3-4 | Phase 3 | Create crawler with defensive measures |
| Background | - | Run `python seed_crawler.py --init` |

### Day 2: API & Frontend (4 hours)

| Time | Phase | Tasks |
|------|-------|-------|
| Hour 1-2 | Phase 2 | Backend API updates |
| Hour 3 | Phase 4 | Verification jobs |
| Hour 4 | Phase 5 | Frontend updates |

### Day 3: Testing (2 hours)

| Time | Phase | Tasks |
|------|-------|-------|
| Hour 1 | Phase 6 | Testing all scenarios |
| Hour 2 | - | Documentation, cleanup |

---

## 10. File Inventory

### New Files (13 files)

| File | Phase | Purpose |
|------|-------|---------|
| `sql/001_cache_foundation.sql` | 0 | Database migration |
| `utils/normalizeKeyword.js` | 1 | JS normalization |
| `ETL_2/utils/__init__.py` | 1 | Python package init |
| `ETL_2/utils/normalize.py` | 1 | Python normalization |
| `utils/coverageCalculator.js` | 2 | Coverage calculation |
| `utils/sagaOrchestrator.js` | 2 | Saga pattern |
| `utils/verification.js` | 4 | Inline verification |
| `ETL_2/seed_crawler.py` | 3 | Background crawler |
| `ETL_2/utils/circuit_breaker.py` | 3 | Circuit breaker |
| `client/src/components/analysis/DateRangePicker.tsx` | 5 | Date picker |
| `client/src/components/analysis/CoverageDisplay.tsx` | 5 | Coverage UI |
| `client/src/components/analysis/DensityWarning.tsx` | 5 | Density alert |
| `client/src/components/analysis/ConfidenceIndicator.tsx` | 5 | Tier badge |

### Modified Files (4 files)

| File | Phase | Changes |
|------|-------|---------|
| `routes/pipeline.js` | 2 | Cache-first logic, saga |
| `routes/data.js` | 2 | Date filtering |
| `client/src/hooks/useAnalysis.ts` | 5 | New response handling |
| `client/src/pages/PipelineTester.tsx` | 5 | New components |

---

## 11. Rollback Plan

### If Phase 0 Fails

```sql
-- Drop new tables (safe - no existing data affected)
DROP TABLE IF EXISTS verification_log;
DROP TABLE IF EXISTS keyword_synonyms;
DROP TABLE IF EXISTS keyword_cache;
DROP TABLE IF EXISTS seed_keywords;
DROP TABLE IF EXISTS keyword_categories;
DROP TABLE IF EXISTS api_usage_log;
DROP TABLE IF EXISTS pipeline_runs;
DROP FUNCTION IF EXISTS normalize_keyword;
DROP FUNCTION IF EXISTS get_keyword_tier;
DROP FUNCTION IF EXISTS calculate_density_score;
```

### If Phase 2/3 Fails

- Revert `routes/pipeline.js` to previous version
- System falls back to direct Reddit API calls (original behavior)

### If Phase 5 Fails

- Frontend falls back to existing `PipelineTester.tsx`
- Backend still works, just without new UI features

---

## Summary

This revised implementation plan addresses all 6 identified gaps:

| Gap | Solution | Phase |
|-----|----------|-------|
| 1. Atomicity | Saga pattern with `pipeline_runs` | 0, 2, 3 |
| 2. Density | 3-component coverage score | 0, 2, 5 |
| 3. Thresholds | Tiered system with concrete values | 0, 2 |
| 4. Verification | Inline + daily checks | 4 |
| 5. Normalization | Strict separation, 3 implementations | 1, 0 |
| 6. Rate limiting | Circuit breaker + budget + backoff | 3 |

**Ready to begin Phase 0?**
