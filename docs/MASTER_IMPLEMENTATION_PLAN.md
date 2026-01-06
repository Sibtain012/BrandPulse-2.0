# BrandPulse 2.0 - Master Implementation Plan

**Document Version:** 2.0  
**Date:** January 4, 2026  
**Status:** Ready for Implementation  
**Architecture:** User-Based + Shared Cache (B2C SaaS)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Decision](#2-architecture-decision)
3. [What We're Building](#3-what-were-building)
4. [Database Schema Overview](#4-database-schema-overview)
5. [Implementation Phases](#5-implementation-phases)
6. [Phase 0: Database Foundation](#6-phase-0-database-foundation)
7. [Phase 1: Normalization Module](#7-phase-1-normalization-module)
8. [Phase 2: Backend API Updates](#8-phase-2-backend-api-updates)
9. [Phase 3: Multi-Platform ETL](#9-phase-3-multi-platform-etl)
10. [Phase 4: Verification & Monitoring](#10-phase-4-verification--monitoring)
11. [Phase 5: Frontend Updates](#11-phase-5-frontend-updates)
12. [Phase 6: Testing & Validation](#12-phase-6-testing--validation)
13. [Task Distribution](#13-task-distribution)
14. [File Inventory](#14-file-inventory)
15. [Validation Checklists](#15-validation-checklists)

---

## 1. Executive Summary

### 1.1 What is BrandPulse 2.0?

A B2C SaaS platform for brand sentiment analysis that:
- Ingests data from Reddit and Twitter (X)
- Performs sentiment analysis using ML models
- Provides trend visualization and competitor comparison
- Uses a cache-first architecture for instant responses

### 1.2 Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | User-Based + Shared Cache | Public social data benefits from sharing; user-specific preferences are isolated |
| Caching | PostgreSQL (not Redis) | Sufficient for scale; avoids new infrastructure |
| Twitter Library | Tweepy | Like PRAW for Reddit; handles OAuth and rate limits |
| ETL Structure | Hybrid (separate Bronze/Silver, unified Gold) | Platform-specific ingestion, unified analytics |
| Multi-Tenant | NO | Not needed for B2C; adds complexity without benefit |

### 1.3 Total Effort Estimate

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 0: Database | 1 hour | 🔲 Not Started |
| Phase 1: Normalization | 30 min | 🔲 Not Started |
| Phase 2: Backend API | 2 hours | 🔲 Not Started |
| Phase 3: Multi-Platform ETL | 3 hours | 🔲 Not Started |
| Phase 4: Verification | 1 hour | 🔲 Not Started |
| Phase 5: Frontend | 2 hours | 🔲 Not Started |
| Phase 6: Testing | 1 hour | 🔲 Not Started |
| **Total** | **~10.5 hours** | |

---

## 2. Architecture Decision

### 2.1 Why User-Based + Shared Cache?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BRANDPULSE ARCHITECTURE                                   │
│                    User-Based + Shared Cache                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     SHARED LAYER (Public Data)                        │  │
│  │                                                                       │  │
│  │   keyword_cache ─── silver_reddit_posts ─── silver_twitter_tweets    │  │
│  │        │                    │                       │                 │  │
│  │        └────────────────────┴───────────────────────┘                 │  │
│  │                              │                                        │  │
│  │                    fact_sentiment_daily                               │  │
│  │                                                                       │  │
│  │   ✅ One "iPhone" analysis serves ALL users                          │  │
│  │   ✅ API rate limits shared efficiently                               │  │
│  │   ✅ Cache benefits everyone                                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                              │                                              │
│         ┌────────────────────┼────────────────────┐                        │
│         │                    │                    │                        │
│         ▼                    ▼                    ▼                        │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                  │
│  │   User A    │     │   User B    │     │   User C    │                  │
│  │  (Premium)  │     │   (Free)    │     │  (Premium)  │                  │
│  │             │     │             │     │             │                  │
│  │ • History   │     │ • History   │     │ • History   │                  │
│  │ • Alerts    │     │ • Alerts    │     │ • Alerts    │                  │
│  │ • Reports   │     │ • Reports   │     │ • Reports   │                  │
│  └─────────────┘     └─────────────┘     └─────────────┘                  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                     USER LAYER (Private Data)                         │  │
│  │                                                                       │  │
│  │   user_search_history ─── user_saved_reports ─── user_alerts         │  │
│  │                                                                       │  │
│  │   ❌ User A cannot see User B's saved reports                        │  │
│  │   ❌ User B cannot see User C's alert settings                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 What's Shared vs Private

| Data Type | Shared? | Reason |
|-----------|---------|--------|
| Reddit posts | ✅ Yes | Public data, same for everyone |
| Twitter tweets | ✅ Yes | Public data, same for everyone |
| Sentiment analysis | ✅ Yes | Same ML model output for same text |
| Keyword cache | ✅ Yes | Cache benefits all users |
| Seed keywords | ✅ Yes | Platform-provided suggestions |
| User search history | ❌ No | Personal activity log |
| User saved reports | ❌ No | Personal configurations |
| User alerts | ❌ No | Personal preferences |
| User credentials | ❌ No | Authentication data |

---

## 3. What We're Building

### 3.1 Use Cases Supported

Based on `BrandPulse-UseCases.pdf`:

| UC# | Use Case | Data Layer | Status |
|-----|----------|------------|--------|
| 1 | Sentiment Analysis | `fact_sentiment_daily` | ✅ Planned |
| 2 | Trend Analysis | `fact_sentiment_daily` | ✅ Planned |
| 3 | Topic Modeling | `fact_topics` | ⚠️ Future |
| 4 | Complaint Classification | `fact_complaints` | ⚠️ Future |
| 5 | Customer Segmentation | N/A | ❌ Not supported |
| 6 | Keyword Co-occurrence | `fact_keyword_pairs` | ⚠️ Future |
| 7 | Geo Sentiment Heatmap | N/A | ❌ API limitation |
| 8 | Campaign Impact | `user_campaigns` | ✅ Planned |
| 9 | Competitor Comparison | `fact_sentiment_daily` | ✅ Planned |
| 10 | Anomaly Detection | `fact_anomalies` | ✅ Planned |
| 11 | Predictive Churn | N/A | ❌ Not in scope |
| 12 | Data Quality | `keyword_cache` | ✅ Planned |

### 3.2 Platforms Supported

| Platform | API Tier | Rate Limit | Lookback | Library |
|----------|----------|------------|----------|---------|
| Reddit | Free | 60 req/min | Unlimited | PRAW |
| Twitter/X | Free | ~1 req/15min | 7 days | Tweepy |

### 3.3 Gap Analysis Summary

From `CACHE_STRATEGY_GAP_ANALYSIS.md`:

| Gap | Problem | Solution |
|-----|---------|----------|
| Gap 1: Atomicity | Partial failures leave orphaned data | Saga pattern with `pipeline_runs` |
| Gap 2: Density | Date overlap ≠ actual data coverage | 3-component density score |
| Gap 3: Thresholds | "Sufficient" is vague | Tiered thresholds (HIGH/MEDIUM/LOW) |
| Gap 4: Verification | Silent failures go undetected | Inline + scheduled verification |
| Gap 5: Normalization | Synonyms mixed with normalization | Strict separation (normalize vs synonyms) |
| Gap 6: Rate Limiting | Optimistic limits cause bans | Circuit breaker + daily budget |

---

## 4. Database Schema Overview

### 4.1 Existing Tables (Your Current DB)

```
Authentication:
├── auth_identities (user_id, email, password_hash, ...)
├── user_profiles (profile_id, user_id, subscription_tier, ...)
├── user_sessions (session_id, user_id, refresh_token_hash, ...)
└── verification_tokens (token_id, user_id, token_hash, ...)

ETL - Existing:
├── global_keywords (global_keyword_id, keyword, user_id, status, ...)
├── silver_reddit_posts (silver_post_id, keyword, sentiment_label, ...)
├── silver_reddit_comments (silver_comment_id, silver_post_id, ...)
├── fact_sentiment_events (fact_id, silver_content_id, sentiment_id, ...)
└── campaigns (campaign_id, keyword, platform_id, ...)

Dimensions:
├── dim_platform (platform_id, platform_name)
├── dim_sentiment (sentiment_id, sentiment_label)
├── dim_date (date_id, calendar_date, year, month, ...)
├── dim_time (time_id, hour, minute)
├── dim_content_type (content_type_id, content_type)
└── dim_model (model_id, model_name, model_version)
```

### 4.2 New Tables (Cache Strategy)

```
Cache Infrastructure:
├── pipeline_runs (run_id, keyword, status, bronze_status, silver_status, ...)
├── api_usage_log (log_id, log_date, platform, request_count, ...)
├── platform_config (config_id, platform_name, daily_request_budget, ...)
├── keyword_cache (cache_id, keyword_normalized, total_posts, density_score, ...)
├── keyword_categories (category_id, name, description, icon)
├── seed_keywords (seed_id, keyword, category_id, priority, ...)
├── keyword_synonyms (synonym_id, input_normalized, also_search_normalized)
└── verification_log (log_id, verification_type, status, issues, ...)

Twitter Integration:
└── silver_twitter_tweets (silver_tweet_id, tweet_id, sentiment_label, ...)

User Personalization:
├── user_search_history (history_id, user_id, keyword, searched_at, ...)
├── user_saved_reports (report_id, user_id, report_name, config, ...)
└── user_keyword_alerts (alert_id, user_id, keyword, alert_type, ...)
```

### 4.3 MongoDB Collections

```
Bronze Layer:
├── bronze_reddit_raw (existing)
└── bronze_twitter_raw (new)
```

---

## 5. Implementation Phases

### 5.1 Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Phase 0                     Phase 1                                       │
│   ─────────                   ─────────                                     │
│   Database                    Normalization                                 │
│   Foundation                  Module                                        │
│       │                           │                                         │
│       └───────────┬───────────────┘                                         │
│                   │                                                         │
│                   ▼                                                         │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                         Phase 2                                    │    │
│   │                      Backend API                                   │    │
│   │   • Cache-first logic                                             │    │
│   │   • Coverage calculation                                          │    │
│   │   • Saga orchestration                                            │    │
│   └───────────────────────────────────────────────────────────────────┘    │
│                   │                                                         │
│       ┌───────────┴───────────┐                                            │
│       │                       │                                            │
│       ▼                       ▼                                            │
│   Phase 3                 Phase 4                                          │
│   ─────────               ─────────                                        │
│   Multi-Platform          Verification                                     │
│   ETL (Reddit +           & Monitoring                                     │
│   Twitter)                                                                 │
│       │                       │                                            │
│       └───────────┬───────────┘                                            │
│                   │                                                         │
│                   ▼                                                         │
│   ┌───────────────────────────────────────────────────────────────────┐    │
│   │                         Phase 5                                    │    │
│   │                      Frontend Updates                              │    │
│   │   • Date picker                                                   │    │
│   │   • Coverage display                                              │    │
│   │   • Platform selector                                             │    │
│   └───────────────────────────────────────────────────────────────────┘    │
│                   │                                                         │
│                   ▼                                                         │
│               Phase 6                                                       │
│               ─────────                                                     │
│               Testing &                                                     │
│               Validation                                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Phase 0: Database Foundation

**Duration:** 1 hour  
**Dependencies:** None  
**Owner:** 🤖 Copilot generates, 👤 You execute

### 6.1 Objectives

- Create all new tables for cache strategy
- Create user personalization tables
- Add Twitter support tables
- Insert seed data (categories, keywords, synonyms)
- Create helper functions

### 6.2 Files

| File | Action | Description |
|------|--------|-------------|
| `sql/001_cache_foundation.sql` | ✅ Created | Core cache tables |
| `sql/002_user_personalization.sql` | 🔲 Create | User-specific tables |

### 6.3 Tables Created

| Table | Purpose | Gap Addressed |
|-------|---------|---------------|
| `pipeline_runs` | Saga pattern tracking | Gap 1: Atomicity |
| `api_usage_log` | Daily API budget tracking | Gap 6: Rate Limiting |
| `platform_config` | Platform-specific settings | Multi-platform support |
| `keyword_cache` | Cache metadata with density | Gap 2: Density |
| `keyword_categories` | Organize seed keywords | UX improvement |
| `seed_keywords` | Pre-defined popular keywords | Cache warming |
| `keyword_synonyms` | Query-time expansion | Gap 5: Normalization |
| `verification_log` | Audit trail | Gap 4: Verification |
| `silver_twitter_tweets` | Twitter silver layer | Twitter integration |
| `user_search_history` | User activity tracking | Personalization |
| `user_saved_reports` | Saved configurations | Personalization |
| `user_keyword_alerts` | Alert preferences | UC 10: Anomaly |

### 6.4 Functions Created

| Function | Purpose |
|----------|---------|
| `normalize_keyword(text)` | Deterministic cache key generation |
| `get_keyword_tier(text)` | Assign HIGH/MEDIUM/LOW tier |
| `calculate_density_score(...)` | 3-component coverage calculation |
| `update_api_usage(...)` | Track API calls |
| `get_api_budget_remaining(text)` | Check remaining budget |

### 6.5 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 0.1 | 🤖 | `sql/001_cache_foundation.sql` already created | ✅ Done |
| 0.2 | 🤖 | Generate `sql/002_user_personalization.sql` | 🔲 Pending |
| 0.3 | 👤 | Open pgAdmin, connect to `loginDB2-22-NOV` | 🔲 Pending |
| 0.4 | 👤 | Run `001_cache_foundation.sql` | 🔲 Pending |
| 0.5 | 👤 | Run `002_user_personalization.sql` | 🔲 Pending |
| 0.6 | 👤 | Run verification queries | 🔲 Pending |

### 6.6 Verification Queries

```sql
-- Run after migration
SELECT COUNT(*) as categories FROM keyword_categories;  -- Expected: 8
SELECT COUNT(*) as seeds FROM seed_keywords;            -- Expected: ~60
SELECT COUNT(*) as synonyms FROM keyword_synonyms;      -- Expected: ~15
SELECT normalize_keyword('  iPhone 15!!! ');            -- Expected: 'iphone 15'
SELECT * FROM platform_config;                          -- Expected: 2 rows
SELECT get_api_budget_remaining('reddit');              -- Expected: 14400
SELECT get_api_budget_remaining('twitter');             -- Expected: 96
```

---

## 7. Phase 1: Normalization Module

**Duration:** 30 minutes  
**Dependencies:** Phase 0  
**Owner:** 🤖 Copilot generates, 👤 You test

### 7.1 Objectives

- Create identical normalization in JS, Python, and SQL
- Ensure cache keys are consistent across all layers
- Provide test cases for validation

### 7.2 Files

| File | Action | Description |
|------|--------|-------------|
| `utils/normalizeKeyword.js` | 🔲 Create | Node.js normalization |
| `ETL_2/shared/__init__.py` | 🔲 Create | Python package init |
| `ETL_2/shared/normalize.py` | 🔲 Create | Python normalization |

### 7.3 Normalization Rules

```
Input: "  iPhone 15 Pro!!! "

Steps:
1. Handle null/undefined → ''
2. Convert to string
3. Trim whitespace → "iPhone 15 Pro!!!"
4. Lowercase → "iphone 15 pro!!!"
5. Remove special chars (keep a-z, 0-9, space, hyphen) → "iphone 15 pro"
6. Collapse multiple spaces → "iphone 15 pro"
7. Final trim → "iphone 15 pro"

Output: "iphone 15 pro"
```

### 7.4 Test Cases

| Input | Expected Output |
|-------|-----------------|
| `'iPhone'` | `'iphone'` |
| `'  iPhone 15 Pro  '` | `'iphone 15 pro'` |
| `'SAMSUNG GALAXY!!!'` | `'samsung galaxy'` |
| `'tesla-model-3'` | `'tesla-model-3'` |
| `''` | `''` |
| `'   '` | `''` |
| `null` | `''` |
| `123` | `'123'` |

### 7.5 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 1.1 | 🤖 | Generate `utils/normalizeKeyword.js` | 🔲 Pending |
| 1.2 | 🤖 | Generate `ETL_2/shared/__init__.py` | 🔲 Pending |
| 1.3 | 🤖 | Generate `ETL_2/shared/normalize.py` | 🔲 Pending |
| 1.4 | 👤 | Run `node utils/normalizeKeyword.js` | 🔲 Pending |
| 1.5 | 👤 | Run `python ETL_2/shared/normalize.py` | 🔲 Pending |
| 1.6 | 👤 | Verify SQL function matches | 🔲 Pending |

---

## 8. Phase 2: Backend API Updates

**Duration:** 2 hours  
**Dependencies:** Phases 0, 1  
**Owner:** 🤖 Copilot generates, 👤 You test

### 8.1 Objectives

- Implement cache-first query logic
- Add density-aware coverage calculation
- Implement saga orchestration for pipeline runs
- Add date range filtering to results

### 8.2 Files

| File | Action | Description |
|------|--------|-------------|
| `utils/coverageCalculator.js` | 🔲 Create | 3-component coverage |
| `utils/sagaOrchestrator.js` | 🔲 Create | Pipeline tracking |
| `utils/cacheManager.js` | 🔲 Create | Cache check/update |
| `routes/pipeline.js` | 🔲 Modify | Cache-first logic |
| `routes/analytics.js` | 🔲 Create | Analytics endpoints |

### 8.3 API Endpoints

| Endpoint | Method | Purpose | Use Case |
|----------|--------|---------|----------|
| `/api/pipeline/analyze` | POST | Trigger analysis | Core |
| `/api/analytics/sentiment/:keyword` | GET | Get sentiment data | UC 1 |
| `/api/analytics/trends/:keyword` | GET | Get trend data | UC 2 |
| `/api/analytics/compare` | GET | Compare keywords | UC 9 |
| `/api/analytics/campaign-impact` | POST | Campaign analysis | UC 8 |
| `/api/analytics/quality/:keyword` | GET | Data confidence | UC 12 |
| `/api/user/history` | GET | User's search history | Personalization |
| `/api/user/reports` | GET/POST | Saved reports | Personalization |

### 8.4 Cache-First Flow

```
Request: GET /api/analytics/sentiment/iphone?from=2026-01-01&to=2026-01-15
                                │
                                ▼
                    ┌───────────────────────┐
                    │ 1. Normalize keyword  │
                    │    "iphone" → "iphone"│
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │ 2. Check keyword_cache│
                    │    SELECT * FROM ...  │
                    └───────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
               Cache EXISTS            Cache MISSING
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │ 3. Calculate      │   │ 3. Return         │
        │    coverage score │   │    CACHE_MISS     │
        └───────────────────┘   │    + trigger ETL  │
                    │           └───────────────────┘
                    ▼
        ┌───────────────────┐
        │ Coverage ≥ 70%?   │
        └───────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
       YES                     NO
        │                       │
        ▼                       ▼
┌───────────────┐     ┌───────────────────┐
│ 4. Query Gold │     │ 4. Return         │
│    layer      │     │    PARTIAL_COVERAGE│
│    directly   │     │    + show warning │
└───────────────┘     │    + trigger ETL  │
        │             └───────────────────┘
        ▼
┌───────────────┐
│ 5. Return     │
│    CACHE_HIT  │
│    + data     │
└───────────────┘
```

### 8.5 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 2.1 | 🤖 | Generate `utils/coverageCalculator.js` | 🔲 Pending |
| 2.2 | 🤖 | Generate `utils/sagaOrchestrator.js` | 🔲 Pending |
| 2.3 | 🤖 | Generate `utils/cacheManager.js` | 🔲 Pending |
| 2.4 | 🤖 | Update `routes/pipeline.js` | 🔲 Pending |
| 2.5 | 🤖 | Generate `routes/analytics.js` | 🔲 Pending |
| 2.6 | 👤 | Install dependencies: `npm install uuid` | 🔲 Pending |
| 2.7 | 👤 | Restart backend: `nodemon index.js` | 🔲 Pending |
| 2.8 | 👤 | Test endpoints with Postman | 🔲 Pending |

---

## 9. Phase 3: Multi-Platform ETL

**Duration:** 3 hours  
**Dependencies:** Phases 0, 1, 2  
**Owner:** 🤖 Copilot generates, 👤 You test

### 9.1 Objectives

- Implement Twitter (X) Bronze layer ingestion
- Implement Twitter Silver layer transformation
- Add circuit breaker for rate limit protection
- Create unified crawler with priority management

### 9.2 Files

| File | Action | Description |
|------|--------|-------------|
| `ETL_2/shared/__init__.py` | 🔲 Create | Package init |
| `ETL_2/shared/normalize.py` | Phase 1 | Normalization |
| `ETL_2/shared/circuit_breaker.py` | 🔲 Create | Rate limit protection |
| `ETL_2/shared/sentiment.py` | 🔲 Create | Shared sentiment analysis |
| `ETL_2/twitter/__init__.py` | 🔲 Create | Package init |
| `ETL_2/twitter/bronze_ingest.py` | 🔲 Create | Twitter API ingestion |
| `ETL_2/twitter/silver_transform.py` | 🔲 Create | Twitter data cleaning |
| `ETL_2/platform_crawler.py` | 🔲 Create | Multi-platform orchestrator |

### 9.3 ETL Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MULTI-PLATFORM ETL                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐              ┌─────────────────┐                      │
│  │   Reddit API    │              │   Twitter API   │                      │
│  │   (PRAW)        │              │   (Tweepy)      │                      │
│  └────────┬────────┘              └────────┬────────┘                      │
│           │                                │                                │
│           │ 60 req/min                     │ 1 req/15min                   │
│           │                                │                                │
│           ▼                                ▼                                │
│  ┌─────────────────┐              ┌─────────────────┐                      │
│  │ Circuit Breaker │              │ Circuit Breaker │                      │
│  │ + Budget Check  │              │ + Budget Check  │                      │
│  └────────┬────────┘              └────────┬────────┘                      │
│           │                                │                                │
│           ▼                                ▼                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         BRONZE LAYER (MongoDB)                       │   │
│  │                                                                      │   │
│  │   bronze_reddit_raw                    bronze_twitter_raw           │   │
│  │   ├── Raw posts                        ├── Raw tweets               │   │
│  │   ├── Raw comments                     ├── Engagement metrics       │   │
│  │   └── Metadata                         └── Metadata                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         SILVER LAYER (PostgreSQL)                    │   │
│  │                                                                      │   │
│  │   silver_reddit_posts                  silver_twitter_tweets        │   │
│  │   ├── Cleaned text                     ├── Cleaned text             │   │
│  │   ├── Sentiment label                  ├── Sentiment label          │   │
│  │   ├── Sentiment score                  ├── Sentiment score          │   │
│  │   └── Engagement metrics               └── Engagement metrics       │   │
│  │                                                                      │   │
│  │   silver_reddit_comments                                            │   │
│  │   └── Comment sentiment                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         GOLD LAYER (PostgreSQL)                      │   │
│  │                                                                      │   │
│  │   fact_sentiment_events (EXISTING - unified for both platforms)     │   │
│  │   ├── silver_content_id → silver_reddit_posts OR silver_twitter    │   │
│  │   ├── platform_id → 1 (Reddit) or 2 (Twitter)                      │   │
│  │   ├── sentiment_id                                                  │   │
│  │   └── date_id, time_id                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Twitter API Constraints (Free Tier)

| Constraint | Value | Impact |
|------------|-------|--------|
| Endpoint | `GET /2/tweets/search/recent` only | No historical data |
| Rate Limit | ~1 request per 15 minutes | ~96 requests/day |
| Results | 10 tweets per request | ~960 tweets/day max |
| Lookback | 7 days | Data expires, must capture daily |

### 9.5 Circuit Breaker Logic

```
┌─────────────────────────────────────────────────────────────────┐
│                    CIRCUIT BREAKER STATES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   CLOSED (Normal)                                               │
│       │                                                         │
│       │ 5 consecutive failures                                  │
│       ▼                                                         │
│   OPEN (Blocking)                                               │
│       │                                                         │
│       │ Wait 5 minutes                                          │
│       ▼                                                         │
│   HALF-OPEN (Testing)                                           │
│       │                                                         │
│   ┌───┴───┐                                                     │
│   │       │                                                     │
│ Success  Failure                                                │
│   │       │                                                     │
│   ▼       ▼                                                     │
│ CLOSED   OPEN                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.6 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 3.1 | 🤖 | Generate `ETL_2/shared/circuit_breaker.py` | 🔲 Pending |
| 3.2 | 🤖 | Generate `ETL_2/shared/sentiment.py` | 🔲 Pending |
| 3.3 | 🤖 | Generate `ETL_2/twitter/__init__.py` | 🔲 Pending |
| 3.4 | 🤖 | Generate `ETL_2/twitter/bronze_ingest.py` | 🔲 Pending |
| 3.5 | 🤖 | Generate `ETL_2/twitter/silver_transform.py` | 🔲 Pending |
| 3.6 | 🤖 | Generate `ETL_2/platform_crawler.py` | 🔲 Pending |
| 3.7 | 👤 | Install Tweepy: `pip install tweepy` | 🔲 Pending |
| 3.8 | 👤 | Add `TWITTER_BEARER_TOKEN` to `.env` | 🔲 Pending |
| 3.9 | 👤 | Test: `python ETL_2/twitter/bronze_ingest.py --test` | 🔲 Pending |
| 3.10 | 👤 | Run seed crawl | 🔲 Pending |

---

## 10. Phase 4: Verification & Monitoring

**Duration:** 1 hour  
**Dependencies:** Phases 2, 3  
**Owner:** 🤖 Copilot generates, 👤 You test

### 10.1 Objectives

- Implement inline verification after each pipeline stage
- Create daily consistency check job
- Implement cleanup for orphaned data

### 10.2 Files

| File | Action | Description |
|------|--------|-------------|
| `utils/verification.js` | 🔲 Create | Inline verification |
| `ETL_2/verification.py` | 🔲 Create | Python verification |
| `ETL_2/cleanup.py` | 🔲 Create | Orphan cleanup |

### 10.3 Verification Rules

| Check | Condition | Action on Failure |
|-------|-----------|-------------------|
| Bronze → Silver | Silver count > 0 if Bronze > 0 | Mark as FAILED |
| Drop rate | Silver/Bronze > 50% | Log WARNING |
| Silver → Gold | Gold count > 0 if Silver > 0 | Mark as FAILED |
| NULL sentiments | Count = 0 | Mark as needs_review |
| Cache-actual mismatch | Difference < 10% | Log WARNING, mark stale |

### 10.4 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 4.1 | 🤖 | Generate `utils/verification.js` | 🔲 Pending |
| 4.2 | 🤖 | Generate `ETL_2/verification.py` | 🔲 Pending |
| 4.3 | 🤖 | Generate `ETL_2/cleanup.py` | 🔲 Pending |
| 4.4 | 👤 | Test verification | 🔲 Pending |

---

## 11. Phase 5: Frontend Updates

**Duration:** 2 hours  
**Dependencies:** Phase 2  
**Owner:** 🤖 Copilot generates, 👤 You test

### 11.1 Objectives

- Add date range picker component
- Add coverage/confidence display
- Add platform selector (Reddit/Twitter/Both)
- Update existing analysis page

### 11.2 Files

| File | Action | Description |
|------|--------|-------------|
| `client/src/components/analysis/DateRangePicker.tsx` | 🔲 Create | Date selection |
| `client/src/components/analysis/CoverageDisplay.tsx` | 🔲 Create | Coverage breakdown |
| `client/src/components/analysis/PlatformSelector.tsx` | 🔲 Create | Platform choice |
| `client/src/components/analysis/ConfidenceIndicator.tsx` | 🔲 Create | Tier badge |
| `client/src/hooks/useAnalytics.ts` | 🔲 Create | Analytics API hook |
| `client/src/pages/PipelineTester.tsx` | 🔲 Modify | Integrate components |

### 11.3 UI Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ANALYSIS PAGE MOCKUP                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Keyword: [_______________] [🔍 Analyze]                            │   │
│  │                                                                      │   │
│  │  Platform: [○ Reddit  ○ Twitter  ● Both]                           │   │
│  │                                                                      │   │
│  │  Date Range: [Last 7 days ▼]  or  [Jan 1] to [Jan 15]              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  CONFIDENCE: HIGH ████████████ 85%                                  │   │
│  │                                                                      │   │
│  │  Coverage Breakdown:                                                │   │
│  │  ├── Date Coverage:    90% ████████░░                              │   │
│  │  ├── Data Density:     80% ████████░░                              │   │
│  │  └── Volume Score:     85% ████████░░                              │   │
│  │                                                                      │   │
│  │  ⚠️ Warning: Data concentrated on 5 of 15 days                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SENTIMENT CHART                                   │   │
│  │                                                                      │   │
│  │     📈 [Chart showing sentiment over time]                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.4 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 5.1 | 🤖 | Generate `DateRangePicker.tsx` | 🔲 Pending |
| 5.2 | 🤖 | Generate `CoverageDisplay.tsx` | 🔲 Pending |
| 5.3 | 🤖 | Generate `PlatformSelector.tsx` | 🔲 Pending |
| 5.4 | 🤖 | Generate `ConfidenceIndicator.tsx` | 🔲 Pending |
| 5.5 | 🤖 | Generate `useAnalytics.ts` | 🔲 Pending |
| 5.6 | 🤖 | Update `PipelineTester.tsx` | 🔲 Pending |
| 5.7 | 👤 | Run `npm run dev` in client | 🔲 Pending |
| 5.8 | 👤 | Test UI in browser | 🔲 Pending |

---

## 12. Phase 6: Testing & Validation

**Duration:** 1 hour  
**Dependencies:** All phases  
**Owner:** 👤 You execute, 🤖 Copilot debugs

### 12.1 Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|-----------------|
| Cache Hit | Search cached keyword "iPhone" | Response < 100ms, status: CACHE_HIT |
| Cache Miss | Search new keyword "newbrand123" | Triggers ETL, status: CACHE_MISS |
| Partial Coverage | Search with date range outside cache | Warning displayed, coverage % shown |
| Twitter Search | Search on Twitter platform | Uses Twitter data if available |
| Circuit Breaker | Simulate 5 failures | Circuit opens, requests blocked |
| Date Filtering | Query with specific date range | Only data from range returned |

### 12.2 Tasks

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 6.1 | 👤 | Test cache hit scenario | 🔲 Pending |
| 6.2 | 👤 | Test cache miss scenario | 🔲 Pending |
| 6.3 | 👤 | Test partial coverage | 🔲 Pending |
| 6.4 | 👤 | Test Twitter integration | 🔲 Pending |
| 6.5 | 👤 | Test date filtering | 🔲 Pending |
| 6.6 | 👤 | Report any issues | 🔲 Pending |

---

## 13. Task Distribution

### 13.1 Summary

| Role | Tasks | Effort |
|------|-------|--------|
| 🤖 Copilot | Generate all code files, SQL, components | ~95% |
| 👤 You | Run commands, provide API keys, verify, test | ~5% |

### 13.2 Your Setup Checklist

Before starting implementation:

```
[ ] 1. PostgreSQL accessible (pgAdmin or psql)
[ ] 2. MongoDB running
[ ] 3. Reddit API credentials in .env (existing)
[ ] 4. Twitter Bearer Token ready (get from developer.twitter.com)
[ ] 5. Node.js and npm working
[ ] 6. Python environment configured
```

### 13.3 Environment Variables Needed

```env
# Existing (you should have these)
DATABASE_URL=postgresql://postgres:password@localhost:5432/loginDB2-22-NOV
MONGO_URI=mongodb://localhost:27017
MONGO_DB=BrandPulse_1
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=BrandPulse/2.0

# NEW - Add this for Twitter
TWITTER_BEARER_TOKEN=your_twitter_bearer_token_here
```

---

## 14. File Inventory

### 14.1 New Files to Create

| # | File Path | Phase | Purpose |
|---|-----------|-------|---------|
| 1 | `sql/001_cache_foundation.sql` | 0 | ✅ Created |
| 2 | `sql/002_user_personalization.sql` | 0 | User tables |
| 3 | `utils/normalizeKeyword.js` | 1 | JS normalization |
| 4 | `ETL_2/shared/__init__.py` | 1 | Package init |
| 5 | `ETL_2/shared/normalize.py` | 1 | Python normalization |
| 6 | `utils/coverageCalculator.js` | 2 | Coverage logic |
| 7 | `utils/sagaOrchestrator.js` | 2 | Saga pattern |
| 8 | `utils/cacheManager.js` | 2 | Cache operations |
| 9 | `routes/analytics.js` | 2 | Analytics API |
| 10 | `ETL_2/shared/circuit_breaker.py` | 3 | Rate protection |
| 11 | `ETL_2/shared/sentiment.py` | 3 | Shared sentiment |
| 12 | `ETL_2/twitter/__init__.py` | 3 | Package init |
| 13 | `ETL_2/twitter/bronze_ingest.py` | 3 | Twitter ingestion |
| 14 | `ETL_2/twitter/silver_transform.py` | 3 | Twitter cleaning |
| 15 | `ETL_2/platform_crawler.py` | 3 | Multi-platform |
| 16 | `utils/verification.js` | 4 | JS verification |
| 17 | `ETL_2/verification.py` | 4 | Python verification |
| 18 | `client/src/components/analysis/DateRangePicker.tsx` | 5 | Date picker |
| 19 | `client/src/components/analysis/CoverageDisplay.tsx` | 5 | Coverage UI |
| 20 | `client/src/components/analysis/PlatformSelector.tsx` | 5 | Platform choice |
| 21 | `client/src/components/analysis/ConfidenceIndicator.tsx` | 5 | Tier badge |
| 22 | `client/src/hooks/useAnalytics.ts` | 5 | API hook |

### 14.2 Files to Modify

| # | File Path | Phase | Changes |
|---|-----------|-------|---------|
| 1 | `routes/pipeline.js` | 2 | Cache-first logic |
| 2 | `client/src/pages/PipelineTester.tsx` | 5 | New components |
| 3 | `index.js` | 2 | Add analytics routes |

---

## 15. Validation Checklists

### 15.1 Phase 0 Checklist

```
[ ] Tables created:
    [ ] pipeline_runs
    [ ] api_usage_log
    [ ] platform_config
    [ ] keyword_categories
    [ ] seed_keywords
    [ ] keyword_cache
    [ ] keyword_synonyms
    [ ] verification_log
    [ ] silver_twitter_tweets
    [ ] user_search_history
    [ ] user_saved_reports
    [ ] user_keyword_alerts

[ ] Functions created:
    [ ] normalize_keyword()
    [ ] get_keyword_tier()
    [ ] calculate_density_score()
    [ ] update_api_usage()
    [ ] get_api_budget_remaining()

[ ] Seed data inserted:
    [ ] 8 categories
    [ ] ~60 keywords
    [ ] ~15 synonyms
    [ ] 2 platform configs
```

### 15.2 Phase 1 Checklist

```
[ ] Normalization tests pass:
    [ ] JavaScript: 13/13 passed
    [ ] Python: 13/13 passed
    [ ] SQL function matches JS/Python output
```

### 15.3 End-to-End Checklist

```
[ ] Search cached keyword → CACHE_HIT response
[ ] Search new keyword → ETL triggered
[ ] Coverage displayed correctly
[ ] Date filtering works
[ ] Twitter data (if configured) appears
[ ] User search history saved
[ ] No errors in console
```

---

## Next Step

**Ready to proceed?**

Say: **"Start Phase 0"**

And I'll generate the `sql/002_user_personalization.sql` file, then guide you through running the migrations.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 3, 2026 | Initial cache strategy plan |
| 2.0 | Jan 4, 2026 | Added Twitter, architecture decision, user personalization |
