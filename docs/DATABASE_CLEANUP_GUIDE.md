# BrandPulse Database Cleanup & Optimization Guide

## 🔍 Current Database Issues

Based on the analysis of your `loginDB2-22-NOV` database, here are the identified issues:

### **1. Duplicate/Overlapping Tables**

#### **Platform Tables (3 tables doing similar things!)**
- ❌ `platforms` (3 rows)
- ❌ `platform_config` (2 rows)  
- ❌ `dim_platform` (2 rows) ✅ **KEEP THIS ONE**

**Problem:** Three tables storing platform information!
**Solution:** Keep ONLY `dim_platform` (part of dimensional model), drop the other two.

---

#### **Model Tables (Duplicate)**
- ❌ `ml_models` (unknown purpose)
- ❌ `dim_model` ✅ **KEEP THIS ONE**

**Problem:** Both appear to store ML model information.
**Solution:** Consolidate into `dim_model` if part of fact table, or clarify purpose.

---

### **2. Unused/Legacy Tables**

#### **Potentially Unused:**
- ❓ `campaigns` - Are you using marketing campaigns?
- ❓ `keyword_cache` - Caching mechanism (might be outdated with analysis_history)
- ❓ `pipeline_runs` - Is this different from global_keywords tracking?
- ❓ `silver_twitter_tweets` - Are you analyzing Twitter? (I see only Reddit in your code)
- ❓ `api_usage_log` - Is this being populated?
- ❓ `verification_tokens` - Email verification tokens (cleanup old ones?)

---

### **3. Poorly Named Tables**

❌ **`global_keywords`** - Terrible name!
- Currently acts as: Request tracker, pipeline status, user search history
- Should be: `analysis_requests` or `user_analyses`

❌ **`silver_reddit_comment_sentiment_summary`** - Too specific!
- Redundant if you have `fact_sentiment_events`

---

### **4. Missing Relationships**

- `analysis_history` has no FK to `user_profiles` (because user_id not unique there)
- Unclear relationship between `auth_identities` → `user_profiles` → `analysis_history`

---

## 🎯 Recommended Database Structure

### **Core Tables (Keep & Clean)**

```
┌─────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION LAYER                      │
└─────────────────────────────────────────────────────────────┘

auth_identities (user credentials)
    ├─> user_profiles (user info & preferences)
    ├─> user_sessions (active sessions)
    └─> verification_tokens (email verification)

┌─────────────────────────────────────────────────────────────┐
│                    ANALYSIS REQUEST LAYER                    │
└─────────────────────────────────────────────────────────────┘

analysis_requests (renamed from global_keywords) ⭐ RENAME
    ├─> analysis_history (summary results)
    └─> fact_sentiment_events (detailed events)

┌─────────────────────────────────────────────────────────────┐
│                    DIMENSIONAL MODEL (Gold Layer)            │
└─────────────────────────────────────────────────────────────┘

fact_sentiment_events (center of star)
    ├─> dim_sentiment (positive/neutral/negative)
    ├─> dim_date (date dimension)
    ├─> dim_time (time dimension)
    ├─> dim_platform (Reddit, Twitter, etc.) ⭐ CONSOLIDATE
    ├─> dim_content_type (post/comment)
    └─> dim_model (ML model used)

┌─────────────────────────────────────────────────────────────┐
│                    SILVER LAYER (Processed Data)             │
└─────────────────────────────────────────────────────────────┘

silver_reddit_posts (posts with sentiment)
silver_reddit_comments (comments with sentiment)
silver_twitter_tweets (if using Twitter)
silver_errors (error tracking)

┌─────────────────────────────────────────────────────────────┐
│                    AUDIT & MONITORING                        │
└─────────────────────────────────────────────────────────────┘

audit_logs (user actions)
api_usage_log (API call tracking)
```

---

## 📋 Cleanup Action Plan

### **Phase 1: Consolidate Platform Tables**

```sql
-- Step 1: Verify dim_platform has all data
SELECT * FROM dim_platform;

-- Step 2: Migrate any missing data from platforms/platform_config
-- (Manual verification needed)

-- Step 3: Drop redundant tables
DROP TABLE IF EXISTS platforms CASCADE;
DROP TABLE IF EXISTS platform_config CASCADE;

-- Result: One clean platform dimension table
```

