# BrandPulse Dimensional Model Architecture

## 📊 Complete Constellation Schema

```
┌────────────────────────────────────────────────────────────────────┐
│                     DIMENSIONAL MODEL OVERVIEW                      │
└────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────┐
                    │  user_profiles      │ (Dimension)
                    │  ─────────────────  │
                    │  PK: profile_id     │
                    │      user_id        │
                    │      full_name      │
                    │      subscription   │
                    │      is_2fa_enabled │
                    └──────────┬──────────┘
                               │
                               │ FK: user_id
                               │
                    ┌──────────▼──────────────────────┐
                    │  analysis_history               │ (Summary/Aggregate Fact)
                    │  ──────────────────────────────  │
                    │  PK: history_id                 │
                    │  FK: user_id ────────────────┐  │
                    │  FK: request_id              │  │
                    │      keyword                 │  │
                    │      start_date, end_date    │  │
                    │      total_posts             │  │ Pre-aggregated
                    │      total_comments          │  │ from fact table
                    │      sentiment_distribution  │  │
                    │      chart_results (FUTURE)  │  │ ← Perfect place!
                    │      avg_sentiment_score     │  │
                    │      positive_percentage     │  │
                    └──────────┬──────────────────────┘
                               │
                               │ FK: request_id
                               │
                    ┌──────────▼────────────────┐
                    │  global_keywords          │ (Conformed Dimension)
                    │  ────────────────────────  │
                    │  PK: global_keyword_id    │
                    │      user_id              │
                    │      keyword              │
                    │      start_date           │
                    │      end_date             │
                    │      status               │
                    │      bronze_processed     │
                    │      last_run_at          │
                    └──────────┬────────────────┘
                               │
                               │ FK: request_id
                               │
                    ┌──────────▼───────────────────────┐
                    │  fact_sentiment_events           │ (Detail Fact)
                    │  ────────────────────────────────  │
                    │  PK: fact_id                     │
                    │  FK: request_id                  │
                    │  FK: sentiment_id  ──────┐       │
                    │  FK: date_id      ───────┼───┐   │
                    │  FK: time_id      ───────┼───┼─┐ │
                    │  FK: platform_id  ───────┼───┼─┼─┼─┐
                    │  FK: content_type_id ────┼───┼─┼─┼─┼─┐
                    │      post_id/comment_id  │   │ │ │ │ │
                    │      sentiment_score     │   │ │ │ │ │
                    │      compound_score      │   │ │ │ │ │
                    └──────────────────────────┘   │ │ │ │ │
                                                   │ │ │ │ │
          ┌────────────────────────────────────────┘ │ │ │ │
          │  ┌─────────────────────────────────────────┘ │ │ │
          │  │  ┌────────────────────────────────────────┘ │ │
          │  │  │  ┌───────────────────────────────────────┘ │
          │  │  │  │  ┌────────────────────────────────────────┘
          │  │  │  │  │
          ▼  ▼  ▼  ▼  ▼
    ┌──────┬──────┬──────┬──────┬──────────────┐
    │dim_  │dim_  │dim_  │dim_  │dim_content_  │
    │senti │date  │time  │plat  │type          │
    │ment  │      │      │form  │              │
    └──────┴──────┴──────┴──────┴──────────────┘
```

---

## 🎯 Key Relationships

### 1. User Dimension
```
user_profiles (1) ────< (M) analysis_history
```
- One user has many analyses
- Tracks: full_name, subscription_tier, 2FA status
- Cascade delete: User deleted → All their history deleted

### 2. Request/Analysis Link (Conformed Dimension)
```
analysis_history (M) >──── (1) global_keywords (1) ────< (M) fact_sentiment_events
```
- **global_keywords** acts as the bridge/conformed dimension
- Both fact tables reference the same request
- Enables drill-down: summary → detail

### 3. Traditional Star Schema (Detail Level)
```
fact_sentiment_events (center)
    ├── dim_sentiment
    ├── dim_date
    ├── dim_time
    ├── dim_platform
    └── dim_content_type
```

---

## 📈 Query Patterns

### Pattern 1: Fast User History (Use Summary Fact)
```sql
-- Query analysis_history ONLY (pre-aggregated)
SELECT 
    ah.keyword,
    ah.total_posts,
    ah.total_comments,
    ah.positive_percentage,
    up.full_name,
    up.subscription_tier
FROM analysis_history ah
JOIN user_profiles up ON ah.user_id = up.user_id
WHERE ah.user_id = 1
ORDER BY ah.analysis_timestamp DESC
LIMIT 20;

-- Result: Instant (20 rows scanned)
```

### Pattern 2: Detailed Drill-Down (Join to Detail Fact)
```sql
-- Drill into specific analysis events
SELECT 
    ah.keyword,
    fse.sentiment_label,
    fse.sentiment_score,
    dd.date_actual,
    dt.time_actual
FROM analysis_history ah
JOIN fact_sentiment_events fse ON ah.request_id = fse.request_id
JOIN dim_date dd ON fse.date_id = dd.date_id
JOIN dim_time dt ON fse.time_id = dt.time_id
WHERE ah.history_id = 123;

-- Result: Detailed events for specific analysis
```

