# Database Structure Visualization

## 🔴 CURRENT MESSY DATABASE (26 Tables)

```
┌──────────────────────────────────────────────────────────────────┐
│                      AUTHENTICATION MESS                          │
├──────────────────────────────────────────────────────────────────┤
│  auth_identities ──┬─> user_profiles                             │
│                    ├─> user_sessions                             │
│                    └─> verification_tokens                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   PLATFORM DUPLICATION! ❌                        │
├──────────────────────────────────────────────────────────────────┤
│  platforms (3 rows) ────────┐                                    │
│  platform_config (2 rows) ──┼─> ALL DOING THE SAME THING!       │
│  dim_platform (2 rows) ─────┘                                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│               POORLY NAMED & CONFUSING ❌                         │
├──────────────────────────────────────────────────────────────────┤
│  global_keywords (BAD NAME!)                                     │
│    ├─> What does "global" mean?                                 │
│    ├─> Is it keywords or requests?                              │
│    └─> Actually tracks: user analyses + pipeline status         │
│                                                                  │
│  silver_reddit_comment_sentiment_summary (TOO LONG!)             │
│    └─> Redundant with fact_sentiment_events?                    │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    POSSIBLY UNUSED ❓                             │
├──────────────────────────────────────────────────────────────────┤
│  campaigns - Marketing campaigns? Being used?                    │
│  keyword_cache - Outdated caching?                               │
│  pipeline_runs - Duplicate of global_keywords tracking?          │
│  silver_twitter_tweets - Are you using Twitter?                  │
│  api_usage_log - Being populated?                                │
│  ml_models - Different from dim_model?                           │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      THE GOOD PARTS ✅                            │
├──────────────────────────────────────────────────────────────────┤
│  DIMENSIONAL MODEL (Keep these!)                                 │
│    ├─ fact_sentiment_events                                      │
│    ├─ dim_sentiment                                              │
│    ├─ dim_date                                                   │
│    ├─ dim_time                                                   │
│    ├─ dim_content_type                                           │
│    └─ dim_model                                                  │
│                                                                  │
│  SILVER LAYER (Keep these!)                                      │
│    ├─ silver_reddit_posts                                        │
│    ├─ silver_reddit_comments                                     │
│    └─ silver_errors                                              │
│                                                                  │
│  NEW TABLES (Keep these!)                                        │
│    └─ analysis_history (just created!)                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 🟢 TARGET CLEAN DATABASE (15-18 Tables)

```
╔══════════════════════════════════════════════════════════════════╗
║                    AUTHENTICATION LAYER (4)                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   ┌──────────────────┐                                          ║
║   │ auth_identities  │                                          ║
║   │ ──────────────── │                                          ║
║   │ PK: user_id      │                                          ║
║   │ email, password  │                                          ║
║   └────────┬─────────┘                                          ║
║            │                                                     ║
║            ├──────────> user_profiles (user info)               ║
║            ├──────────> user_sessions (active logins)           ║
║            └──────────> verification_tokens (email verify)      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║                    ANALYSIS REQUEST LAYER (3)                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   ┌──────────────────────┐                                      ║
║   │ analysis_requests    │ ⭐ RENAMED from global_keywords      ║
║   │ ────────────────────  │                                      ║
║   │ PK: request_id       │                                      ║
║   │ FK: user_id          │                                      ║
║   │     keyword          │                                      ║
║   │     start_date       │                                      ║
║   │     end_date         │                                      ║
║   │     status           │                                      ║
║   └──────────┬───────────┘                                      ║
║              │                                                   ║
║              ├──────────> analysis_history                       ║
║              │            (summary/aggregate fact)               ║
║              │                                                   ║
║              └──────────> fact_sentiment_events                  ║
║                           (detail fact)                          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║               DIMENSIONAL MODEL - GOLD LAYER (7)                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║                    ┌─────────────────────────┐                  ║
║                    │ fact_sentiment_events   │ (CENTER)         ║
║                    │ ─────────────────────── │                  ║
║                    │ PK: fact_id             │                  ║
║                    │ FK: request_id          │                  ║
║                    │ FK: sentiment_id  ──────┼──> dim_sentiment ║
║                    │ FK: date_id       ──────┼──> dim_date      ║
║                    │ FK: time_id       ──────┼──> dim_time      ║
║                    │ FK: platform_id   ──────┼──> dim_platform  ║
║                    │ FK: content_type  ──────┼──> dim_content   ║
║                    │ FK: model_id      ──────┼──> dim_model     ║
║                    │     sentiment_score     │                  ║
║                    └─────────────────────────┘                  ║
║                                                                  ║
║   Supporting Dimensions:                                         ║
║   ├─ dim_sentiment (positive, neutral, negative)                ║
║   ├─ dim_date (date attributes)                                 ║
║   ├─ dim_time (time attributes)                                 ║
║   ├─ dim_platform (Reddit, Twitter) ⭐ CONSOLIDATED              ║
║   ├─ dim_content_type (post, comment)                           ║
║   └─ dim_model (RoBERTa, etc.)                                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║                    SILVER LAYER - ETL (3-4)                       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   silver_reddit_posts ──────> (processed posts)                 ║
║   silver_reddit_comments ───> (processed comments)              ║
║   silver_twitter_tweets ────> (if using Twitter)                ║
║   silver_errors ─────────────> (error tracking)                 ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════════════╗
║                      MONITORING LAYER (2)                         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║   audit_logs ────────────────> (user action tracking)           ║
║   api_usage_log ─────────────> (API call metrics)               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 📊 Side-by-Side Comparison

