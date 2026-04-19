# BrandPulse Twitter Integration — Implementation Plan (v3.0)

**Based on:** Full codebase review (brandpulse_clean/, schema files, package.json)
**Approach:** Extend the existing pipeline, not create a new one.
**Principle:** Every change is the minimum necessary. If Reddit doesn't need it changed, it doesn't get touched.

---

## What the codebase already has (do not recreate)

Before touching any file, note what is already done:

| Already exists                                       | Location                                |
| ---------------------------------------------------- | --------------------------------------- |
| `Platform.TWITTER` enum with `dim_id = 2`            | `models/enums.py`                       |
| `ContentType.TWEET` enum with `dim_id = 3`           | `models/enums.py`                       |
| `silver_twitter_tweets_silver_tweet_id_seq` (seq=38) | live DB — table was partially attempted |
| Platform is already the 3rd CLI arg                  | `main.py` line 9                        |
| Registry pattern ready for new entry                 | `pipeline/registry.py`                  |
| Gold router pattern ready for new branch             | `pipeline/gold/aggregator.py`           |
| `clean_text()` is platform-agnostic                  | `utils/text_processing/base.py`         |
| `run_sentiment_batch()` is platform-agnostic         | `pipeline/silver/sentiment.py`          |
| `get_mongo_collections()` lazy pattern               | `database/mongo.py`                     |
| `get_pg_connection()` lazy pattern                   | `database/postgres.py`                  |

---

## How the pipeline flows (Reddit, for reference)

```
main.py "tesla" 42 reddit
  └─ orchestrator.run_pipeline("tesla", 42, "reddit")
       └─ registry.get_pipeline("reddit") → RedditPipeline()
            ├─ .ingest("tesla", 42)       → bronze/reddit_ingest.ingest_keyword()
            ├─ .process(42)               → silver/reddit_processor.run_silver()
            └─ .aggregate("tesla", 42)    → gold/aggregator.run_gold_etl(..., platform="reddit")
                                               └─ gold/reddit_aggregator.run_reddit_gold()
```

Twitter will be exactly the same shape:

```
main.py "tesla" 42 twitter
  └─ orchestrator.run_pipeline("tesla", 42, "twitter")
       └─ registry.get_pipeline("twitter") → TwitterPipeline()
            ├─ .ingest("tesla", 42)        → bronze/twitter_ingest.ingest_keyword()
            ├─ .process(42)               → silver/twitter_processor.run_silver_twitter()
            └─ .aggregate("tesla", 42)    → gold/aggregator.run_gold_etl(..., platform="twitter")
                                               └─ gold/twitter_aggregator.run_twitter_gold()
```

---

## Files to create (4 new files)

### 1. `utils/text_processing/twitter.py`

Mirrors `utils/text_processing/reddit.py`. Calls `clean_text()` from base, then adds Twitter-specific stripping.

```python
"""
BrandPulse Clean – Twitter Text Processing
==========================================
Twitter-specific text cleaning and validation logic.
Mirrors: utils/text_processing/reddit.py
"""

import re
from utils.text_processing.base import clean_text


def clean_twitter_text(text: str) -> str:
    """
    Apply generic cleaning first, then Twitter-specific cleaning:
    1. Strip @mentions (privacy: no usernames in cleaned text)
    2. Strip #hashtags (noise for sentiment)
    3. Strip 'RT :' retweet prefix if it slipped through the filter
    """
    if not text:
        return ""

    cleaned = clean_text(text)               # handles URLs, HTML entities, whitespace

    cleaned = re.sub(r'@\w+', '', cleaned)   # remove @mentions
    cleaned = re.sub(r'#\w+', '', cleaned)   # remove #hashtags
    cleaned = re.sub(r'^RT\s*:\s*', '', cleaned)  # strip retweet prefix

    return cleaned.strip()


def is_eligible_tweet(tweet: dict) -> bool:
    """
    Check if a raw tweet dict is eligible for silver processing.
    Mirrors: utils/text_processing/reddit.is_eligible_comment()

    Rules (same rationale as Reddit filters):
    - Must have text
    - Must be English (lang == 'en')
    - Must not be a pure retweet (text starts with 'RT @')
    - Cleaned text must be >= 5 words
    """
    text = tweet.get("text", "")
    if not text:
        return False
    if tweet.get("lang", "") != "en":
        return False
    if text.strip().startswith("RT @"):
        return False

    cleaned = clean_twitter_text(text)
    return len(cleaned.split()) >= 5
```