---

### **Phase 2: Rename global_keywords**

```sql
-- Rename to something meaningful
ALTER TABLE global_keywords RENAME TO analysis_requests;

-- Update foreign key references (analysis_history, fact_sentiment_events)
ALTER TABLE analysis_history 
    DROP CONSTRAINT IF EXISTS fk_analysis_request,
    ADD CONSTRAINT fk_analysis_request 
    FOREIGN KEY (request_id) REFERENCES analysis_requests(global_keyword_id) ON DELETE CASCADE;

ALTER TABLE fact_sentiment_events
    DROP CONSTRAINT IF EXISTS fact_sentiment_events_request_id_fkey,
    ADD CONSTRAINT fact_sentiment_events_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES analysis_requests(global_keyword_id) ON DELETE CASCADE;

-- Rename primary key column for clarity
ALTER TABLE analysis_requests RENAME COLUMN global_keyword_id TO request_id;

-- Result: Clear, descriptive table name
```

---

### **Phase 3: Remove Unused Tables**

```sql
-- Check if campaigns table is used
SELECT COUNT(*) FROM campaigns;
-- If 0 or no references: DROP TABLE campaigns CASCADE;

-- Check keyword_cache (might be obsolete with analysis_history)
SELECT COUNT(*) FROM keyword_cache;
-- If redundant: DROP TABLE keyword_cache CASCADE;

-- Check pipeline_runs vs analysis_requests
SELECT * FROM pipeline_runs LIMIT 5;
-- If duplicate tracking: DROP TABLE pipeline_runs CASCADE;

-- Check if Twitter is being used
SELECT COUNT(*) FROM silver_twitter_tweets;
-- If 0: DROP TABLE silver_twitter_tweets CASCADE;

-- Clean up old verification tokens
DELETE FROM verification_tokens WHERE expires_at < NOW() - INTERVAL '30 days';

-- Result: Leaner, faster database
```

---

### **Phase 4: Drop Redundant Summary Table**

```sql
-- Check if silver_reddit_comment_sentiment_summary is needed
-- (You have fact_sentiment_events AND analysis_history for aggregates)

SELECT * FROM silver_reddit_comment_sentiment_summary LIMIT 5;

-- If it's redundant:
DROP TABLE silver_reddit_comment_sentiment_summary CASCADE;

-- Result: Remove duplication
```

---

### **Phase 5: Fix User Relationships**

```sql
-- Current issue: user_profiles.user_id is not unique (profile_id is PK)

-- Option A: Make user_id unique in user_profiles (if 1:1 relationship)
ALTER TABLE user_profiles ADD UNIQUE (user_id);

-- Then add FK to analysis_history
ALTER TABLE analysis_history
    ADD CONSTRAINT fk_analysis_user 
    FOREIGN KEY (user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE;

-- Option B: Reference auth_identities directly
ALTER TABLE analysis_history
    ADD CONSTRAINT fk_analysis_user 
    FOREIGN KEY (user_id) REFERENCES auth_identities(user_id) ON DELETE CASCADE;

-- Result: Proper foreign key relationships
```

---

## 🗂️ Final Clean Database Structure

### **After Cleanup (15-18 tables instead of 26)**

#### **Authentication (4 tables)**
1. `auth_identities` - User credentials
2. `user_profiles` - User information
3. `user_sessions` - Active sessions
4. `verification_tokens` - Email verification

#### **Analysis Layer (3 tables)**
5. `analysis_requests` (renamed from global_keywords) - User search requests
6. `analysis_history` - Summary results (aggregate fact)
7. `fact_sentiment_events` - Detailed events (detail fact)

#### **Dimensions (6 tables)**
8. `dim_sentiment` - Sentiment labels
9. `dim_date` - Date dimension
10. `dim_time` - Time dimension
11. `dim_platform` - Platforms (consolidated)
12. `dim_content_type` - Post/Comment types
13. `dim_model` - ML models

