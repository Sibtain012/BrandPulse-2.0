# Intent Classification v2.0 — Architecture Diagram (Option B)

## Data Flow: Sentiment vs Intent (Parallel Pipelines)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INITIATES ANALYSIS                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        │                       │
        ┌───────────────▼─────────────────┐  ┌──────────────▼──────────────┐
        │  "Analyze Brand Sentiment"      │  │  "Classify Intent"          │
        │  (mode = "sentiment")           │  │  (mode = "intent")          │
        └───────────────┬─────────────────┘  └──────────────┬──────────────┘
                        │                                    │
        ┌───────────────▼──────────────────────────────────▼─┐
        │      Shared Bronze Layer (Platform Ingest)        │
        │  Extract data from social APIs                    │
        │  (Reddit + Twitter supported)                     │
        └───────────────┬──────────────────────────────────┬─┘
                        │                                    │
     (same data)        │                                    │  (same data)
                        │                                    │
        ┌───────────────▼─────────────┐  ┌─────────────────▼──────────────┐
        │  Silver Layer (Sentiment)   │  │  Silver Layer (Intent)         │
        │  ───────────────────────    │  │  ───────────────────────────   │
        │  silver_reddit_posts        │  │  silver_reddit_posts_intent    │
        │  ├─ id, text                │  │  ├─ id, text                   │
        │  ├─ sentiment_label ◀──┐    │  │  ├─ intent_label ◀──┐         │
        │  ├─ sentiment_score   │    │  │  ├─ intent_score   │         │
        │  └─ gold_processed    │    │  │  └─ gold_processed │         │
        │                       │    │  │                     │         │
        │  silver_twitter_tweets│    │  │  silver_twitter_tweets_intent│
        │  ├─ id, text          │    │  │  ├─ id, text                 │
        │  ├─ tweet_sentiment_* │    │  │  ├─ intent_label ◀───┐      │
        │  └─ ...               │    │  │  └─ intent_score      │      │
        │                       │    │  │                       │      │
        │ [Model 1: VADER]      │    │  │ [Model 2: Intent]    │      │
        │ Sentiment Analysis ───┘    │  │ Intent Classifier ───┘      │
        └───────────────┬─────────────┘  └─────────────────┬──────────┘
                        │                                    │
        ┌───────────────▼─────────────┐  ┌─────────────────▼──────────┐
        │  Gold Layer (Sentiment)     │  │  Gold Layer (Intent)       │
        │  ───────────────────────    │  │  ───────────────────────   │
        │  fact_sentiment_events      │  │  fact_intent_events        │
        │  ├─ silver_content_id       │  │  ├─ silver_content_id      │
        │  ├─ sentiment_id            │  │  ├─ intent_id              │
        │  ├─ sentiment_score         │  │  ├─ intent_score           │
        │  ├─ model_id = 1 (always)   │  │  ├─ model_id = 2 (always)  │
        │  └─ date_id, platform_id    │  │  └─ date_id, platform_id   │
        │                             │  │                            │
        │ [Unique constraint:         │  │ [Unique constraint:        │
        │  (silver_content_id,        │  │  (silver_content_id,       │
        │   model_id, platform_id)    │  │   model_id, platform_id)   │
        └───────────────┬─────────────┘  └─────────────────┬──────────┘
                        │                                    │
        ┌───────────────▼──────────────┐  ┌──────────────────▼────────┐
        │  Backend Data Routes         │  │  Backend Data Routes       │
        │  ────────────────────────    │  │  ────────────────────────  │
        │  /api/data/results/:id       │  │  /api/data/intent/results/:id
        │  /api/data/details/:id       │  │  /api/data/intent/details/:id
        │  /api/data/trends/:id        │  │  /api/data/trends/:id      │
        │    (date granularity)        │  │    (DEFERRED v3)           │
        └───────────────┬──────────────┘  └──────────────┬─────────────┘
                        │                                 │
        ┌───────────────▼─────────────────────────────────▼──┐
        │            Shared History Table                    │
        │  (analysis_history, indexed by user_id)           │
        │  ├─ analysis_mode: 'sentiment' | 'intent'         │
        │  ├─ dominant_sentiment (for mode='sentiment')    │
        │  ├─ dominant_intent (for mode='intent')          │
        │  └─ intent_distribution (for mode='intent')      │
        └───────────────┬───────────────────────────────────┘
                        │
        ┌───────────────▼─────────────────────────────────┐
        │        Frontend (React)                         │
        │  ─────────────────────────────                 │
        │  /sentiment-analysis  (SentimentAnalysis.jsx)   │
        │    ├─ Charts tab (Pie + Trends line chart)     │
        │    └─ Posts/Tweets/Comments tabs               │
        │                                                 │
        │  /intent-analysis      (IntentAnalysis.jsx)    │
        │    ├─ Charts tab (Pie + Bar chart)             │
        │    └─ Posts/Tweets tabs (no comments)          │
        │                                                 │
        │  /history             (History.jsx)            │
        │    └─ Mode badge on each card                  │
        └─────────────────────────────────────────────────┘
```

---

## Key Architectural Properties

### Tables: Completely Separate (No Cross-Pollination)

```
┌────────────────────────┐              ┌───────────────────────┐
│   Sentiment Schema     │              │   Intent Schema       │
├────────────────────────┤              ├───────────────────────┤
│ silver_reddit_posts    │              │ silver_reddit_posts_  │
│ ├─ sentiment_label     │              │ intent                │
│ ├─ sentiment_score     │              │ ├─ intent_label       │
│ └─ [NO intent cols]    │              │ ├─ intent_score       │
│                        │              │ └─ [NO sentiment cols]│
│ silver_twitter_tweets  │              │ silver_twitter_tweets_│
│ ├─ tweet_sentiment_*   │              │ intent                │
│ └─ [NO intent cols]    │              │ ├─ intent_label       │
│                        │              │ ├─ intent_score       │
│ fact_sentiment_events  │              │ └─ [NO sentiment cols]│
│ ├─ sentiment_id        │              │                       │
│ ├─ sentiment_score     │              │ fact_intent_events    │
│ └─ model_id = 1        │              │ ├─ intent_id          │
│   (always)             │              │ ├─ intent_score       │
│                        │              │ └─ model_id = 2       │
│ [Queries never need    │              │   (always)            │
│  mode filters]         │              │                       │
└────────────────────────┘              │ [Queries never need   │
                                        │  sentiment filters]   │
                                        └───────────────────────┘
```

### Query Pattern: No Cross-Contamination

```
SENTIMENT QUERY (simple, no filters needed):
──────────────────────────────────────────
SELECT sentiment_label, COUNT(*)
FROM fact_sentiment_events
WHERE request_id = $1
GROUP BY sentiment_label;
-- Only sentiment rows exist in fact_sentiment_events


INTENT QUERY (simple, no filters needed):
──────────────────────────────────────────
SELECT intent_label, COUNT(*)
FROM fact_intent_events
WHERE request_id = $1
GROUP BY intent_label;
-- Only intent rows exist in fact_intent_events


COMPARISON: Old multiplexed approach would require:
───────────────────────────────────────────────────
SELECT sentiment_label, COUNT(*)
FROM fact_sentiment_events
WHERE request_id = $1 AND model_id = 1   ◄── DEFENSIVE FILTER
GROUP BY sentiment_label;
-- Risk: forget the filter, get wrong counts!
```

---

## Frontend Routing by Mode

```
User lands on Landing.jsx
         │
    ┌────┴────┐
    │          │
    v          v
"Sentiment"  "Intent"
Analysis     Classification
    │          │
    v          v
Navigate to:  Navigate to:
/sentiment-   /intent-
analysis      analysis
    │          │
    v          v
axios POST    axios POST
/api/pipeline /api/pipeline
?mode=        ?mode=
"sentiment"   "intent"
    │          │
    └────┬─────┘
         │
    Python ETL
  (picks silver
   & fact table
    by mode)
         │
    ┌────┴────────────────┐
    │                     │
    v                     v
Fetch from:         Fetch from:
/api/data/          /api/data/
results/:id         intent/results/:id
    │                     │
    └────┬────────────────┘
         │
    Render charts
   (colors/labels
    matched to mode)
```

---

## Migration Path: Raw → Silver → Gold → API → UI

### Sentiment Path (Unchanged)
```
Bronze
├─ reddit_posts (raw)
└─ twitter_tweets (raw)
  ↓ [VADER sentiment classifier]
Silver
├─ silver_reddit_posts (sentiment_label, sentiment_score)
└─ silver_twitter_tweets (tweet_sentiment_label, tweet_sentiment_score)
  ↓ [Dimensional join + aggregation]
Gold
├─ fact_sentiment_events (sentiment_id from dim_sentiment)
  ↓ [SQL aggregation]
Backend
├─ /api/data/results/:id (sentiment counts)
├─ /api/data/details/:id (sentiment per post)
└─ /api/data/trends/:id (sentiment over time)
  ↓ [React fetch + render]
Frontend
└─ SentimentAnalysis.jsx (pie chart, trend line)
```

### Intent Path (New, Parallel)
```
Bronze
├─ reddit_posts (raw, same as sentiment)
└─ twitter_tweets (raw, same as sentiment)
  ↓ [Intent classifier (bertweet-intent-classifier-v2)]
Silver
├─ silver_reddit_posts_intent (intent_label, intent_score)
└─ silver_twitter_tweets_intent (intent_label, intent_score)
  ↓ [Dimensional join + aggregation]
Gold
├─ fact_intent_events (intent_id from dim_intent)
  ↓ [SQL aggregation]
Backend
├─ /api/data/intent/results/:id (intent counts)
├─ /api/data/intent/details/:id (intent per post)
└─ /api/data/trends/:id (DEFERRED: intent over time, v3)
  ↓ [React fetch + render]
Frontend
└─ IntentAnalysis.jsx (pie chart, bar chart)
```

---

## Dimension Tables (Shared References)

```
dim_model (shared)                    dim_platform (shared)
├─ model_id = 1 : sentiment model    ├─ 1 : Reddit
└─ model_id = 2 : intent model       └─ 2 : Twitter

dim_sentiment (used by sentiment)     dim_intent (used by intent)
├─ 1 : Positive                       ├─ 1 : Complaint
├─ 2 : Neutral                        ├─ 2 : Inquiry
└─ 3 : Negative                       └─ 3 : Praise

dim_date (shared)                     dim_time (shared)
├─ calendar_date                      └─ hour, minute
└─ date_id
```

---

## Cost/Benefit Summary

| Aspect | v1 (Multiplexed) | v2 (Separate) |
|--------|------------------|---------------|
| Schema pollution | ❌ Intent columns in sentiment tables | ✅ Frozen sentiment schema |
| Query complexity | ❌ Need `AND model_id = 1` filters | ✅ Pure table selects |
| Failure modes | ❌ Forget filter → silent bugs | ✅ Impossible to confuse tables |
| Schema evolution | ❌ New intent feature → sentiment churn | ✅ Independent table updates |
| Table count | ✅ Fewer (~4) | ❌ More (~7) |
| Developer cognitive load | ✅ One fact table | ❌ Two fact tables |

**Verdict:** v2 (Option B) wins on data integrity and maintainability. The extra 3 tables are a cheap price for clean separation.

---

**Diagram:** Option B — Separate Intent Tables Architecture  
**Status:** Visual reference for the Option B design.