---

### 2. `pipeline/bronze/twitter_ingest.py`

Mirrors `pipeline/bronze/reddit_ingest.py` structurally. Same job tracking pattern, same Mongo collections (new collection name: `bronze_raw_twitter_data`), same status signalling to Postgres.

```python
"""
BrandPulse Clean – Bronze Twitter Ingestion
============================================
Ingests tweets for a given keyword into MongoDB
(bronze_raw_twitter_data) via RapidAPI.

Mirrors: pipeline/bronze/reddit_ingest.py

Same patterns used:
- Lazy API client via _get_twitter_client()
- Same Postgres status signalling (mark_keyword_status)
- Same Mongo job + error tracking
- Same upsert pattern via bulk_write / UpdateOne
- Same privacy rule: only whitelisted fields are stored.
  The raw API response object is NEVER persisted.
"""

import os
import requests
from datetime import datetime, timezone

from pymongo import UpdateOne

from config.settings import RAPIDAPI_KEY          # add to settings.py + .env
from database.mongo import get_mongo_collections
from database.postgres import get_pg_connection
from models.enums import PipelineStatus
from utils.logging import get_logger

logger = get_logger("BRONZE-TWITTER")

# ---------------------------------------------------------------------------
# Lazy RapidAPI client
# ---------------------------------------------------------------------------
_RAPIDAPI_HOST = "twitter-api45.p.rapidapi.com"   # confirm with your subscription
_SEARCH_URL = f"https://{_RAPIDAPI_HOST}/search.php"

_headers = None

def _get_headers():
    global _headers
    if _headers is None:
        _headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": _RAPIDAPI_HOST,
        }
    return _headers


# ---------------------------------------------------------------------------
# Field whitelist — the ONLY fields stored from the API response.
# Author block, user metadata, profile info: never persisted.
# ---------------------------------------------------------------------------
ALLOWED_FIELDS = {
    "tweet_id", "text", "created_at", "lang",
    "favorite_count", "retweet_count", "reply_count", "quote_count",
}

def project_tweet(raw: dict) -> dict:
    """
    Extract only the whitelisted fields from a raw API tweet object.
    Everything else (author, user metadata, etc.) is dropped here,
    before the dict ever reaches MongoDB.
    """
    return {k: raw.get(k) for k in ALLOWED_FIELDS}


# ---------------------------------------------------------------------------
# Postgres helpers — identical to reddit_ingest.py versions
# ---------------------------------------------------------------------------
def mark_keyword_status(keyword_id, status):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute(
                "UPDATE global_keywords SET status = %s, last_run_at = NOW() WHERE global_keyword_id = %s",
                (status, keyword_id)
            )
        pg.commit()
    finally:
        pg.close()

def mark_keyword_processed(keyword_id):
    pg = get_pg_connection()
    try:
        with pg.cursor() as cur:
            cur.execute(
                "UPDATE global_keywords SET bronze_processed = TRUE WHERE global_keyword_id = %s",
                (keyword_id,)
            )
        pg.commit()
    finally:
        pg.close()


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------
def ingest_keyword(row_or_keyword, request_id=None):
    if isinstance(row_or_keyword, dict):
        keyword_id = int(row_or_keyword["global_keyword_id"])
        keyword = row_or_keyword["keyword"]
    else:
        keyword = row_or_keyword
        keyword_id = int(request_id) if request_id else None

    if not keyword_id:
        raise ValueError("No Request ID provided for Twitter ingestion.")

    bronze_col_reddit, jobs_col, errors_col = get_mongo_collections()
    # Use a separate Twitter collection on the same DB
    from database.mongo import _get_client
    twitter_col = _get_client()["BrandPulse_1"]["bronze_raw_twitter_data"]

    mark_keyword_status(keyword_id, PipelineStatus.PROCESSING.value)

    job_id = jobs_col.insert_one({
        "platform": "twitter",
        "keyword": keyword,
        "global_keyword_id": keyword_id,
        "started_at": datetime.now(timezone.utc),
        "status": "running"
    }).inserted_id

    operations = []
    processed = 0
    skipped = 0
    errors = 0

    logger.info("Ingesting keyword: %s", keyword)

    try:
        # --- Single endpoint, capped at 3 pages to respect quota ---
        cursor = None
        pages_fetched = 0
        MAX_PAGES = 3

        while pages_fetched < MAX_PAGES:
            params = {"query": keyword, "search_type": "Top"}
            if cursor:
                params["cursor"] = cursor

            response = requests.get(_SEARCH_URL, headers=_get_headers(), params=params, timeout=15)

            if response.status_code == 429:
                errors_col.insert_one({
                    "platform": "twitter", "keyword": keyword,
                    "error": "Rate limit hit (429). Aborting run.",
                    "occurred_at": datetime.now(timezone.utc)
                })
                logger.warning("Rate limit hit. Aborting Twitter ingest for: %s", keyword)
                break

            response.raise_for_status()
            data = response.json()

            tweets = data.get("timeline", [])
            if not tweets:
                break

            for raw_tweet in tweets:
                try:
                    # FILTER: English only
                    if raw_tweet.get("lang", "") != "en":
                        skipped += 1
                        continue

                    # FILTER: Pure retweets
                    text = raw_tweet.get("text", "")
                    if text.strip().startswith("RT @"):
                        skipped += 1
                        continue

                    # PRIVACY: project to whitelist only
                    tweet_doc = project_tweet(raw_tweet)
                    tweet_id = tweet_doc.get("tweet_id")
                    if not tweet_id:
                        skipped += 1
                        continue

                    base_doc = {
                        "platform": "twitter",
                        "keyword": keyword,
                        "fetched_at": datetime.now(timezone.utc),
                        "raw_tweet": tweet_doc,   # only whitelisted fields
                        "meta": {
                            "external_id": str(tweet_id),
                            "api_endpoint": "twitter.search",
                            "response_status": 200
                        }
                    }

                    operations.append(
                        UpdateOne(
                            {"platform": "twitter", "meta.external_id": str(tweet_id), "keyword": keyword},
                            {
                                "$setOnInsert": base_doc,
                                "$set": {
                                    "global_keyword_id": keyword_id,
                                    "silver_processed": False
                                }
                            },
                            upsert=True
                        )
                    )
                    processed += 1

                except Exception as e:
                    errors += 1
                    errors_col.insert_one({
                        "platform": "twitter", "keyword": keyword,
                        "error": str(e), "occurred_at": datetime.now(timezone.utc)
                    })

            # Pagination — RapidAPI returns a next_cursor field
            cursor = data.get("next_cursor")
            pages_fetched += 1
            if not cursor:
                break

        # Bulk write
        inserted = 0
        if operations:
            result = twitter_col.bulk_write(operations, ordered=False)
            inserted = result.upserted_count + result.inserted_count

        if inserted > 0:
            mark_keyword_processed(keyword_id)
            mark_keyword_status(keyword_id, PipelineStatus.COMPLETED.value)
        else:
            mark_keyword_status(keyword_id, PipelineStatus.IDLE.value)

    except Exception as e:
        mark_keyword_status(keyword_id, PipelineStatus.FAILED.value)
        errors_col.insert_one({
            "platform": "twitter", "keyword": keyword,
            "error": f"CRITICAL PIPELINE FAILURE: {str(e)}",
            "occurred_at": datetime.now(timezone.utc)
        })
        logger.error("Critical failure for %s: %s", keyword, e)

    jobs_col.update_one(
        {"_id": job_id},
        {"$set": {
            "finished_at": datetime.now(timezone.utc),
            "status": "completed",
            "stats": {"processed": processed, "inserted": inserted, "skipped": skipped, "errors": errors}
        }}
    )
    logger.info("Completed %s | Inserted: %d", keyword, inserted)
```

