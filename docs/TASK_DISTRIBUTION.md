# BrandPulse 2.0 - Task Distribution & Twitter Clarification

**Document Version:** 1.0  
**Date:** January 3, 2026  
**Purpose:** Clear task ownership and Twitter API clarification

---

## Table of Contents

1. [Task Distribution Overview](#1-task-distribution-overview)
2. [Twitter API Library Clarification](#2-twitter-api-library-clarification)
3. [Phase-by-Phase Task Breakdown](#3-phase-by-phase-task-breakdown)
4. [Your Setup Tasks (One-Time)](#4-your-setup-tasks-one-time)
5. [Implementation Checklist](#5-implementation-checklist)

---

## 1. Task Distribution Overview

### Summary

| Role | Responsibility | Effort |
|------|----------------|--------|
| **Copilot (Me)** | Generate all code files, SQL migrations, configurations | ~95% of coding |
| **You** | Run commands, provide credentials, verify outputs, make decisions | ~5% execution |

### Why This Split?

- **I cannot** run terminal commands directly - you must execute them
- **I cannot** access your environment variables or API keys
- **I cannot** see your database state - you must verify results
- **I can** generate complete, ready-to-use code files
- **I can** provide exact commands for you to run

---

## 2. Twitter API Library Clarification

### Question: Why not use a library like PRAW for Twitter?

Great question! Here's the comparison:

| Aspect | Reddit (PRAW) | Twitter/X |
|--------|---------------|-----------|
| **Library** | PRAW (Python Reddit API Wrapper) | **Tweepy** (Python Twitter API) |
| **Why used** | PRAW simplifies OAuth, pagination, rate limits | Tweepy does the same for Twitter |
| **Our approach** | Currently using PRAW ✅ | **Should use Tweepy** ✅ |

### Recommendation: Use Tweepy

```
Tweepy is to Twitter what PRAW is to Reddit
```

**Benefits of Tweepy:**
- ✅ Handles OAuth 2.0 Bearer Token automatically
- ✅ Built-in rate limit handling
- ✅ Pagination support
- ✅ Cleaner code than raw `requests`
- ✅ Well-documented, widely used
- ✅ Supports Twitter API v2

### Installation

```bash
pip install tweepy
```

### Comparison: Raw Requests vs Tweepy

**Without Tweepy (Raw):**
```python
import requests

headers = {'Authorization': f'Bearer {BEARER_TOKEN}'}
response = requests.get(
    'https://api.twitter.com/2/tweets/search/recent',
    headers=headers,
    params={'query': 'iPhone lang:en', 'tweet.fields': 'created_at,public_metrics'}
)
data = response.json()
```

**With Tweepy (Cleaner):**
```python
import tweepy

client = tweepy.Client(bearer_token=BEARER_TOKEN)
tweets = client.search_recent_tweets(
    query='iPhone lang:en -is:retweet',
    tweet_fields=['created_at', 'public_metrics', 'lang'],
    max_results=10
)
```

### Updated Dependency List

```
# requirements.txt additions
tweepy>=4.14.0      # Twitter API v2 client (like PRAW for Reddit)
```

---

## 3. Phase-by-Phase Task Breakdown

### Legend

| Symbol | Meaning |
|--------|---------|
| 🤖 | Copilot generates code |
| 👤 | You execute/verify |
| ⏳ | Wait for completion |

---

### Phase 0: Database Foundation

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 0.1 | 🤖 | Generate `sql/001_cache_foundation.sql` | ✅ DONE |
| 0.2 | 👤 | Open pgAdmin or psql | ⬜ |
| 0.3 | 👤 | Run the SQL migration file | ⬜ |
| 0.4 | 👤 | Verify: `SELECT COUNT(*) FROM seed_keywords;` → ~60 | ⬜ |
| 0.5 | 👤 | Verify: `SELECT normalize_keyword('iPhone 15!!!');` → 'iphone 15' | ⬜ |
| 0.6 | 👤 | Report any errors to me | ⬜ |

**Your commands:**
```sql
-- In pgAdmin Query Tool or psql
\i 'C:/path/to/sql/001_cache_foundation.sql'

-- Verify
SELECT COUNT(*) FROM seed_keywords;
SELECT COUNT(*) FROM keyword_categories;
SELECT normalize_keyword('  iPhone 15 Pro!!! ');
```

---

### Phase 1: Normalization Module

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 1.1 | 🤖 | Generate `utils/normalizeKeyword.js` | ⬜ |
| 1.2 | 🤖 | Generate `ETL_2/utils/__init__.py` | ⬜ |
| 1.3 | 🤖 | Generate `ETL_2/utils/normalize.py` | ⬜ |
| 1.4 | 👤 | Run: `node utils/normalizeKeyword.js` | ⬜ |
| 1.5 | 👤 | Run: `python ETL_2/utils/normalize.py` | ⬜ |
| 1.6 | 👤 | Verify both show "13/13 passed" | ⬜ |

**Your commands:**
```powershell
# Test JavaScript normalization
node utils/normalizeKeyword.js

# Test Python normalization
python ETL_2/utils/normalize.py
```

---

### Phase 2: Backend API Updates

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 2.1 | 🤖 | Generate `utils/coverageCalculator.js` | ⬜ |
| 2.2 | 🤖 | Generate `utils/sagaOrchestrator.js` | ⬜ |
| 2.3 | 🤖 | Update `routes/pipeline.js` (cache-first logic) | ⬜ |
| 2.4 | 🤖 | Update `routes/data.js` (date filtering) | ⬜ |
| 2.5 | 👤 | Install uuid: `npm install uuid` | ⬜ |
| 2.6 | 👤 | Restart backend: `nodemon index.js` | ⬜ |
| 2.7 | 👤 | Test endpoint manually | ⬜ |

**Your commands:**
```powershell
# Install dependency
npm install uuid

# Restart server
nodemon index.js
```

---

### Phase 3: Multi-Platform Crawler (Reddit + Twitter)

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 3.1 | 🤖 | Generate `ETL_2/twitter/bronze_ingest.py` | ⬜ |
| 3.2 | 🤖 | Generate `ETL_2/twitter/silver_transform.py` | ⬜ |
| 3.3 | 🤖 | Generate `ETL_2/shared/circuit_breaker.py` | ⬜ |
| 3.4 | 🤖 | Generate `ETL_2/platform_crawler.py` | ⬜ |
| 3.5 | 👤 | Install Tweepy: `pip install tweepy` | ⬜ |
| 3.6 | 👤 | Add `TWITTER_BEARER_TOKEN` to `.env` | ⬜ |
| 3.7 | 👤 | Test: `python ETL_2/twitter/bronze_ingest.py --test` | ⬜ |
| 3.8 | 👤 | Run seed crawl (background) | ⬜ |

**Your commands:**
```powershell
# Install Twitter library
pip install tweepy

# Add to .env file (you do this manually)
# TWITTER_BEARER_TOKEN=your_bearer_token_here

# Test Twitter connection
python ETL_2/twitter/bronze_ingest.py --test

# Run initial seed crawl (takes time)
python ETL_2/platform_crawler.py --platform twitter --init
```

**⚠️ IMPORTANT: You must provide your Twitter Bearer Token**

---

### Phase 4: Verification Jobs

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 4.1 | 🤖 | Generate `utils/verification.js` | ⬜ |
| 4.2 | 🤖 | Generate `ETL_2/verification.py` | ⬜ |
| 4.3 | 👤 | Test verification: `python ETL_2/verification.py --check` | ⬜ |
| 4.4 | 👤 | (Optional) Set up Windows Task Scheduler for daily runs | ⬜ |

---

### Phase 5: Frontend Updates

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 5.1 | 🤖 | Generate `DateRangePicker.tsx` | ⬜ |
| 5.2 | 🤖 | Generate `CoverageDisplay.tsx` | ⬜ |
| 5.3 | 🤖 | Generate `DensityWarning.tsx` | ⬜ |
| 5.4 | 🤖 | Generate `ConfidenceIndicator.tsx` | ⬜ |
| 5.5 | 🤖 | Update `PipelineTester.tsx` | ⬜ |
| 5.6 | 🤖 | Update `useAnalysis.ts` | ⬜ |
| 5.7 | 👤 | Run: `npm run dev` in client folder | ⬜ |
| 5.8 | 👤 | Test UI in browser | ⬜ |

**Your commands:**
```powershell
cd client
npm run dev
```

---

### Phase 6: Testing & Validation

| Task | Owner | Action | Status |
|------|-------|--------|--------|
| 6.1 | 👤 | Test: Search cached keyword (e.g., "iPhone") | ⬜ |
| 6.2 | 👤 | Test: Search new keyword (triggers crawl) | ⬜ |
| 6.3 | 👤 | Test: Date range filtering | ⬜ |
| 6.4 | 👤 | Test: Twitter search (if API connected) | ⬜ |
| 6.5 | 👤 | Verify coverage display shows correctly | ⬜ |
| 6.6 | 👤 | Report any issues to me | ⬜ |

---

## 4. Your Setup Tasks (One-Time)

These are things **only you** can do:

### 4.1 Environment Variables

Add to your `.env` file:

```env
# Existing (you should already have these)
MONGO_URI=mongodb://localhost:27017
MONGO_DB=brandpulse
REDDIT_CLIENT_ID=your_reddit_client_id
REDDIT_CLIENT_SECRET=your_reddit_client_secret
REDDIT_USER_AGENT=BrandPulse/2.0

# NEW - Add this for Twitter
TWITTER_BEARER_TOKEN=your_twitter_bearer_token_here
```

### 4.2 Get Twitter Bearer Token

1. Go to: https://developer.twitter.com/en/portal/dashboard
2. Create a project (if you haven't)
3. Create an App
4. Go to "Keys and Tokens" tab
5. Generate "Bearer Token"
6. Copy and paste into `.env`

### 4.3 Install New Dependencies

```powershell
# Python dependencies
pip install tweepy

# Node.js dependencies (if not already installed)
npm install uuid
```

### 4.4 Database Access

You need to be able to run SQL migrations. Confirm you can:
- Connect to PostgreSQL via pgAdmin or psql
- Run SQL files against your `loginDB2-22-NOV` database

---

## 5. Implementation Checklist

### Quick Reference: What You'll Do

```
[ ] 1. Run SQL migration in pgAdmin
[ ] 2. Verify tables created (run SELECT queries)
[ ] 3. Run normalization tests (node + python commands)
[ ] 4. Install npm packages (npm install uuid)
[ ] 5. Install pip packages (pip install tweepy)
[ ] 6. Add TWITTER_BEARER_TOKEN to .env
[ ] 7. Test Twitter API connection
[ ] 8. Restart backend server
[ ] 9. Run frontend dev server
[ ] 10. Test features in browser
[ ] 11. Report any errors to me
```

### Quick Reference: What I'll Do

```
[🤖] Generate all SQL migration files
[🤖] Generate all JavaScript utility files
[🤖] Generate all Python ETL files
[🤖] Generate all React components
[🤖] Update existing route files
[🤖] Provide exact commands for you to run
[🤖] Debug any errors you report
[🤖] Explain any issues
```

---

## 6. Revised File Structure (With Twitter)

After implementation, your project will have:

```
BrandPulse-2.0/
├── sql/
│   └── 001_cache_foundation.sql          # NEW
├── utils/
│   ├── normalizeKeyword.js               # NEW
│   ├── coverageCalculator.js             # NEW
│   ├── sagaOrchestrator.js               # NEW
│   └── verification.js                   # NEW
├── ETL_2/
│   ├── brandpulse_master.py              # EXISTING
│   ├── bronze_reddit_ingest.py           # EXISTING
│   ├── silver_layer.py                   # EXISTING
│   ├── gold_layer.py                     # EXISTING
│   ├── platform_crawler.py               # NEW (multi-platform)
│   ├── verification.py                   # NEW
│   ├── shared/                           # NEW FOLDER
│   │   ├── __init__.py
│   │   ├── normalize.py
│   │   ├── circuit_breaker.py
│   │   └── sentiment.py
│   └── twitter/                          # NEW FOLDER
│       ├── __init__.py
│       ├── bronze_ingest.py
│       └── silver_transform.py
├── client/src/
│   ├── components/
│   │   └── analysis/                     # NEW FOLDER
│   │       ├── DateRangePicker.tsx
│   │       ├── CoverageDisplay.tsx
│   │       ├── DensityWarning.tsx
│   │       └── ConfidenceIndicator.tsx
│   ├── hooks/
│   │   └── useAnalysis.ts                # MODIFIED
│   └── pages/
│       └── PipelineTester.tsx            # MODIFIED
└── routes/
    ├── pipeline.js                       # MODIFIED
    └── data.js                           # MODIFIED
```

---

## 7. Communication Protocol

### When to Tell Me

| Situation | What to Say |
|-----------|-------------|
| SQL error | "SQL error: [paste error message]" |
| Python error | "Python error when running [command]: [paste error]" |
| Node error | "Node error: [paste error]" |
| Test failed | "Test failed: expected X, got Y" |
| UI not working | "Frontend shows [describe issue]" |
| Confused | "I don't understand [specific thing]" |

### What I'll Respond With

- Fixed code
- Explanation of the issue
- Alternative approach if needed
- Next steps

---

## 8. Ready to Start?

### Step 1: Confirm Prerequisites

Before we begin, please confirm:

- [ ] You have pgAdmin or psql access to PostgreSQL
- [ ] You have your Twitter Bearer Token ready (or can get it)
- [ ] Your current Reddit pipeline is working
- [ ] You're in the BrandPulse-2.0 project directory

### Step 2: Begin Phase 0

Once you confirm, say:
> "Ready for Phase 0"

And I'll generate the SQL migration file for you to run.

---

## Summary

| Question | Answer |
|----------|--------|
| **What do I (Copilot) do?** | Generate 100% of the code |
| **What do you do?** | Run commands, provide API keys, verify outputs |
| **Twitter library?** | Yes, we'll use **Tweepy** (like PRAW for Reddit) |
| **How do we communicate?** | You report errors, I fix them |
| **First step?** | You confirm prerequisites, then say "Ready for Phase 0" |

---

**Ready when you are! 🚀**
