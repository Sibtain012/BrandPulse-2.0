# BrandPulse 2.0 - Cache-First Architecture Strategy

**Document Version:** 1.0  
**Date:** January 2, 2026  
**Author:** Development Team  
**Project:** BrandPulse Sentiment Analysis Platform

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [System Architecture](#4-system-architecture)
5. [Database Design](#5-database-design)
6. [Cache Logic Flowchart](#6-cache-logic-flowchart)
7. [API Specifications](#7-api-specifications)
8. [Frontend Changes](#8-frontend-changes)
9. [Background Crawler](#9-background-crawler)
10. [Reddit API Limitations](#10-reddit-api-limitations)
11. [Implementation Phases](#11-implementation-phases)
12. [File Changes Summary](#12-file-changes-summary)
13. [Configuration Options](#13-configuration-options)

---

## 1. Executive Summary

### Current State
BrandPulse currently fetches data from Reddit API for **every user search**, resulting in:
- 30-60 second wait times per search
- Reddit API rate limiting issues at scale
- No data reuse between users
- No support for historical date ranges

### Proposed Solution
Implement a **Cache-First Architecture** that:
- Serves cached data instantly (< 100ms)
- Supports date range filtering
- Pre-populates popular keywords via background crawler
- Automatically grows cache from user searches

### Expected Outcomes
| Metric | Before | After |
|--------|--------|-------|
| Response time (cached) | N/A | < 100ms |
| Response time (new keyword) | 30-60s | 30-60s |
| Can handle 1000 concurrent users | ❌ No | ✅ Yes |
| Date range filtering | ❌ No | ✅ Yes |
| Works during Reddit downtime | ❌ No | ✅ Partially |

---

## 2. Problem Statement

### 2.1 Current Architecture Issues

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT FLOW (FRAGILE)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  User Search ──► Reddit API ──► Bronze ──► Silver ──► Gold     │
│       │              │                                          │
│       │         ⚠️ BOTTLENECK                                   │
│       │         • Rate limited (60 req/min)                     │
│       │         • Max ~100 posts per query                      │
│       │         • API downtime = App downtime                   │
│       │         • 1000 users = 1000x API calls                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Specific Problems

| Problem | Impact | Severity |
|---------|--------|----------|
| Every search hits Reddit API | 30-60 second wait per user | 🔴 High |
| No data reuse | 100 users searching "iPhone" = 100 API calls | 🔴 High |
| Reddit rate limits | 60 requests/minute max → App crashes at scale | 🔴 High |
| No date filtering | Users can't analyze specific time periods | 🟡 Medium |
| Reddit API downtime | Your app goes down too | 🔴 High |
| Limited data per call | Reddit returns ~100 posts max | 🟡 Medium |

### 2.3 User Requirements Not Currently Supported

```
User A: "Nike" sentiment for last 7 days
User B: "Nike" sentiment for January 2026
User C: "Nike" sentiment for last 90 days
User D: "iPhone vs Samsung" comparison for last month
```

**Current system cannot handle date-specific queries.**

---

## 3. Solution Overview

### 3.1 The Three Pillars

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   PILLAR 1              PILLAR 2              PILLAR 3          │
│   ─────────             ─────────             ─────────         │
│                                                                 │
│   PRE-SEEDED            CACHE-FIRST           INCREMENTAL       │
│   KEYWORDS              QUERY LOGIC           DATA BUILDING     │
│                                                                 │
│   • 50-100 popular      • Check cache         • Every search    │
│     brands pre-loaded     before Reddit         adds to cache   │
│   • Daily background    • Date range          • Daily crawler   │
│     refresh               filtering             fills gaps      │
│   • Ready before        • Coverage            • Historical      │
│     users arrive          calculation           data grows      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Simplified Flow Comparison

**BEFORE:**
```
User → Reddit API (60s) → Process → Display
```

**AFTER:**
```
User → Cache Check → HIT? → Filter by Date → Display (instant!)
            │
            └─ MISS? → Reddit API → Process → Add to Cache → Display
```

### 3.3 Key Concepts

#### Cache Hit
When we already have data for the requested keyword and date range. Response is instant (< 100ms).

#### Cache Miss
When we don't have data. Must fetch from Reddit, process, and store for future users.

#### Partial Coverage
When we have some but not all of the requested date range. User can choose to use available data or wait for fresh fetch.

#### Similar Keywords
When exact keyword not found but similar ones exist (e.g., "iPhone 15" when searching "iPhone 17").

---

## 4. System Architecture

### 4.1 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER REQUEST                                       │
│                                                                              │
│   Keyword: "iPhone"                                                          │
│   Date Range: Jan 1, 2026 → Jan 15, 2026                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STEP 1: NORMALIZE INPUT                              │
│                                                                              │
│   • keyword_normalized = "iphone" (lowercase, trimmed)                      │
│   • date_from = 2026-01-01                                                  │
│   • date_to = 2026-01-15                                                    │
│   • requested_days = 15                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STEP 2: CHECK CACHE METADATA                             │
│                                                                              │
│   Query: SELECT * FROM keyword_cache WHERE keyword_normalized = 'iphone'    │
│                                                                              │
│   Result:                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ keyword: "iPhone"                                                    │   │
│   │ earliest_post_date: 2025-12-20                                      │   │
│   │ latest_post_date: 2026-01-15                                        │   │
│   │ total_posts: 234                                                     │   │
│   │ total_comments: 1,456                                                │   │
│   │ last_ingested_at: 2026-01-15 10:30:00                               │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STEP 3: CALCULATE COVERAGE                               │
│                                                                              │
│   User wants: Jan 1 → Jan 15 (15 days)                                      │
│   We have: Dec 20 → Jan 15 (27 days)                                        │
│                                                                              │
│   Overlap calculation:                                                       │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   Dec 20 ─────────────────────────────────────────── Jan 15         │   │
│   │   [===================CACHE DATA====================]               │   │
│   │                                                                      │   │
│   │            Jan 1 ─────────────────── Jan 15                         │   │
│   │            [======USER REQUEST======]                                │   │
│   │                                                                      │   │
│   │   Overlap: Jan 1 → Jan 15 = 15 days                                 │   │
│   │   Coverage: 15/15 = 100% ✅                                          │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        STEP 4: DECISION LOGIC                                │
│                                                                              │
│   Coverage >= 70%?                                                           │
│       │                                                                      │
│       ├── YES → CACHE HIT: Return filtered data instantly                   │
│       │                                                                      │
│       └── NO → PARTIAL: Show user options or fetch fresh                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     STEP 5: QUERY SILVER LAYER                               │
│                                                                              │
│   SELECT sentiment data FROM silver_reddit_posts                            │
│   WHERE keyword ILIKE '%iPhone%'                                            │
│   AND created_at_utc BETWEEN '2026-01-01' AND '2026-01-15'                 │
│                                                                              │
│   Result: 89 posts, 567 comments with sentiment scores                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       STEP 6: RETURN TO USER                                 │
│                                                                              │
│   Response time: 87ms (instant!)                                            │
│   Posts analyzed: 89                                                         │
│   Comments analyzed: 567                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                         (React + TypeScript)                                │
│                                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │ Search Form  │  │ Date Picker  │  │ Results View │  │ Coverage UI  │   │
│   │ + Keyword    │  │ + Presets    │  │ + Charts     │  │ + Warnings   │   │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTP API
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
│                           (Node.js + Express)                               │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                         Pipeline Router                               │  │
│   │                                                                       │  │
│   │  POST /analyze ──► Cache Check ──► Coverage Calc ──► Decision        │  │
│   │  GET /results  ──► Date Filter ──► Aggregate ──► Return              │  │
│   │  GET /status   ──► Check global_keywords.status                      │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
┌─────────────────────────┐   ┌─────────────────────────────────────────────┐
│       MongoDB           │   │              PostgreSQL                      │
│    (Bronze Layer)       │   │         (Silver + Gold Layers)              │
│                         │   │                                              │
│ • bronze_raw_reddit_data│   │ • keyword_cache (NEW)                       │
│ • bronze_ingestion_jobs │   │ • seed_keywords (NEW)                       │
│                         │   │ • keyword_categories (NEW)                  │
│                         │   │ • silver_reddit_posts                       │
│                         │   │ • silver_reddit_comments                    │
│                         │   │ • fact_sentiment_events                     │
└─────────────────────────┘   └─────────────────────────────────────────────┘

              ┌─────────────────────────────────────────────┐
              │           BACKGROUND CRAWLER                 │
              │              (Python)                        │
              │                                              │
              │  Runs every 24 hours:                       │
              │  • Crawls seed keywords                     │
              │  • Updates cache metadata                   │
              │  • Builds historical data                   │
              └─────────────────────────────────────────────┘
```

---

## 5. Database Design

### 5.1 New Tables

#### Table: `keyword_categories`

**Purpose:** Organize keywords by industry/type for browsing and management.

| Column | Type | Description |
|--------|------|-------------|
| category_id | SERIAL | Primary key |
| name | TEXT | Category name (unique) |
| description | TEXT | Brief description |
| icon | TEXT | Emoji or icon class |
| created_at | TIMESTAMPTZ | Creation timestamp |

**Sample Data:**

| category_id | name | description | icon |
|-------------|------|-------------|------|
| 1 | Technology | Tech brands, gadgets, software | 💻 |
| 2 | Fashion & Apparel | Clothing, sportswear | 👕 |
| 3 | Automotive | Car manufacturers | 🚗 |
| 4 | Entertainment | Streaming, gaming, media | 🎮 |
| 5 | E-commerce | Online marketplaces | 🛒 |
| 6 | Finance | Banks, crypto, fintech | 💰 |
| 7 | Food & Beverage | Restaurants, drinks | 🍔 |
| 8 | Social Media | Platforms and apps | 📱 |

---

#### Table: `seed_keywords`

**Purpose:** Admin-defined keywords to pre-crawl before users arrive.

| Column | Type | Description |
|--------|------|-------------|
| seed_id | SERIAL | Primary key |
| keyword | TEXT | The keyword (unique) |
| category_id | INTEGER | Foreign key to categories |
| priority | INTEGER | 1-10, higher = crawl first |
| is_active | BOOLEAN | Whether to crawl this keyword |
| crawl_frequency_hrs | INTEGER | How often to refresh |
| last_crawled_at | TIMESTAMPTZ | Last crawl timestamp |
| created_at | TIMESTAMPTZ | Creation timestamp |

**Sample Data:**

| seed_id | keyword | category_id | priority | crawl_freq_hrs |
|---------|---------|-------------|----------|----------------|
| 1 | iPhone | 1 | 10 | 12 |
| 2 | Samsung Galaxy | 1 | 10 | 12 |
| 3 | Nike | 2 | 10 | 24 |
| 4 | Tesla | 3 | 9 | 24 |
| 5 | Netflix | 4 | 8 | 24 |
| 6 | ChatGPT | 1 | 10 | 12 |
| 7 | Bitcoin | 6 | 9 | 12 |

**Recommended Seed Keywords (50-60 total):**

| Category | Keywords |
|----------|----------|
| Technology | iPhone, Samsung Galaxy, MacBook, Google Pixel, PlayStation 5, Xbox, Nintendo Switch, Windows 11, ChatGPT, Nvidia RTX, AMD Ryzen, Apple Watch, AirPods, Meta Quest |
| Fashion | Nike, Adidas, Puma, Lululemon, Zara, H&M, Uniqlo, Supreme, Jordan, Yeezy |
| Automotive | Tesla, BMW, Mercedes, Toyota, Ford F-150, Rivian, Porsche |
| Entertainment | Netflix, Disney Plus, Spotify, HBO Max, YouTube Premium, Twitch, Steam |
| E-commerce | Amazon Prime, Temu, Shein, AliExpress, Walmart |
| Finance | Bitcoin, Ethereum, Robinhood, PayPal, Coinbase |
| Social Media | TikTok, Instagram, Twitter X, Reddit, Snapchat |

---

#### Table: `keyword_cache` (Most Critical)

**Purpose:** Track cached data availability and date coverage.

| Column | Type | Description |
|--------|------|-------------|
| cache_id | SERIAL | Primary key |
| keyword | TEXT | Original keyword |
| keyword_normalized | TEXT | Lowercase, trimmed |
| platform_id | INTEGER | 1 = Reddit |
| total_posts | INTEGER | Count of posts |
| total_comments | INTEGER | Count of comments |
| **earliest_post_date** | DATE | Oldest post we have |
| **latest_post_date** | DATE | Newest post we have |
| **date_coverage_days** | INTEGER | Total days of data |
| last_ingested_at | TIMESTAMPTZ | Last Reddit fetch |
| last_accessed_at | TIMESTAMPTZ | Last user query |
| access_count | INTEGER | Popularity score |
| refresh_priority | INTEGER | Higher = refresh sooner |
| source | TEXT | 'seed', 'user', or 'trending' |
| category_id | INTEGER | Foreign key to categories |
| is_stale | BOOLEAN | Marked for refresh |

**Sample Data:**

| keyword | earliest | latest | posts | comments | accesses | source |
|---------|----------|--------|-------|----------|----------|--------|
| iPhone | 2025-12-15 | 2026-01-15 | 456 | 2,340 | 127 | seed |
| Nike | 2025-12-20 | 2026-01-14 | 234 | 1,456 | 89 | seed |
| Tesla | 2025-12-18 | 2026-01-15 | 312 | 1,890 | 156 | seed |
| Rivian | 2026-01-10 | 2026-01-14 | 23 | 89 | 12 | user |
| ChatGPT | 2025-12-01 | 2026-01-15 | 567 | 4,230 | 234 | seed |

---

### 5.2 Existing Tables (No Changes Required)

The following tables already have the required `created_at_utc` field for date filtering:

- `silver_reddit_posts` ✅
- `silver_reddit_comments` ✅
- `fact_sentiment_events` ✅

---

## 6. Cache Logic Flowchart

### 6.1 Main Decision Tree

```
                    ┌─────────────────────────┐
                    │   User Search Request   │
                    │   keyword + date_range  │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Normalize Keyword      │
                    │  "iPhone 15" → "iphone 15"
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  Query keyword_cache    │
                    │  for this keyword       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
              FOUND │                       │ NOT FOUND
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────────┐
        │ Calculate Date    │   │ Check Similar         │
        │ Coverage          │   │ Keywords (fuzzy)      │
        └─────────┬─────────┘   └───────────┬───────────┘
                  │                         │
                  ▼                   ┌─────┴─────┐
        ┌─────────────────┐          │           │
        │ Coverage >= 70%?│    SIMILAR      NO MATCH
        └────────┬────────┘     FOUND           │
                 │                │              │
          ┌──────┴──────┐        ▼              ▼
          │             │   ┌─────────┐   ┌───────────┐
        YES            NO   │ Return  │   │ Fetch     │
          │             │   │ Suggest-│   │ from      │
          ▼             ▼   │ ions    │   │ Reddit    │
   ┌───────────┐  ┌─────────┴─┐       │   └─────┬─────┘
   │ CACHE HIT │  │ PARTIAL   │       │         │
   │           │  │ COVERAGE  │       │         │
   │ Return    │  │           │       │         ▼
   │ filtered  │  │ Show user │       │  ┌───────────────┐
   │ data      │  │ options   │       │  │ Run Pipeline  │
   │           │  │           │       │  │ Bronze→Silver │
   │ <100ms    │  │           │       │  │ →Gold         │
   └───────────┘  └───────────┘       │  └───────┬───────┘
                                      │          │
                                      │          ▼
                                      │  ┌───────────────┐
                                      │  │ Update Cache  │
                                      │  │ Metadata      │
                                      │  └───────────────┘
```

### 6.2 Coverage Calculation Algorithm

```
INPUTS:
  - user_date_from: User's requested start date
  - user_date_to: User's requested end date
  - cache_earliest: Earliest post date in cache
  - cache_latest: Latest post date in cache

ALGORITHM:
  
  1. Calculate requested range:
     requested_days = user_date_to - user_date_from
  
  2. Calculate overlap:
     overlap_start = MAX(user_date_from, cache_earliest)
     overlap_end = MIN(user_date_to, cache_latest)
     
     IF overlap_start > overlap_end:
         overlap_days = 0  // No overlap
     ELSE:
         overlap_days = overlap_end - overlap_start
  
  3. Calculate coverage:
     coverage_percent = (overlap_days / requested_days) * 100

THRESHOLD: 70% coverage = auto-use cache
```

### 6.3 Coverage Examples

**Example 1: Full Coverage (100%)**
```
User wants: Jan 1 → Jan 15 (15 days)
Cache has: Dec 20 → Jan 20 (31 days)
Overlap: Jan 1 → Jan 15 (15 days)
Coverage: 15/15 = 100% ✅ → CACHE HIT
```

**Example 2: Partial Coverage (35%)**
```
User wants: Dec 1 → Dec 31 (31 days)
Cache has: Dec 20 → Jan 15 (26 days)
Overlap: Dec 20 → Dec 31 (11 days)
Coverage: 11/31 = 35% ⚠️ → Show options to user
```

**Example 3: No Coverage (0%)**
```
User wants: Nov 1 → Nov 30 (30 days)
Cache has: Dec 20 → Jan 15 (26 days)
Overlap: None (0 days)
Coverage: 0/30 = 0% ❌ → Fetch from Reddit
```

---

## 7. API Specifications

### 7.1 POST /api/pipeline/analyze

**Request Body:**
```json
{
  "keyword": "iPhone",
  "user_id": 1,
  "date_from": "2026-01-01",
  "date_to": "2026-01-15",
  "force_refresh": false
}
```

**Response: Cache Hit (100% Coverage)**
```json
{
  "status": "CACHE_HIT",
  "cached": true,
  "request_id": 45,
  "coverage": {
    "percent": 100,
    "requested_range": {
      "from": "2026-01-01",
      "to": "2026-01-15",
      "days": 15
    },
    "available_range": {
      "from": "2025-12-20",
      "to": "2026-01-15",
      "days": 27
    },
    "posts_in_range": 89,
    "comments_in_range": 567
  },
  "message": "Instant results from cache",
  "response_time_ms": 87
}
```

**Response: Partial Coverage (35%)**
```json
{
  "status": "PARTIAL_COVERAGE",
  "cached": true,
  "request_id": 45,
  "coverage": {
    "percent": 35,
    "requested_range": {
      "from": "2025-12-01",
      "to": "2025-12-31",
      "days": 31
    },
    "overlap_range": {
      "from": "2025-12-20",
      "to": "2025-12-31",
      "days": 11
    },
    "posts_in_range": 34
  },
  "options": [
    {
      "action": "USE_AVAILABLE",
      "description": "View 34 posts from Dec 20-31 (instant)"
    },
    {
      "action": "FETCH_FRESH",
      "description": "Fetch from Reddit (60 second wait)"
    }
  ],
  "message": "35% of requested date range available"
}
```

**Response: Similar Keywords Found**
```json
{
  "status": "SUGGESTIONS",
  "cached": false,
  "suggestions": [
    {
      "keyword": "iPhone 15",
      "match_score": 92,
      "total_posts": 234,
      "request_id": 42
    },
    {
      "keyword": "iPhone 14",
      "match_score": 85,
      "total_posts": 189,
      "request_id": 38
    }
  ],
  "message": "No exact match. Similar keywords available."
}
```

**Response: Cache Miss (Processing)**
```json
{
  "status": "PROCESSING",
  "cached": false,
  "request_id": 67,
  "message": "Fetching fresh data from Reddit. Please wait ~60 seconds."
}
```

### 7.2 GET /api/data/results/:requestId

**Request:**
```
GET /api/data/results/45?date_from=2026-01-01&date_to=2026-01-15
```

**Response:**
```json
{
  "request_id": 45,
  "keyword": "iPhone",
  "date_range": {
    "from": "2026-01-01",
    "to": "2026-01-15"
  },
  "posts": {
    "total": 89,
    "sentiment": [
      { "name": "Positive", "value": 45, "percentage": 50.6 },
      { "name": "Neutral", "value": 30, "percentage": 33.7 },
      { "name": "Negative", "value": 14, "percentage": 15.7 }
    ]
  },
  "comments": {
    "total": 567,
    "sentiment": [
      { "name": "Positive", "value": 289, "percentage": 51.0 },
      { "name": "Neutral", "value": 178, "percentage": 31.4 },
      { "name": "Negative", "value": 100, "percentage": 17.6 }
    ]
  }
}
```

---

## 8. Frontend Changes

### 8.1 Updated Search Form

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   🔍 BrandPulse Analyzer                                                    │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  Keyword:  [____________________iPhone____________________]         │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   📅 Time Period:                                                            │
│                                                                              │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────┐  │
│   │ Last    │ │ Last    │ │ Last    │ │ All     │ │ Custom Range        │  │
│   │ 7 days  │ │ 30 days │ │ 90 days │ │ Time    │ │ [Jan 1] → [Jan 15]  │  │
│   │   ✓     │ │         │ │         │ │         │ │                     │  │
│   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────────────────┘  │
│                                                                              │
│   ☐ Force fresh data (skip cache)                                           │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                         🔍 Analyze                                   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Cache Hit Banner

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ⚡ INSTANT RESULTS                                              87ms     │
│                                                                              │
│   Data loaded from cache • 89 posts • 567 comments                          │
│   Coverage: Jan 1 - Jan 15, 2026 (100%)                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Partial Coverage Warning

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   ⚠️ PARTIAL DATA AVAILABLE                                                 │
│                                                                              │
│   You requested: Dec 1 - Dec 31, 2025 (31 days)                             │
│   We have: Dec 20 - Dec 31, 2025 (11 days)                                  │
│                                                                              │
│   Coverage: ████████░░░░░░░░░░░░░░░░░░░░░░  35%                             │
│                                                                              │
│   ┌───────────────────────────┐  ┌───────────────────────────────────────┐  │
│   │  📊 View Available Data   │  │  🔄 Fetch Full Range (60s wait)       │  │
│   │      (34 posts, instant)  │  │     (May not get older posts)         │  │
│   └───────────────────────────┘  └───────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Similar Keywords Suggestions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│   💡 No exact match for "iPhone 17"                                         │
│                                                                              │
│   Similar keywords in our database:                                          │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  iPhone 15 Pro                                                       │   │
│   │  92% match • 234 posts • 1,456 comments                             │   │
│   │  [Use This]                                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  iPhone 14                                                           │   │
│   │  85% match • 189 posts • 987 comments                               │   │
│   │  [Use This]                                                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Or wait while we fetch "iPhone 17" from Reddit...                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Background Crawler

### 9.1 Purpose

Build historical data by crawling seed keywords regularly.

### 9.2 How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKGROUND CRAWLER                                   │
│                         (Runs every 24 hours)                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Get keywords to crawl (priority order)                              │
│                                                                              │
│ 1. High-priority seeds not crawled in 12+ hours                            │
│ 2. User-searched keywords with high access_count                            │
│ 3. Stale keywords (marked is_stale = true)                                  │
│ 4. Regular seeds not crawled in 24+ hours                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: For each keyword                                                     │
│                                                                              │
│   1. Fetch from Reddit API (~100 posts)                                     │
│   2. Run Bronze layer (store raw in MongoDB)                                │
│   3. Run Silver layer (clean + sentiment in PostgreSQL)                     │
│   4. Run Gold layer (aggregate facts)                                       │
│   5. Update keyword_cache metadata                                          │
│   6. Wait 60 seconds (rate limiting)                                        │
│                                                                              │
│   Repeat for next keyword...                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Commands

| Command | Description | Duration |
|---------|-------------|----------|
| `python seed_crawler.py --init` | Crawl all seeds (first time) | 2-3 hours |
| `python seed_crawler.py --refresh` | Refresh stale keywords | 30-60 min |
| `python seed_crawler.py --top 10` | Crawl top 10 priority | 15 min |
| `python seed_crawler.py --keyword "Tesla"` | Crawl specific keyword | 2 min |

### 9.4 Data Growth Timeline

| Time | Data Coverage |
|------|---------------|
| Week 1 | ~7 days per keyword |
| Week 2 | ~14 days per keyword |
| Week 4 | ~28 days per keyword |
| Month 3 | ~90 days per keyword |

---

## 10. Reddit API Limitations

### 10.1 Hard Constraints

| Limitation | Reality |
|------------|---------|
| No date filtering | API doesn't support `after` or `before` |
| Returns recent only | Typically 1-7 days of posts |
| Max 100 posts/query | Cannot get more in one call |
| Rate limited | 60 requests/minute |

### 10.2 Our Workarounds

| Limitation | Solution |
|------------|----------|
| No date filtering | Store all posts with `created_at_utc`, filter in PostgreSQL |
| Returns recent only | Daily crawler builds historical data over time |
| Max 100 posts | Multiple crawls accumulate data |
| Rate limited | Background crawler with 60s delays |

### 10.3 User Communication

Users should understand:
- Popular keywords have more historical data
- New/rare keywords only have recent data
- Very old dates (2020, 2021) are not available via API

---

## 11. Implementation Phases

### Phase 1: Database Setup (30 minutes)

| Task | Description |
|------|-------------|
| 1.1 | Create `keyword_categories` table |
| 1.2 | Create `seed_keywords` table with 50-60 keywords |
| 1.3 | Create `keyword_cache` table |
| 1.4 | Enable `pg_trgm` extension for fuzzy matching |
| 1.5 | Create `normalize_keyword()` function |

### Phase 2: Backend API Updates (1 hour)

| Task | Description |
|------|-------------|
| 2.1 | Update `/api/pipeline/analyze` with date params |
| 2.2 | Add cache checking logic |
| 2.3 | Add coverage calculation |
| 2.4 | Add similar keyword suggestions |
| 2.5 | Update `/api/data/results` with date filtering |

### Phase 3: Frontend Updates (1 hour)

| Task | Description |
|------|-------------|
| 3.1 | Add date range selector |
| 3.2 | Update `useAnalysis` hook |
| 3.3 | Add Cache Hit banner |
| 3.4 | Add Partial Coverage warning |
| 3.5 | Add Similar Keywords UI |

### Phase 4: Background Crawler (30 minutes)

| Task | Description |
|------|-------------|
| 4.1 | Create `seed_crawler.py` |
| 4.2 | Add CLI commands |
| 4.3 | Add cache metadata updates |

### Phase 5: Initial Population (2-3 hours, background)

| Task | Description |
|------|-------------|
| 5.1 | Run `python seed_crawler.py --init` |
| 5.2 | Verify cache metadata populated |

---

## 12. File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `sql/keyword_management.sql` | Database migration |
| `ETL_2/seed_crawler.py` | Background crawler |
| `client/src/components/DateRangePicker.tsx` | Date selection |
| `client/src/components/CoverageWarning.tsx` | Partial coverage UI |
| `client/src/components/KeywordSuggestions.tsx` | Similar keywords |

### Modified Files

| File | Changes |
|------|---------|
| `routes/pipeline.js` | Add cache logic, date params |
| `routes/data.js` | Add date filtering |
| `client/src/hooks/useAnalysis.ts` | Handle new responses |
| `client/src/pages/PipelineTester.tsx` | Add date picker, coverage UI |

### Unchanged Files

| File | Reason |
|------|--------|
| `ETL_2/bronze_layer.py` | Already stores `created_utc` |
| `ETL_2/silver_layer.py` | Already stores `created_at_utc` |
| `ETL_2/gold_layer.py` | Already works with dates |

---

## 13. Configuration Options

### Recommended Settings

| Setting | Value | Reason |
|---------|-------|--------|
| Coverage threshold | 70% | Balance between cache usage and data completeness |
| Cache freshness | 24 hours | Reddit data doesn't change that fast |
| High-priority crawl | 12 hours | Popular keywords need fresher data |
| Fuzzy match threshold | 30% | Catch similar keywords |
| Rate limit delay | 60 seconds | Stay under Reddit's 60 req/min |

### Date Range Presets

| Preset | Description |
|--------|-------------|
| Last 7 days | Most recent week |
| Last 30 days | Last month |
| Last 90 days | Last quarter |
| All Time | Everything cached |
| Custom | User-selected dates |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2, 2026 | Initial document |

---

**End of Document**
