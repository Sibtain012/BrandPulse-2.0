# Server-Side Date Filtering - Implementation Summary

## Overview
Successfully implemented **server-side date filtering** for the sentiment analysis feature following the Gold Layer medallion architecture pattern. Date filters are now stored in the database and applied during data insertion in the Gold Layer, ensuring all downstream data is pre-filtered.

---

## Data Flow (As Per User Requirements)

```
User Input (Keyword + Date Range)
       ↓
Frontend sends to Backend (/api/pipeline/analyze)
       ↓
Backend stores in global_keywords table (keyword, start_date, end_date)
       ↓
Python ETL Pipeline Runs (Bronze → Silver → Gold)
   - Bronze: Fetches ALL data for keyword (ignores dates)
   - Silver: Processes sentiment for ALL fetched data (ignores dates)
   - Gold: FILTERS by dates during INSERT into fact tables
       ↓
API returns pre-filtered results
```

---

## Files Modified

### 1. **Database Schema** ✅
**File:** `migrations/add_date_columns_to_global_keywords.sql`

**Changes:**
- Added `start_date DATE` column to `global_keywords` table
- Added `end_date DATE` column to `global_keywords` table
- Created index on `(start_date, end_date)` for performance
- Added comments for documentation

**Migration Required:**
```bash
psql -h <host> -U <user> -d loginDB2-22-NOV -f migrations/add_date_columns_to_global_keywords.sql
```

---

### 2. **Frontend Hook** ✅
**File:** `client/src/hooks/useAnalysis.ts`

**Changes:**
- Updated `startAnalysis()` signature:
  ```typescript
  // BEFORE
  startAnalysis = async (keyword: string, userId: number)
  
  // AFTER
  startAnalysis = async (
      keyword: string, 
      userId: number, 
      startDate?: string | null, 
      endDate?: string | null
  )
  ```

- Updated POST body to include dates:
  ```typescript
  body: JSON.stringify({ 
      keyword, 
      user_id: userId,
      start_date: startDate,
      end_date: endDate
  })
  ```

---

### 3. **Frontend Page** ✅
**File:** `client/src/pages/SentimentAnalysis.tsx`

**Changes:**
- **Removed:** All client-side filtering logic (filterByDateRange, filteredDetailsData state, recalculation useEffects)
- **Kept:** Date picker UI (always visible, not conditional)
- **Updated:** `handleRunPipeline()` to send dates to backend
  ```typescript
  await startAnalysis(keyword, testUserId, startDate || null, endDate || null);
  ```

**What was removed:**
- `filterByDateRange()` function (lines ~69-88 in old version)
- `filteredDetailsData` state variable
- Two `useEffect` hooks for client-side filtering
- References to `filteredDetailsData` throughout the file

**Architecture Change:**
- BEFORE: Data filtered on frontend after fetching
- AFTER: Data pre-filtered on backend before display

---

### 4. **Backend Pipeline Route** ✅
**File:** `routes/pipeline.js`

**Changes:**
- Extract dates from request body:
  ```javascript
  const { keyword, user_id, start_date, end_date } = req.body;
  ```

- Store dates in database:
  ```sql
  INSERT INTO global_keywords 
  (keyword, user_id, platform_id, status, bronze_processed, last_run_at, start_date, end_date)
  VALUES ($1, $2, 1, 'PROCESSING', FALSE, NOW(), $3, $4)
  ON CONFLICT (user_id, keyword) 
  DO UPDATE SET 
      status = 'PROCESSING', 
      last_run_at = NOW(), 
      bronze_processed = FALSE, 
      start_date = $3, 
      end_date = $4
  ```

**Parameters:**
- `$3` = `start_date || null`
- `$4` = `end_date || null`

---

### 5. **Gold Layer Python Script** ✅
**File:** `ETL_2/gold_layer.py`

**Changes:**
- Added JOIN with `global_keywords` table in both INSERT queries
- Added date filter WHERE clauses:
  ```sql
  AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
  AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
  ```

**Modified Queries:**
1. **INSERT_POST_SENTIMENT_SQL:**
   - Added: `JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id`
   - Added: Date filter conditions for `sp.created_at_utc`

2. **INSERT_COMMENT_SENTIMENT_SQL:**
   - Added: `JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id`
   - Added: Date filter conditions for `sc.comment_created_at_utc`

**Filter Logic:**
- `NULL` dates = No filter (process all data)
- Non-null `start_date` = Filter `created_at >= start_date`
- Non-null `end_date` = Filter `created_at <= end_date`

---

### 6. **Data API Routes** ✅
**File:** `routes/data.js`