---

### 3. `pipeline/silver/twitter_processor.py`

Mirrors `pipeline/silver/reddit_processor.py`. Reads from `bronze_raw_twitter_data`, writes to `silver_twitter_tweets`.

```python
"""
BrandPulse Clean – Silver Twitter Processor
============================================
Cleans tweet text, runs BERTweet sentiment, writes to silver_twitter_tweets.

Mirrors: pipeline/silver/reddit_processor.py

Key differences from Reddit:
- Source collection: bronze_raw_twitter_data (not bronze_raw_reddit_data)
- Source field: raw_tweet (not raw_post / raw_comments)
- Text cleaner: clean_twitter_text (not clean_reddit_text)
- Eligibility check: is_eligible_tweet (not is_eligible_comment)
- Target table: silver_twitter_tweets (not silver_reddit_posts/comments)
- No nested comments structure — tweets are flat documents
- Sentiment model: same run_sentiment_batch() — zero change
"""

from datetime import datetime, timezone
from utils.logging import get_logger

logger = get_logger("SILVER-TWITTER")

from database.mongo import _get_client
from database.postgres import get_pg_connection
from utils.text_processing.base import hash_author   # not used (no author stored) — imported for parity
from utils.text_processing.twitter import clean_twitter_text, is_eligible_tweet
from pipeline.silver.sentiment import run_sentiment_batch


def run_silver_twitter(request_id, batch_size=50):
    pg_conn = get_pg_connection()
    cursor_pg = pg_conn.cursor()
    processed_mongo_ids = []

    twitter_col = _get_client()["BrandPulse_1"]["bronze_raw_twitter_data"]

    try:
        rid = int(request_id) if request_id else 0
        if not rid:
            logger.error("No Request ID provided. Aborting.")
            return
    except (TypeError, ValueError):
        logger.error("Invalid Request ID: %s", request_id)
        return

    query_filter = {
        "silver_processed": {"$ne": True},
        "global_keyword_id": rid
    }
    raw_docs = list(twitter_col.find(query_filter).limit(batch_size))

    if not raw_docs:
        logger.info("No new Twitter data to process for request %s.", rid)
        cursor_pg.close()
        pg_conn.close()
        return

    texts_to_score = []
    doc_mapping = []

    for raw_doc in raw_docs:
        try:
            tweet = raw_doc.get("raw_tweet", {})
            if not is_eligible_tweet(tweet):
                twitter_col.update_one(
                    {"_id": raw_doc["_id"]},
                    {"$set": {"silver_processed": True, "skipped_reason": "ineligible"}}
                )
                continue

            cleaned_text = clean_twitter_text(tweet.get("text", ""))
            texts_to_score.append(cleaned_text)
            doc_mapping.append({
                "raw_doc": raw_doc,
                "tweet": tweet,
                "cleaned_text": cleaned_text,
                "keyword": raw_doc.get("keyword"),
            })
        except Exception:
            continue

    if not texts_to_score:
        cursor_pg.close()
        pg_conn.close()
        return

    try:
        all_scores = run_sentiment_batch(texts_to_score)   # SAME model, zero changes
    except Exception as e:
        logger.error("Inference crash: %s", e)
        cursor_pg.close()
        pg_conn.close()
        raise e

    try:
        for i, item in enumerate(doc_mapping):
            if i >= len(all_scores):
                break

            raw_doc = item["raw_doc"]
            tweet = item["tweet"]
            sentiment = all_scores[i]

            tweet_id = tweet.get("tweet_id") or raw_doc.get("meta", {}).get("external_id")

            # Parse created_at — RapidAPI returns ISO string
            created_at = None
            raw_ts = tweet.get("created_at")
            if raw_ts:
                try:
                    created_at = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                except ValueError:
                    created_at = datetime.now(timezone.utc)

            cursor_pg.execute(
                """
                INSERT INTO silver_twitter_tweets (
                    original_bronze_id, platform, keyword, global_keyword_id,
                    tweet_id, text_clean, created_at_utc,
                    favorite_count, retweet_count, reply_count, quote_count,
                    sentiment_label, sentiment_score, processed_at_utc
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (tweet_id) DO UPDATE
                SET tweet_id = EXCLUDED.tweet_id
                RETURNING silver_tweet_id
                """,
                (
                    str(raw_doc["_id"]), "twitter", item["keyword"], rid,
                    str(tweet_id), item["cleaned_text"], created_at,
                    tweet.get("favorite_count", 0),
                    tweet.get("retweet_count", 0),
                    tweet.get("reply_count", 0),
                    tweet.get("quote_count", 0),
                    sentiment["label"], sentiment["score"],
                    datetime.now(timezone.utc)
                )
            )

            res = cursor_pg.fetchone()
            if res:
                processed_mongo_ids.append(raw_doc["_id"])

        pg_conn.commit()

        if processed_mongo_ids:
            twitter_col.update_many(
                {"_id": {"$in": processed_mongo_ids}},
                {"$set": {"silver_processed": True}}
            )
            logger.info("Committed %d tweets to silver.", len(processed_mongo_ids))

    except Exception as e:
        pg_conn.rollback()
        logger.error("Persistence error: %s", e)
        raise e
    finally:
        cursor_pg.close()
        pg_conn.close()
```