### Pattern 3: User Analytics (Aggregate Multiple Analyses)
```sql
-- Summary across all user's analyses
SELECT 
    up.full_name,
    COUNT(ah.history_id) as total_analyses,
    SUM(ah.total_posts) as total_posts_analyzed,
    AVG(ah.positive_percentage) as avg_positive_sentiment
FROM user_profiles up
JOIN analysis_history ah ON up.user_id = ah.user_id
WHERE up.subscription_tier = 'PREMIUM'
GROUP BY up.user_id, up.full_name;

-- Result: User-level metrics
```

---

## 💾 Data Granularity Comparison

| Table | Granularity | Rows per Analysis | Use Case |
|-------|-------------|-------------------|----------|
| **analysis_history** | One row per analysis | **1 row** | User history, charts, summaries |
| **fact_sentiment_events** | One row per post/comment | **1000+ rows** | Detailed analysis, drill-down |

**Example:**
- User searches "bitcoin" with date range
- Bronze fetches 44 posts + 286 comments = 330 items
- **fact_sentiment_events**: 330 rows inserted
- **analysis_history**: 1 row inserted (summary of those 330)

---

## 🔄 Data Flow

```
1. User Input
   └─> keyword: "bitcoin", dates: "2026-01-01" to "2026-01-06"

2. Pipeline Execution
   ├─> Bronze: Fetch data (44 posts, 286 comments)
   ├─> Silver: Sentiment analysis on each item
   └─> Gold: INSERT into fact_sentiment_events (330 rows)

3. Pipeline Completion
   └─> Auto-save to analysis_history (1 row)
       ├─> Aggregate: COUNT, AVG, SUM from fact table
       ├─> Calculate: Percentages, distributions
       └─> Store: request_id, user_id, summary stats

4. User Views History
   └─> Query analysis_history (fast, 1 row)
   
5. User Clicks "View Details"
   └─> Query fact_sentiment_events (detailed, 330 rows)
```

---

## 🎨 Benefits of This Architecture

### 1. Performance
- ✅ User history page: Queries 10 rows instead of 10,000
- ✅ Chart data: Pre-aggregated, no calculation needed
- ✅ Indexes optimized for both summary and detail queries

### 2. Scalability
- ✅ Separate concerns: Summary vs Detail
- ✅ Can partition fact table by date (detail old data)
- ✅ Can archive old analyses to cold storage

### 3. Flexibility
- ✅ Easy to add new summary metrics (just update analysis_history)
- ✅ Detail facts remain unchanged
- ✅ Can add new dimensions without affecting summaries

### 4. Business Logic
- ✅ Track user subscription tier
- ✅ Limit free users (e.g., 10 analyses per month)
- ✅ Premium users get more history
- ✅ Chart results at correct granularity

---

## 🚀 Future Enhancements

### Phase 1: Current (✅ Complete)
```sql
analysis_history:
  - User tracking (user_id FK)
  - Request linking (request_id FK)
  - Pre-aggregated counts
  - Sentiment percentages
```

### Phase 2: Chart Results (Upcoming)
```sql
analysis_history:
  + chart_results JSONB
    {
      "posts_sentiment": [{"name": "positive", "value": 25}, ...],
      "comments_sentiment": [{"name": "neutral", "value": 15}, ...],
      "timeline": [{"date": "2026-01-01", "positive": 10, ...}, ...]
    }
```

### Phase 3: Advanced Dimensions (Future)
```sql
+ dim_subscription (separate from user_profiles)
+ dim_geography (if adding location data)
+ dim_source_subreddit (detailed Reddit data)
```

---

## 📊 Storage Impact

### Before (No History Table)
- Query user history: Scan **fact_sentiment_events** (millions of rows)
- No pre-aggregation: Recalculate on every page load
- Slow: 5-10 seconds per query

### After (With History Table)
- Query user history: Scan **analysis_history** (hundreds of rows)
- Pre-aggregated: Instant load
- Fast: < 100ms per query

**Trade-off:**
- Extra storage: ~1KB per analysis (negligible)
- Saved time: 9+ seconds per history page load
- **ROI: Massive! 🚀**

---

## ✅ Validation Queries

### Check Foreign Keys
```sql
-- Should return 2 foreign keys
SELECT 
    conname as constraint_name,
    conrelid::regclass as table_name,
    confrelid::regclass as foreign_table
FROM pg_constraint
WHERE conrelid = 'analysis_history'::regclass
  AND contype = 'f';
```

### Verify Constellation Connections
```sql
-- Test join path: user → history → request → facts
SELECT 
    up.user_id,
    COUNT(DISTINCT ah.history_id) as analyses,
    COUNT(DISTINCT fse.fact_id) as sentiment_events
FROM user_profiles up
LEFT JOIN analysis_history ah ON up.user_id = ah.user_id
LEFT JOIN fact_sentiment_events fse ON ah.request_id = fse.request_id
GROUP BY up.user_id;
```

---

**This architecture gives you the best of both worlds:**
- ⚡ Fast user history queries
- 🔍 Detailed drill-down capability
- 📊 Proper dimensional modeling
- 🎯 Perfect place for chart results

**Ready to implement!** 🚀