**Changes:**
- Updated `/details/:requestId` endpoint to filter by dates

**Posts Query:**
```sql
SELECT sp.* 
FROM silver_reddit_posts sp
JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
WHERE sp.global_keyword_id = $1
AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
```

**Comments Query:**
```sql
SELECT c.* 
FROM silver_reddit_comments c
JOIN silver_reddit_posts p ON c.silver_post_id = p.silver_post_id
JOIN global_keywords gk ON gk.global_keyword_id = p.global_keyword_id
WHERE p.global_keyword_id = $1
AND (gk.start_date IS NULL OR DATE(c.comment_created_at_utc) >= gk.start_date)
AND (gk.end_date IS NULL OR DATE(c.comment_created_at_utc) <= gk.end_date)
```

**Why needed?**
The `/results/:requestId` endpoint queries `fact_sentiment_events` which is already filtered by Gold Layer. However, `/details/:requestId` queries `silver_reddit_posts` and `silver_reddit_comments` directly, so we need to apply the same date filter to maintain consistency.

---

## Testing Checklist

### Prerequisites
1. ✅ Run database migration to add date columns
2. ✅ Restart backend server (to load updated routes)
3. ✅ Restart frontend dev server (to load updated hooks)

### Test Scenarios

#### Scenario 1: No Date Filter (Default Behavior)
**Steps:**
1. Open http://localhost:5174/sentiment-analysis
2. Enter keyword: `ChatGPT`
3. Leave date fields empty
4. Click "Analyze Sentiment"

**Expected:**
- Pipeline runs normally
- `start_date` and `end_date` are NULL in database
- Gold Layer processes ALL data without date filtering
- All posts/comments from API response are displayed

---

#### Scenario 2: Date Range Filter
**Steps:**
1. Enter keyword: `ChatGPT`
2. Set Start Date: `2024-12-10`
3. Set End Date: `2024-12-20`
4. Click "Analyze Sentiment"

**Expected:**
- Database stores dates:
  ```sql
  SELECT keyword, start_date, end_date 
  FROM global_keywords 
  WHERE keyword = 'ChatGPT';
  -- Result: ChatGPT | 2024-12-10 | 2024-12-20
  ```

- Gold Layer filters during INSERT:
  ```sql
  SELECT COUNT(*) FROM fact_sentiment_events 
  WHERE request_id = <your_request_id>;
  -- Only includes posts/comments between 12/10 and 12/20
  ```

- Frontend displays only filtered data

---

#### Scenario 3: Only Start Date
**Steps:**
1. Enter keyword: `Python`
2. Set Start Date: `2024-11-01`
3. Leave End Date empty
4. Click "Analyze Sentiment"

**Expected:**
- `start_date = '2024-11-01'`, `end_date = NULL`
- Gold Layer filters: `created_at >= '2024-11-01'`
- All data from November 1st onwards is included

---

#### Scenario 4: Only End Date
**Steps:**
1. Enter keyword: `AI`
2. Leave Start Date empty
3. Set End Date: `2024-12-31`
4. Click "Analyze Sentiment"

**Expected:**
- `start_date = NULL`, `end_date = '2024-12-31'`
- Gold Layer filters: `created_at <= '2024-12-31'`
- All data up to December 31st is included

---

## Verification Queries

### Check Stored Dates
```sql
SELECT 
    global_keyword_id,
    keyword,
    start_date,
    end_date,
    status,
    last_run_at
FROM global_keywords
ORDER BY last_run_at DESC
LIMIT 5;
```

### Check Filtered Results
```sql
-- Verify fact table has filtered data
SELECT 
    fse.request_id,
    COUNT(*) as total_events,
    MIN(dd.calendar_date) as earliest_date,
    MAX(dd.calendar_date) as latest_date
FROM fact_sentiment_events fse
JOIN dim_date dd ON dd.date_id = fse.date_id
WHERE fse.request_id = <your_request_id>
GROUP BY fse.request_id;
```

### Compare Silver vs Gold
```sql
-- Check Silver (unfiltered)
SELECT COUNT(*) as silver_count
FROM silver_reddit_posts
WHERE global_keyword_id = <your_request_id>;

-- Check Gold (filtered)
SELECT COUNT(*) as gold_count
FROM fact_sentiment_events
WHERE request_id = <your_request_id>
AND content_type_id = 1; -- posts only

-- If dates were applied, gold_count <= silver_count
```

---

## Troubleshooting

### Issue 1: Dates not being stored in database
**Symptom:** `start_date` and `end_date` are NULL even when dates are provided