---

### 4. `pipeline/gold/twitter_aggregator.py`

Mirrors `pipeline/gold/reddit_aggregator.py`. Reads from `silver_twitter_tweets`, writes `platform_id=2` rows to `fact_sentiment_events`.

```python
"""
BrandPulse Clean – Gold Twitter Aggregator
============================================
Aggregates Silver Twitter data into fact_sentiment_events.

Mirrors: pipeline/gold/reddit_aggregator.py

Key difference: platform_id = 2, content_type_id = 3 (tweet),
source table = silver_twitter_tweets.
"""

from database.postgres import get_pg_connection

INSERT_TWEET_SENTIMENT_SQL = """
INSERT INTO fact_sentiment_events (
    silver_content_id, model_id, platform_id, content_type_id,
    sentiment_id, date_id, time_id, sentiment_score, request_id
)
SELECT
    st.silver_tweet_id,
    1,   -- Model: BERTweet
    2,   -- Platform: Twitter
    3,   -- Content Type: Tweet
    ds.sentiment_id,
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    st.sentiment_score,
    %s
FROM silver_twitter_tweets st
JOIN global_keywords gk ON gk.global_keyword_id = st.global_keyword_id
JOIN dim_sentiment ds ON ds.sentiment_label = st.sentiment_label
LEFT JOIN dim_date dd ON dd.date_actual = DATE(st.created_at_utc)
LEFT JOIN dim_time dt ON dt.time_id = (
    EXTRACT(HOUR FROM st.created_at_utc) * 100 +
    EXTRACT(MINUTE FROM st.created_at_utc)
)
WHERE st.global_keyword_id = %s
AND st.gold_processed = FALSE
AND (gk.start_date IS NULL OR DATE(st.created_at_utc) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(st.created_at_utc) <= gk.end_date)
ON CONFLICT ON CONSTRAINT fact_sentiment_events_unique_content DO NOTHING;
"""


def run_twitter_gold(keyword, request_id):
    conn = get_pg_connection()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            cur.execute(INSERT_TWEET_SENTIMENT_SQL, (request_id, request_id))
            tweets_inserted = cur.rowcount
            print(f"[GOLD] Inserted {tweets_inserted} tweet sentiment rows.")

            cur.execute("""
                UPDATE silver_twitter_tweets
                SET gold_processed = TRUE
                WHERE global_keyword_id = %s AND gold_processed = FALSE
            """, (request_id,))
            print(f"[GOLD] Marked {cur.rowcount} silver tweets as gold_processed.")

        conn.commit()
        print(f"[GOLD] Transaction committed for twitter.")
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
```