| Category | Before | After | Change |
|----------|--------|-------|--------|
| **Total Tables** | 26 | 15-18 | ⬇️ 30% reduction |
| **Platform Tables** | 3 (duplicates!) | 1 | ⬇️ 67% reduction |
| **Clear Naming** | ❌ global_keywords | ✅ analysis_requests | 🎯 Descriptive |
| **Unused Tables** | ~6-8 | 0 | ✅ All used |
| **Redundant Summaries** | ❌ silver_reddit_comment_sentiment_summary | ✅ Removed | 🎯 Use fact table |
| **FK Relationships** | ⚠️ Incomplete | ✅ Complete | 🔗 Enforced |

---

## 🎯 Data Flow Visualization

### **User Analysis Journey (Clean Architecture)**

```
1. USER ACTION
   │
   ├─> auth_identities (login)
   │
   └─> user_profiles (get preferences)

2. ANALYSIS REQUEST
   │
   └─> analysis_requests (CREATE new request)
       • Stores: keyword, dates, user_id
       • Status: PROCESSING

3. ETL PIPELINE
   │
   ├─> Bronze Layer: Fetch from Reddit API
   │
   ├─> silver_reddit_posts (STORE posts)
   │   silver_reddit_comments (STORE comments)
   │
   └─> Gold Layer: Generate sentiment

4. FACT TABLE POPULATION
   │
   └─> fact_sentiment_events (INSERT events)
       • Links to: dim_sentiment, dim_date, dim_time
       • Links to: dim_platform, dim_content_type
       • Links to: analysis_requests (via request_id)

5. SUMMARY GENERATION
   │
   └─> analysis_history (AUTO-SAVE summary)
       • Aggregate from fact table
       • Store: counts, percentages, distributions
       • Link to: analysis_requests, user

6. USER VIEWS RESULTS
   │
   ├─> Charts: Query analysis_history (FAST)
   │
   └─> Details: Query fact_sentiment_events (DETAILED)
```

---

## 🔧 Migration Path

### **Safe Migration Order**

```
Phase 1: Document & Backup
├─> Create DATABASE_SCHEMA.md
├─> Backup database
└─> Identify active vs unused tables

Phase 2: Low-Risk Cleanups
├─> Drop unused tables (campaigns, keyword_cache?)
├─> Clean old verification_tokens
└─> Archive old audit_logs

Phase 3: Consolidation
├─> Migrate platforms → dim_platform
├─> Drop platforms, platform_config
└─> Verify references work

Phase 4: Renaming (Requires code changes!)
├─> Rename global_keywords → analysis_requests
├─> Update all application code
├─> Update ETL scripts
└─> Deploy together

Phase 5: Relationship Fixes
├─> Add missing foreign keys
├─> Enforce referential integrity
└─> Add indexes where needed
```

---

## ✅ Success Metrics

After cleanup, you should have:

✅ **Clear Purpose** - Every table has obvious role
✅ **No Duplication** - One table per concept
✅ **Proper Naming** - Descriptive, consistent names
✅ **Enforced Relationships** - FKs prevent orphans
✅ **Documented** - DATABASE_SCHEMA.md up to date
✅ **Performant** - Proper indexes, no redundancy

---

**Ready to start cleaning?** Let me know which phase you want to tackle first!