**Diagnosis:**
```sql
-- Check if columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'global_keywords' 
AND column_name IN ('start_date', 'end_date');
```

**Solution:** Run the migration SQL file

---

### Issue 2: Gold Layer ignoring dates
**Symptom:** All data is processed regardless of date filter

**Diagnosis:**
1. Check if dates are in database:
   ```sql
   SELECT keyword, start_date, end_date 
   FROM global_keywords 
   WHERE global_keyword_id = <your_id>;
   ```

2. Check Python console output during Gold Layer execution

**Solution:** 
- Ensure `gold_layer.py` has been updated with JOIN and WHERE clauses
- Restart Python process if it's cached

---

### Issue 3: Frontend shows "0 results" with date filter
**Symptom:** No data displayed when dates are applied

**Possible Causes:**
1. **No data in date range:** Data may not exist for the specified dates
2. **Date format mismatch:** Ensure dates are in `YYYY-MM-DD` format
3. **Timezone issues:** `created_at_utc` is in UTC, ensure dates align

**Diagnosis:**
```sql
-- Check date range of available data
SELECT 
    MIN(DATE(created_at_utc)) as earliest_post,
    MAX(DATE(created_at_utc)) as latest_post,
    COUNT(*) as total_posts
FROM silver_reddit_posts
WHERE global_keyword_id = <your_id>;
```

---

### Issue 4: TypeScript errors in frontend
**Symptom:** "Expected 2 arguments, but got 4"

**Solution:** Ensure `useAnalysis.ts` has been updated with the new signature. Restart Vite dev server:
```bash
cd client
npm run dev
```

---

## Performance Considerations

### Indexing
The migration script creates an index on `(start_date, end_date)` in `global_keywords`:
```sql
CREATE INDEX idx_global_keywords_dates 
ON global_keywords (start_date, end_date);
```

### Query Optimization
Date filtering happens during INSERT, not after:
- ❌ **Bad:** Insert all data → Query with date filter
- ✅ **Good:** Filter during INSERT → Query returns only filtered data

This reduces:
- Storage in `fact_sentiment_events` table
- Network transfer to frontend
- Processing time on frontend

---

## Rollback Plan

If issues arise, you can temporarily disable date filtering:

### Option 1: Ignore dates in Gold Layer
Comment out the date filter lines in `gold_layer.py`:
```python
# AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
# AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
```

### Option 2: Remove date columns
```sql
ALTER TABLE global_keywords 
DROP COLUMN start_date,
DROP COLUMN end_date;
```

Then update `pipeline.js` to remove date parameters from INSERT query.

---

## Next Steps (Pending Tasks)

### High Priority
1. **Navigation Changes:**
   - Login → Home page (not Profile)
   - Add navbar with profile icon dropdown

2. **State Synchronization:**
   - Handle page refresh (restore state from localStorage?)
   - Handle disconnection (retry mechanism)
   - Handle cancellation (STOP button functionality)

3. **Race Condition Mitigation:**
   - Implement request cancellation tokens
   - Queue multiple requests instead of rejecting

### Medium Priority
4. **UI Improvements:**
   - Date picker always visible (✅ Already done)
   - Show applied date range in results header
   - Add "Clear Dates" button visual state

5. **Validation:**
   - Ensure end_date >= start_date
   - Prevent future dates
   - Max date range (e.g., 1 year)

### Low Priority
6. **Analytics:**
   - Track most common date ranges
   - Show data availability calendar

---

## Documentation References

- **Original Plan:** `docs/SERVER_SIDE_FILTERING_PLAN.md`
- **Quick Reference:** `docs/QUICK_REFERENCE_DATE_FILTER.md`
- **Task Distribution:** `docs/TASK_DISTRIBUTION.md`
- **Master Plan:** `docs/MASTER_IMPLEMENTATION_PLAN.md`

---

## Summary of Architectural Decision

### Why Server-Side?
1. **Performance:** Filter at source, not at destination
2. **Scalability:** Reduce data transfer and storage
3. **Consistency:** Single source of truth (Gold Layer)
4. **Maintainability:** One filter logic, not duplicated across frontend/backend

### Gold Layer = Filter Point
The Gold Layer is the **transformation and aggregation layer** in the medallion architecture:
- Bronze: Raw ingestion (no transformations)
- Silver: Enrichment (sentiment analysis)
- Gold: **Business logic** (date filtering, aggregations)

Date filtering is business logic, so it belongs in Gold Layer, not Bronze/Silver.

---

**Implementation Date:** 2025
**Status:** ✅ Complete (Pending database migration)
**Files Changed:** 6 files (3 backend, 2 frontend, 1 migration)