---

## Files to modify (4 existing files, minimal changes)

### 5. `pipeline/registry.py` — add `TwitterPipeline`

Add after the `RedditPipeline` class and before `PLATFORM_REGISTRY`:

```python
# NEW IMPORT (add to top of file)
from pipeline.bronze.twitter_ingest import ingest_keyword as ingest_twitter
from pipeline.silver.twitter_processor import run_silver_twitter


class TwitterPipeline:
    """Standardized interface for executing Twitter ETL stages."""

    def ingest(self, keyword, request_id):
        ingest_twitter(keyword, request_id)

    def process(self, request_id):
        run_silver_twitter(request_id)

    def aggregate(self, keyword, request_id):
        run_gold_etl(keyword, request_id, platform='twitter')


# MODIFY — add 'twitter' to the dict
PLATFORM_REGISTRY = {
    'reddit': RedditPipeline,
    'twitter': TwitterPipeline,       # ← only new line
}
```

---

### 6. `pipeline/gold/aggregator.py` — add Twitter branch

```python
# ADD this import at the top
from pipeline.gold.twitter_aggregator import run_twitter_gold

# MODIFY run_gold_etl
def run_gold_etl(keyword, request_id, platform='reddit'):
    if platform == 'reddit':
        run_reddit_gold(keyword, request_id)
    elif platform == 'twitter':          # ← only new branch
        run_twitter_gold(keyword, request_id)
    else:
        raise ValueError(f"Unsupported platform: {platform}")
```