#### **Silver Layer (3-4 tables)**
14. `silver_reddit_posts` - Processed posts
15. `silver_reddit_comments` - Processed comments
16. `silver_twitter_tweets` (if using Twitter)
17. `silver_errors` - Error tracking

#### **Monitoring (2 tables)**
18. `audit_logs` - User actions
19. `api_usage_log` - API tracking

---

## 📊 Database Documentation Template

Create a `docs/DATABASE_SCHEMA.md` file with this structure:

```markdown
# Database Schema Documentation

## Table Inventory

### Authentication Layer
| Table | Purpose | Row Count | Key Relationships |
|-------|---------|-----------|------------------|
| auth_identities | User login credentials | ~X | PK: user_id |
| user_profiles | User info & preferences | ~X | FK: user_id → auth_identities |

### Analysis Layer
| Table | Purpose | Row Count | Key Relationships |
|-------|---------|-----------|------------------|
| analysis_requests | User search requests | ~X | FK: user_id → auth_identities |
| analysis_history | Summary results | ~X | FK: request_id → analysis_requests |
| fact_sentiment_events | Detailed sentiment events | ~X | FK: request_id → analysis_requests |

### Dimensional Tables
| Table | Purpose | Row Count | Key Relationships |
|-------|---------|-----------|------------------|
| dim_sentiment | Sentiment categories | 3 | Referenced by fact_sentiment_events |
| dim_platform | Social platforms | 2-3 | Referenced by fact_sentiment_events |

(etc.)
```

---

## 🚀 Implementation Steps

### **Step 1: Backup First!**
```bash
pg_dump -h localhost -U postgres -d loginDB2-22-NOV > backup_$(date +%Y%m%d).sql
```

### **Step 2: Analyze Current Usage**
```sql
-- Check table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- Check foreign key dependencies
SELECT
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
```

### **Step 3: Execute Cleanup (One Phase at a Time)**
- Test in development first
- Verify data integrity after each phase
- Update application code if table names change

### **Step 4: Update Application Code**
After renaming `global_keywords` → `analysis_requests`:
- Update all SQL queries in your codebase
- Search for "global_keywords" in: routes/, ETL_2/, utils/
- Replace with "analysis_requests"

---

## 📝 Maintenance Best Practices

### **Regular Cleanup**
```sql
-- Delete old verification tokens (monthly)
DELETE FROM verification_tokens WHERE expires_at < NOW() - INTERVAL '90 days';

-- Archive old audit logs (quarterly)
-- Move records older than 6 months to audit_logs_archive

-- Vacuum and analyze (weekly)
VACUUM ANALYZE;
```

### **Naming Conventions**
- ✅ **Fact tables:** `fact_*` (e.g., fact_sentiment_events)
- ✅ **Dimension tables:** `dim_*` (e.g., dim_platform)
- ✅ **Silver layer:** `silver_*` (e.g., silver_reddit_posts)
- ✅ **Descriptive names:** `analysis_requests` not `global_keywords`

### **Documentation**
- Keep `DATABASE_SCHEMA.md` updated
- Document each table's purpose and relationships
- Include row count estimates
- Add migration history

---

## ⚠️ Critical Warnings

### **Before Dropping Tables:**
1. ✅ Check for foreign key references
2. ✅ Search codebase for table usage
3. ✅ Backup database
4. ✅ Test in development environment first
5. ✅ Have rollback plan ready

### **Before Renaming Tables:**
1. ✅ Update all application code
2. ✅ Update all ETL scripts
3. ✅ Update documentation
4. ✅ Notify team members
5. ✅ Deploy code and migration together

---

## 🎯 Expected Benefits

After cleanup:
- ✅ **26 → ~15-18 tables** (30% reduction)
- ✅ **Clearer naming** (no more "global_keywords")
- ✅ **Proper relationships** (enforced FKs)
- ✅ **Better performance** (less redundancy)
- ✅ **Easier maintenance** (clear purpose for each table)
- ✅ **Improved documentation** (clear schema understanding)

---

**Next Steps:** 
1. Review this guide
2. Identify which tables you're actively using
3. Let me know which cleanup phases you want to execute
4. I'll create the specific migration scripts for you!
