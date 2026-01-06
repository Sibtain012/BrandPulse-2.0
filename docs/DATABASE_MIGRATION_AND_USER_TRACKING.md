# Database Migration & User Tracking - Action Items

## ❌ CRITICAL ISSUE: Missing Database Columns

Your pipeline is failing because the `global_keywords` table is missing required columns.

### Error:
```
PIPELINE ERROR: column "start_date" of relation "global_keywords" does not exist
```

---

## 🔧 SOLUTION: Run These 3 Migrations

### **Step 1: Update `global_keywords` table**
**File:** `migrations/COMPLETE_update_global_keywords.sql`

**Run this command in PowerShell:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -f "C:\Users\ahmed\OneDrive\Desktop\FYP\BrandPulse-2.0\migrations\COMPLETE_update_global_keywords.sql"
```

**Adds:**
- `user_id` INTEGER - Tracks which user made the request
- `status` TEXT - Tracks pipeline status (IDLE, PROCESSING, COMPLETED, FAILED)
- `last_run_at` TIMESTAMPTZ - Tracks when pipeline last ran
- `start_date` DATE - User-selected start date for filtering
- `end_date` DATE - User-selected end date for filtering
- Unique constraint on `(user_id, keyword)` - Prevents duplicate requests

---

### **Step 2: Update `silver_reddit_posts` table**
**File:** `migrations/update_silver_tables.sql`

**Run this command:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -f "C:\Users\ahmed\OneDrive\Desktop\FYP\BrandPulse-2.0\migrations\update_silver_tables.sql"
```

**Adds:**
- `global_keyword_id` INTEGER - Links posts to user requests
- `gold_processed` BOOLEAN - Tracks if processed by Gold Layer
- Foreign key constraint to `global_keywords`

---

### **Step 3: Update `fact_sentiment_events` table**
**File:** `migrations/update_fact_table.sql`

**Run this command:**
```powershell
psql -h localhost -U postgres -d loginDB2-22-NOV -f "C:\Users\ahmed\OneDrive\Desktop\FYP\BrandPulse-2.0\migrations\update_fact_table.sql"
```

**Adds:**
- `request_id` INTEGER - Links fact records to user requests
- Foreign key constraint to `global_keywords`

---

## ✅ USER TRACKING IMPLEMENTATION

### **YES, We Are Tracking Users!**

#### **1. Route Protection** ✅
- Only logged-in users can access `/sentiment-analysis`
- Protected by `<ProtectedRoute>` component

#### **2. User ID Extraction** ✅
- **New file:** `client/src/utils/auth.ts`
- Extracts user ID from JWT token automatically
- No more hardcoded `testUserId = 1`

#### **3. Database Storage** ✅
- Each request stores:
  - `user_id` - Who made the request
  - `keyword` - What they searched for
  - `start_date`, `end_date` - Date range (if applied)
  - `status` - Current pipeline status
  - `last_run_at` - When they ran it
  - `global_keyword_id` - Unique request ID

#### **4. Request Tracking**
You can query user activity:
```sql
-- See all requests by a specific user
SELECT 
    global_keyword_id,
    keyword,
    start_date,
    end_date,
    status,
    last_run_at
FROM global_keywords
WHERE user_id = 1
ORDER BY last_run_at DESC;

-- See how many times each keyword was searched
SELECT 
    keyword,
    COUNT(*) as request_count,
    COUNT(DISTINCT user_id) as unique_users
FROM global_keywords
GROUP BY keyword
ORDER BY request_count DESC;

-- See user activity summary
SELECT 
    user_id,
    COUNT(*) as total_requests,
    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as successful,
    COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed,
    MAX(last_run_at) as last_activity
FROM global_keywords
GROUP BY user_id;
```

---

## 📊 Updated Schema Relationships

```
user_profiles (your existing table)
    ↓
global_keywords (user requests)
    ├── user_id → user_profiles.user_id
    ├── keyword, start_date, end_date
    ├── status, last_run_at
    └── global_keyword_id (PRIMARY KEY)
            ↓
    silver_reddit_posts (bronze/silver data)
        ├── global_keyword_id → global_keywords.global_keyword_id
        ├── post data, sentiment
        └── gold_processed flag
                ↓
        fact_sentiment_events (gold layer)
            ├── request_id → global_keywords.global_keyword_id
            ├── sentiment metrics
            └── dimensions (date, time, sentiment, etc.)
```

---

## 🔍 What Changed in Code

### **Frontend:**
1. **SentimentAnalysis.tsx**
   - Removed hardcoded `testUserId = 1`
   - Now calls `getCurrentUserId()` from JWT token
   - Validates user is logged in before running analysis

2. **utils/auth.ts** (NEW FILE)
   - `getCurrentUserId()` - Get user ID from JWT
   - `getCurrentUserEmail()` - Get email from JWT
   - `isTokenExpired()` - Check if token is valid
   - `decodeToken()` - Decode JWT payload

### **Backend:**
- Already implemented! Routes receive `user_id` and store it in DB

---

## 🚀 After Running Migrations

### **Test the Pipeline:**
1. Log in to your application
2. Go to `/sentiment-analysis`
3. Enter a keyword (e.g., "ChatGPT")
4. Optionally set date range
5. Click "Analyze Sentiment"

### **Verify in Database:**
```sql
-- Check if your request was stored
SELECT * FROM global_keywords 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if dates were stored
SELECT 
    keyword, 
    user_id, 
    start_date, 
    end_date, 
    status 
FROM global_keywords 
WHERE start_date IS NOT NULL 
OR end_date IS NOT NULL;
```

---

## ⚠️ Important Notes

1. **JWT Token Must Include `userId`**
   - Your backend's JWT generation must include `userId` in the payload
   - Example JWT payload:
     ```json
     {
       "userId": 1,
       "email": "user@example.com",
       "exp": 1735689600,
       "iat": 1735603200
     }
     ```

2. **User Profiles Table**
   - Your schema shows `user_profiles` table exists
   - If you want referential integrity, uncomment the foreign key line in migration:
     ```sql
     ALTER TABLE global_keywords 
     ADD CONSTRAINT fk_global_keywords_user 
     FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;
     ```

3. **Unique Constraint**
   - The `(user_id, keyword)` constraint prevents duplicate requests
   - Uses `ON CONFLICT ... DO UPDATE` to update existing records
   - Each user can search same keyword multiple times (updates last_run_at)

---

## 📝 Summary

### **What You Get:**
✅ User authentication enforcement
✅ Automatic user ID extraction from JWT
✅ Every request tracked in database
✅ Date filtering stored per request
✅ Pipeline status tracking
✅ Comprehensive user activity analytics

### **Action Required:**
❗ Run the 3 migration SQL files
❗ Verify JWT tokens include `userId` field
❗ Test the pipeline with a real user account

---

**Migrations Location:**
- `/migrations/COMPLETE_update_global_keywords.sql`
- `/migrations/update_silver_tables.sql`
- `/migrations/update_fact_table.sql`