---

### 7. `config/settings.py` — add `RAPIDAPI_KEY`

Add one line after the Reddit block:

```python
# ---------------------------------------------------------------------------
# Twitter / RapidAPI
# ---------------------------------------------------------------------------
RAPIDAPI_KEY: str = os.getenv("RAPIDAPI_KEY", "")
```

---

### 8. `.env.example` — add the key

```
# ===========================
# Twitter / RapidAPI
# ===========================
RAPIDAPI_KEY=your_rapidapi_key_here
```

---

## Database changes (run once before testing)

### A. `silver_twitter_tweets` table

The sequence already exists (`silver_twitter_tweets_silver_tweet_id_seq`, val=38), meaning the table was attempted before. Check if it exists first via MCP. If it doesn't exist yet, create it:

```sql
CREATE TABLE IF NOT EXISTS silver_twitter_tweets (
    silver_tweet_id   SERIAL PRIMARY KEY,
    original_bronze_id VARCHAR(255),
    platform          VARCHAR(50) DEFAULT 'twitter',
    keyword           VARCHAR(255),
    global_keyword_id INT REFERENCES global_keywords(global_keyword_id),
    tweet_id          VARCHAR(255) UNIQUE,          -- ON CONFLICT target
    text_clean        TEXT,
    created_at_utc    TIMESTAMP,
    favorite_count    INT DEFAULT 0,
    retweet_count     INT DEFAULT 0,
    reply_count       INT DEFAULT 0,
    quote_count       INT DEFAULT 0,
    sentiment_label   VARCHAR(50),
    sentiment_score   FLOAT,
    gold_processed    BOOLEAN DEFAULT FALSE,
    processed_at_utc  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### B. `dim_platform` — insert Twitter row

```sql
INSERT INTO dim_platform (platform_id, platform_name)
VALUES (2, 'twitter')
ON CONFLICT DO NOTHING;
```

### C. `dim_content_type` — insert Tweet row

```sql
INSERT INTO dim_content_type (content_type_id, content_type_name)
VALUES (3, 'tweet')
ON CONFLICT DO NOTHING;
```

Verify the sequence counter is consistent: `SELECT nextval('silver_twitter_tweets_silver_tweet_id_seq')` — if it returns 39 (one past 38), the sequence is live and the table either exists or existed. Either way the `CREATE TABLE IF NOT EXISTS` is safe.

---

## Node.js backend changes

The Node backend that spawns the Python subprocess needs to pass the platform. Check your `routes/pipeline.js` (not shared, but based on the README and orchestrator, the spawn call is):

```js
// Current (assumed)
spawn("python", ["main.py", keyword, requestId]);

