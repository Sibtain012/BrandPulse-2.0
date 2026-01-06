# Analysis History - Setup & Testing Guide

## Quick Setup (3 Steps)

### Step 1: Run Database Migrations

Open PowerShell in project root and run:

```powershell
# Navigate to project root
cd C:\Users\ahmed\OneDrive\Desktop\FYP\BrandPulse-2.0

# Run the table creation migration
psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/create_analysis_history.sql"

# OPTIONAL: Backfill existing analyses (if you have historical data)
psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/backfill_analysis_history.sql"
```

**Expected Output:**
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
COMMENT
COMMENT
COMMENT
```

### Step 2: Verify Table Creation

```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -c "\d analysis_history"
```

**Expected Output:**
- Table with 16 columns
- 4 indexes
- 1 unique constraint

### Step 3: Restart Backend

```powershell
# Stop any running nodemon (Ctrl+C)
# Then restart:
nodemon index.js
```

**Watch for errors in terminal - should start cleanly!**

---

## Testing Checklist

### ✅ Test 1: Verify Backend Starts Without Errors

**Expected:**
```
[nodemon] starting `node index.js`
Server running on port 3000
```

**No errors about:**
- Missing tables
- Missing columns
- SQL syntax errors

---

### ✅ Test 2: Run a New Analysis

1. Navigate to Sentiment Analysis page
2. Enter keyword: `test`
3. Select date range (or leave empty for today)
4. Click "Run Pipeline"
5. Wait for completion

**Backend Terminal Should Show:**
```
[History] Starting to save analysis for Request ID: X
[History] Successfully saved analysis for Request ID: X (44 posts, 286 comments)
✅ Analysis results saved to history (ID: X)
```

---

### ✅ Test 3: Check Database

```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT * FROM analysis_history ORDER BY analysis_timestamp DESC LIMIT 5;"
```

**Expected:**
- Should show your recent analysis
- All columns populated (except top_keywords might be empty)
- Sentiment percentages add up to ~100

---

### ✅ Test 4: View History Page

1. Click profile icon in header
2. Click "Analysis History"
3. Should see your analysis listed

**Expected:**
- Card with keyword, dates, post/comment counts
- Sentiment distribution bar
- "View Details" button

---

### ✅ Test 5: Search History

1. On History page
2. Type keyword in search box
3. Press Enter or click Search

**Expected:**
- Filtered results matching keyword
- "Clear" button appears
- Empty state if no matches

---

### ✅ Test 6: View Details Navigation

1. Click "View Details" on any history card
2. Should navigate to Sentiment Analysis page
3. Should load that analysis results

**Expected:**
- URL: `/sentiment-analysis?requestId=X`
- Charts and data load correctly
- No "cached" message (direct load)

---

## Troubleshooting

### Problem: "relation 'analysis_history' does not exist"

**Solution:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/create_analysis_history.sql"
```

---

### Problem: "column 'start_date' does not exist in global_keywords"

**Solution:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -f "migrations/SIMPLE_add_dates.sql"
```

---

### Problem: History page shows "No analyses found" but you have data

**Check 1:** User ID extraction
```javascript
// In browser console on History page:
localStorage.getItem('accessToken')
// Should show a JWT token
```

**Check 2:** Backend API response
```powershell
# Replace 1 with your user_id
curl http://localhost:3000/api/data/history/1
```

**Check 3:** Database has data for that user
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -c "SELECT COUNT(*) FROM analysis_history WHERE user_id = 1;"
```

---

### Problem: Backend error "Cannot read property 'post_count' of undefined"

**Cause:** Query returned no rows

**Solution:** Already fixed in updated code with `?.` optional chaining:
```javascript
const totalPosts = parseInt(postsQuery.rows[0]?.post_count) || 0;
```

Restart backend to apply fix.

---

### Problem: "duplicate key value violates unique constraint"

**Cause:** Trying to save same (user_id, keyword, start_date, end_date) twice

**Expected Behavior:** ON CONFLICT clause should UPDATE instead of failing

**Check:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -c "\d analysis_history"
```

Look for constraint: `uq_history_user_keyword_dates`

---

## Verification Queries

### Check History Table Structure
```sql
\d analysis_history
```

### View All History
```sql
SELECT 
    history_id,
    user_id,
    keyword,
    start_date,
    end_date,
    total_posts,
    total_comments,
    sentiment_distribution,
    analysis_timestamp
FROM analysis_history
ORDER BY analysis_timestamp DESC;
```

### Check History by User
```sql
SELECT * FROM analysis_history 
WHERE user_id = 1 
ORDER BY analysis_timestamp DESC;
```

### Verify Sentiment Percentages
```sql
SELECT 
    keyword,
    positive_percentage,
    neutral_percentage,
    negative_percentage,
    (positive_percentage + neutral_percentage + negative_percentage) as total_pct
FROM analysis_history;
-- total_pct should be ~100.00
```

### Check for Duplicates
```sql
SELECT 
    user_id, 
    keyword, 
    start_date, 
    end_date, 
    COUNT(*) as count
FROM analysis_history
GROUP BY user_id, keyword, start_date, end_date
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

---

## Success Criteria

✅ Backend starts without errors
✅ New analyses automatically save to history
✅ History page loads and displays analyses
✅ Search functionality works
✅ "View Details" navigates correctly
✅ No duplicate entries in database
✅ Percentages add up to ~100%
✅ Desktop and mobile navigation work

---

## Performance Notes

### Expected Query Times
- History fetch (50 items): < 100ms
- History search: < 50ms
- Save to history: < 200ms

### Index Usage
All queries use indexes:
- `idx_history_user_id` - Primary filter
- `idx_history_timestamp` - Sorting
- `idx_history_keyword` - Search

### Scaling Considerations
- Current design handles 100K+ analyses
- Add pagination for users with >100 analyses
- Consider archiving analyses >1 year old

---

## Next Steps After Setup

1. ✅ Complete testing checklist above
2. Run a few analyses to populate history
3. Test search with various keywords
4. Verify mobile responsive layout
5. Check browser console for any errors
6. Monitor backend logs for issues

---

## Rollback (If Needed)

```sql
-- Remove table and all data
DROP TABLE IF EXISTS analysis_history CASCADE;

-- Remove history save code
-- Edit routes/pipeline.js and comment out:
-- - saveAnalysisToHistory() function
-- - The call in pythonProcess.on('close')

-- Remove history routes
-- Edit routes/data.js and comment out:
-- - /history/:userId endpoint
-- - /history/:userId/search endpoint
```

---

## Support

If you encounter any issues:

1. Check terminal logs (backend and frontend)
2. Check browser console (F12)
3. Run verification queries above
4. Check PostgreSQL logs
5. Verify all migrations ran successfully

---

**Ready to test!** 🚀