// After change — platform comes from the request body
const platform = req.body.platform || "reddit";
spawn("python", ["main.py", keyword, requestId, platform]);
```

The third argument is already handled in `main.py` line 9 — `platform = sys.argv[3] if len(sys.argv) > 3 else "reddit"`. So `main.py` requires **zero changes**.

---

## Frontend changes

Only two changes to the `/sentiment-analysis` route:

**1. Add a platform selector** (before the keyword input):

```jsx
// Platform radio buttons or segmented control
<div>
  <label>
    <input
      type="radio"
      value="reddit"
      checked={platform === "reddit"}
      onChange={(e) => setPlatform(e.target.value)}
    />
    Reddit
  </label>
  <label>
    <input
      type="radio"
      value="twitter"
      checked={platform === "twitter"}
      onChange={(e) => setPlatform(e.target.value)}
    />
    Twitter
  </label>
</div>
```

**2. Include `platform` in the POST body** when triggering the pipeline:

```js
// Add platform to whatever object you're already sending to /api/pipeline/run
{
  (keyword, startDate, endDate, platform);
} // platform is new
```

The results display (chart, posts list) requires **zero changes** — they read from `fact_sentiment_events` which already stores `platform_id`. The existing SQL queries will return Twitter data automatically once `platform_id=2` rows exist. If you want to filter by platform on the results view, that's an optional WHERE clause addition.

---

## Execution order (implement in this sequence)

Each step is independently verifiable before moving on.

1. **DB setup** — run the three SQL statements above using your MCP connection. Verify with `\dt silver_twitter_tweets` and `SELECT * FROM dim_platform`.
2. **Add `RAPIDAPI_KEY`** to `.env` and `config/settings.py`. Verify: `python -c "from config.settings import RAPIDAPI_KEY; print(bool(RAPIDAPI_KEY))"` → `True`.
3. **Create `utils/text_processing/twitter.py`**. Verify: `python -c "from utils.text_processing.twitter import clean_twitter_text; print(clean_twitter_text('Hello @user #tag http://t.co/abc'))"` → `Hello`.
4. **Create `pipeline/bronze/twitter_ingest.py`**. Verify: run one keyword manually: `python -c "from pipeline.bronze.twitter_ingest import ingest_keyword; ingest_keyword('tesla', 999)"`. Check Mongo for docs in `bronze_raw_twitter_data` with only whitelisted fields.
5. **Create `pipeline/silver/twitter_processor.py`**. Verify: `python -c "from pipeline.silver.twitter_processor import run_silver_twitter; run_silver_twitter(999)"`. Check `silver_twitter_tweets` in Postgres.
6. **Create `pipeline/gold/twitter_aggregator.py`**. Modify `gold/aggregator.py`. Verify: `python -c "from pipeline.gold.aggregator import run_gold_etl; run_gold_etl('tesla', 999, 'twitter')"`. Check `fact_sentiment_events` for `platform_id=2` rows.
7. **Modify `registry.py`**. Verify: `python main.py "tesla" 999 twitter` end-to-end. Exit code 0 = success.
8. **Update Node spawn call** to pass platform from request body.
9. **Add frontend platform selector** and include `platform` in the POST body.

---

## What does NOT change

- `main.py` — zero changes
- `pipeline/orchestrator.py` — zero changes
- `pipeline/silver/sentiment.py` — zero changes (BERTweet runs on Twitter text as-is)
- `pipeline/silver/reddit_processor.py` — zero changes
- `pipeline/gold/reddit_aggregator.py` — zero changes
- `database/mongo.py` / `database/postgres.py` — zero changes
- `models/enums.py` — zero changes (Twitter/Tweet enums already there)
- All existing dashboard queries — zero changes (they filter on `platform_id` already)
