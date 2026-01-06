# 🏗️ Architecture Redesign: Server-Side Date Filtering + State Synchronization

**Date**: January 5, 2026  
**Status**: 📋 Planning Phase  
**Priority**: HIGH - Major Architectural Change

---

## 🎯 Overview

### Current Architecture (Client-Side Filtering)
```
Bronze → Silver → Gold → API → Frontend (filters by date)
```

### New Architecture (Server-Side Filtering)
```
Frontend (sends keyword + dates) → Bronze (keyword only) → Silver → Gold (filters by dates) → API (filtered results) → Frontend
```

---

## 📋 Requirements Summary

### 1. **Date Filtering in Gold Layer** ✅
- Move date filtering from frontend to Gold Layer SQL queries
- Bronze Layer: Only uses keyword (no date parameters)
- Gold Layer: Applies date range filter via SQL WHERE clauses
- Frontend: Sends dates to backend, receives pre-filtered results

### 2. **State Synchronization** ✅
- Handle page refresh during pipeline execution
- Handle internet disconnection
- Handle user cancellation
- Maintain consistency across frontend/backend/pipeline

### 3. **Navigation Changes** ✅
- After login/signup → Navigate to home page (not profile)
- Add navbar profile icon for profile access
- Improve user flow

### 4. **Race Condition Mitigation** ✅
- Prevent concurrent pipeline runs for same keyword
- Handle rapid API calls
- Ensure atomic database operations
- Proper locking mechanisms

---

## 🏗️ Implementation Plan

### **Phase 1: Database Schema Updates** (30 min)
#### 1.1 Add Date Columns to Pipeline Tracking
```sql
ALTER TABLE global_keywords ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE global_keywords ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE global_keywords ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE global_keywords ADD COLUMN IF NOT EXISTS cancelled_by INTEGER REFERENCES user_profiles(user_id);
```

#### 1.2 Add Session Recovery Table
```sql
CREATE TABLE IF NOT EXISTS pipeline_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER NOT NULL REFERENCES user_profiles(user_id),
    request_id INTEGER NOT NULL REFERENCES global_keywords(global_keyword_id),
    keyword VARCHAR(255) NOT NULL,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, request_id)
);

CREATE INDEX idx_pipeline_sessions_user ON pipeline_sessions(user_id);
CREATE INDEX idx_pipeline_sessions_status ON pipeline_sessions(status);
```

#### 1.3 Add Cancellation Support
```sql
CREATE TABLE IF NOT EXISTS pipeline_cancellations (
    cancellation_id SERIAL PRIMARY KEY,
    request_id INTEGER NOT NULL REFERENCES global_keywords(global_keyword_id),
    user_id INTEGER NOT NULL,
    reason VARCHAR(255),
    cancelled_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### **Phase 2: Backend API Updates** (1 hour)

#### 2.1 Update Pipeline Route (routes/pipeline.js)
**Changes**:
- Accept `start_date` and `end_date` from frontend
- Store dates in `global_keywords` table
- Pass `request_id` (not dates) to Python ETL
- Add cancellation endpoint

**New Endpoints**:
```javascript
// POST /api/pipeline/analyze
// - Accept: { keyword, user_id, start_date, end_date }
// - Store dates in DB
// - Spawn Python with request_id only

// POST /api/pipeline/cancel/:requestId
// - Mark pipeline as CANCELLED
// - Create cancellation record
// - Notify Python process

// GET /api/pipeline/session/:userId
// - Get active sessions for user
// - Resume or cleanup stale sessions
```

#### 2.2 Update Data Routes (routes/data.js)
**Changes**:
- Add date filtering to `/api/data/results/:requestId`
- Add date filtering to `/api/data/details/:requestId`
- Filter using dates from `global_keywords` table

**Example Query**:
```sql
SELECT 
    ds.sentiment_label as name, 
    COUNT(f.fact_id)::INT as value 
FROM fact_sentiment_events f
JOIN dim_sentiment ds ON f.sentiment_id = ds.sentiment_id
JOIN dim_date dd ON f.date_id = dd.date_id
JOIN global_keywords gk ON f.request_id = gk.global_keyword_id
WHERE f.request_id = $1 
  AND f.content_type_id = 1
  AND (gk.start_date IS NULL OR dd.calendar_date >= gk.start_date)
  AND (gk.end_date IS NULL OR dd.calendar_date <= gk.end_date)
GROUP BY ds.sentiment_label, ds.sentiment_order
ORDER BY ds.sentiment_order ASC
```

#### 2.3 Add Session Management Route
```javascript
// GET /api/pipeline/active-sessions/:userId
// - Return active/processing pipelines for user
// - Include session recovery data

// POST /api/pipeline/resume/:sessionId
// - Resume interrupted pipeline

// DELETE /api/pipeline/cleanup/:sessionId
// - Clean up stale sessions
```

---

### **Phase 3: Gold Layer Updates** (45 min)

#### 3.1 Update gold_layer.py
**Changes**:
- Accept `request_id` as parameter (NOT dates)
- Query dates from `global_keywords` table
- Apply date filter in INSERT SQL statements
- Check for cancellation flag during execution

**Modified INSERT with Date Filter**:
```python
INSERT_POST_SENTIMENT_WITH_DATE_FILTER_SQL = """
INSERT INTO fact_sentiment_events (
    silver_content_id, model_id, platform_id, content_type_id,
    sentiment_id, date_id, time_id, sentiment_score, request_id
)
SELECT
    sp.silver_post_id, 
    1, -- Model: RoBERTa
    1, -- Platform: Reddit
    1, -- Content Type: Post
    ds.sentiment_id, 
    COALESCE(dd.date_id, 20251231),
    COALESCE(dt.time_id, 1200),
    sp.post_sentiment_score, 
    %s
FROM silver_reddit_posts sp
JOIN dim_sentiment ds ON ds.sentiment_label = sp.post_sentiment_label
LEFT JOIN dim_date dd ON dd.calendar_date = DATE(sp.created_at_utc)
LEFT JOIN dim_time dt ON dt.time_id = (EXTRACT(HOUR FROM sp.created_at_utc) * 100 + EXTRACT(MINUTE FROM sp.created_at_utc))
JOIN global_keywords gk ON sp.global_keyword_id = gk.global_keyword_id
WHERE sp.global_keyword_id = %s
  AND sp.gold_processed = FALSE
  AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
  AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
ON CONFLICT (silver_content_id, model_id) DO NOTHING;
"""
```

#### 3.2 Add Cancellation Check
```python
def check_cancellation(request_id, conn):
    """Check if pipeline was cancelled"""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT status FROM global_keywords WHERE global_keyword_id = %s",
            (request_id,)
        )
        row = cur.fetchone()
        if row and row[0] == 'CANCELLED':
            print(f"[GOLD] Pipeline {request_id} was cancelled. Stopping.")
            return True
    return False

def run_gold_etl(keyword, request_id):
    conn = psycopg2.connect(PG_DSN)
    conn.autocommit = False
    try:
        # Check cancellation before starting
        if check_cancellation(request_id, conn):
            return
        
        with conn.cursor() as cur:
            # Insert posts
            cur.execute(INSERT_POST_SENTIMENT_WITH_DATE_FILTER_SQL, (request_id, request_id))
            
            # Check cancellation mid-process
            if check_cancellation(request_id, conn):
                conn.rollback()
                return
            
            # Continue...
```

---

### **Phase 4: Frontend Updates** (2 hours)

#### 4.1 Update SentimentAnalysis.tsx
**Changes**:
- Remove client-side date filtering logic
- Send `start_date` and `end_date` to backend API
- Add cancellation button
- Add session recovery on page load
- Handle disconnection gracefully

**New State**:
```typescript
const [startDate, setStartDate] = useState<string>('');
const [endDate, setEndDate] = useState<string>('');
const [isCancelling, setIsCancelling] = useState(false);
const [sessionRecovered, setSessionRecovered] = useState(false);
```

**Modified Analysis Function**:
```typescript
const handleRunPipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyword.trim()) return;
    
    // Send dates to backend
    await startAnalysis(keyword, testUserId, startDate, endDate);
};
```

#### 4.2 Update useAnalysis Hook
**Changes**:
- Accept `startDate` and `endDate` parameters
- Send dates in POST body
- Add cancellation method
- Add session recovery method
- Handle disconnection with retry logic

```typescript
export const useAnalysis = () => {
    const [status, setStatus] = useState<AnalysisStatus>('IDLE');
    const [activeRequestId, setActiveRequestId] = useState<number | null>(null);
    
    // Start analysis with dates
    const startAnalysis = async (keyword: string, userId: number, startDate?: string, endDate?: string) => {
        setStatus('PROCESSING');
        try {
            const response = await fetch('/api/pipeline/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    keyword, 
                    user_id: userId,
                    start_date: startDate || null,
                    end_date: endDate || null
                })
            });
            // ...
        } catch (err) {
            // Handle disconnection
            console.error("Analysis failed to start:", err);
            setStatus('FAILED');
        }
    };
    
    // Cancel pipeline
    const cancelAnalysis = async () => {
        if (!activeRequestId) return;
        try {
            await fetch(`/api/pipeline/cancel/${activeRequestId}`, { method: 'POST' });
            setStatus('CANCELLED');
        } catch (err) {
            console.error("Cancellation failed:", err);
        }
    };
    
    // Recover active sessions
    const recoverSession = async (userId: number) => {
        try {
            const res = await fetch(`/api/pipeline/session/${userId}`);
            const sessions = await res.json();
            if (sessions.length > 0) {
                // Resume most recent session
                const session = sessions[0];
                setActiveRequestId(session.request_id);
                setStatus(session.status);
                return session;
            }
        } catch (err) {
            console.error("Session recovery failed:", err);
        }
        return null;
    };
    
    return { status, startAnalysis, cancelAnalysis, recoverSession, activeRequestId };
};
```

#### 4.3 Add Session Recovery on Mount
```typescript
useEffect(() => {
    // Recover active sessions on page load
    const testUserId = 1;
    recoverSession(testUserId).then(session => {
        if (session) {
            setKeyword(session.keyword);
            setStartDate(session.start_date || '');
            setEndDate(session.end_date || '');
            setSessionRecovered(true);
        }
    });
}, []);
```

#### 4.4 Add Cancellation UI
```tsx
{status === 'PROCESSING' && (
    <button
        onClick={handleCancelPipeline}
        disabled={isCancelling}
        className="px-4 py-2 bg-red-600 text-white rounded-lg"
    >
        {isCancelling ? 'Cancelling...' : 'Cancel Analysis'}
    </button>
)}

{sessionRecovered && (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-blue-700">
            ✓ Resumed previous analysis for "{keyword}"
        </p>
    </div>
)}
```

#### 4.5 Update Login/Register Navigation
**Login.tsx & Registration.tsx**:
```typescript
// OLD: navigate('/profile', { replace: true });
// NEW: navigate('/', { replace: true }); // Navigate to home/landing
```

#### 4.6 Create Navbar with Profile Icon
**Header.tsx** (create if doesn't exist):
```tsx
import { User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Header = () => {
    const navigate = useNavigate();
    const isLoggedIn = Boolean(localStorage.getItem('accessToken'));
    
    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        navigate('/login');
    };
    
    return (
        <header className="bg-white shadow-sm border-b">
            <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                <Link to="/" className="text-2xl font-bold text-blue-600">
                    BrandPulse
                </Link>
                
                <nav className="flex items-center gap-6">
                    {isLoggedIn ? (
                        <>
                            <Link to="/sentiment-analysis" className="text-gray-700 hover:text-blue-600">
                                Analyze
                            </Link>
                            <div className="relative group">
                                <button className="flex items-center gap-2 text-gray-700 hover:text-blue-600">
                                    <User size={20} />
                                    <span>Profile</span>
                                </button>
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 hidden group-hover:block">
                                    <Link to="/profile" className="block px-4 py-2 hover:bg-gray-100">
                                        My Profile
                                    </Link>
                                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 hover:bg-gray-100">
                                        Logout
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <Link to="/login" className="text-gray-700 hover:text-blue-600">
                                Login
                            </Link>
                            <Link to="/register" className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                                Sign Up
                            </Link>
                        </>
                    )}
                </nav>
            </div>
        </header>
    );
};

export default Header;
```

---

### **Phase 5: Race Condition Mitigation** (45 min)

#### 5.1 Database-Level Locking
```sql
-- Use row-level locking for concurrent requests
CREATE OR REPLACE FUNCTION acquire_pipeline_lock(p_user_id INT, p_keyword VARCHAR)
RETURNS TABLE(request_id INT, acquired BOOLEAN) AS $$
DECLARE
    v_request_id INT;
    v_status VARCHAR;
BEGIN
    -- Check existing processing pipeline
    SELECT global_keyword_id, status INTO v_request_id, v_status
    FROM global_keywords
    WHERE user_id = p_user_id 
      AND keyword = p_keyword
      AND status IN ('PROCESSING', 'PENDING')
    FOR UPDATE SKIP LOCKED; -- Skip if already locked
    
    IF v_request_id IS NOT NULL THEN
        -- Pipeline already running
        RETURN QUERY SELECT v_request_id, FALSE;
    ELSE
        -- Create new pipeline
        INSERT INTO global_keywords (keyword, user_id, status, last_run_at)
        VALUES (p_keyword, p_user_id, 'PROCESSING', NOW())
        RETURNING global_keyword_id, TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql;
```

#### 5.2 Backend Rate Limiting
```javascript
// In routes/pipeline.js
const activePipelines = new Map(); // userId -> requestId

router.post('/analyze', async (req, res) => {
    const { keyword, user_id } = req.body;
    
    // Check in-memory lock
    if (activePipelines.has(user_id)) {
        const existingRequestId = activePipelines.get(user_id);
        return res.status(429).json({ 
            error: "Pipeline already running", 
            requestId: existingRequestId 
        });
    }
    
    try {
        // Acquire database lock
        const result = await pool.query(
            'SELECT * FROM acquire_pipeline_lock($1, $2)',
            [user_id, keyword]
        );
        
        const { request_id, acquired } = result.rows[0];
        
        if (!acquired) {
            return res.status(429).json({ 
                error: "Pipeline already running", 
                requestId: request_id 
            });
        }
        
        // Set in-memory lock
        activePipelines.set(user_id, request_id);
        
        // Spawn Python process
        // ...
        
        // Clean up lock when done
        pythonProcess.on('close', () => {
            activePipelines.delete(user_id);
        });
        
    } catch (err) {
        console.error("Pipeline error:", err);
        activePipelines.delete(user_id);
        res.status(500).json({ error: "Pipeline failed" });
    }
});
```

#### 5.3 Frontend Debouncing
```typescript
import { useCallback } from 'react';
import { debounce } from 'lodash';

// Debounce analysis requests
const debouncedStartAnalysis = useCallback(
    debounce((keyword, userId, startDate, endDate) => {
        startAnalysis(keyword, userId, startDate, endDate);
    }, 1000, { leading: true, trailing: false }),
    []
);
```

#### 5.4 Heartbeat Mechanism
```typescript
// In useAnalysis hook
useEffect(() => {
    let heartbeatInterval: any;
    
    if (status === 'PROCESSING' && activeRequestId) {
        // Send heartbeat every 5 seconds
        heartbeatInterval = setInterval(async () => {
            try {
                await fetch(`/api/pipeline/heartbeat/${activeRequestId}`, { method: 'POST' });
            } catch (err) {
                console.error("Heartbeat failed:", err);
                // Handle disconnection
            }
        }, 5000);
    }
    
    return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
}, [status, activeRequestId]);
```

---

## 📊 Data Flow Diagrams

### OLD: Client-Side Filtering
```
User enters keyword → Bronze (fetch all data) → Silver (process all) → Gold (store all) → API (return all) → Frontend (filter by date)
```

### NEW: Server-Side Filtering
```
User enters keyword + dates
    ↓
Backend stores dates in global_keywords
    ↓
Bronze: Fetch data (keyword only, no date constraint)
    ↓
Silver: Process all fetched data
    ↓
Gold: Filter by dates from global_keywords table
      INSERT only records matching date range
    ↓
API: Query fact table (already filtered)
    ↓
Frontend: Display pre-filtered results
```

---

## 🔄 State Synchronization Flow

### Scenario 1: Page Refresh During Processing
```
1. User starts analysis (requestId = 123, status = PROCESSING)
2. Page refreshes
3. Frontend checks localStorage for activeRequestId
4. Calls /api/pipeline/session/:userId
5. Backend returns { request_id: 123, status: 'PROCESSING', keyword: 'iPhone' }
6. Frontend resumes polling for status
7. Display: "Resuming analysis for 'iPhone'..."
```

### Scenario 2: Internet Disconnection
```
1. Analysis running (status = PROCESSING)
2. Network disconnects
3. Polling fails → Frontend detects failure
4. Display: "Connection lost. Retrying..."
5. Implement exponential backoff retry
6. When connection restored → Resume polling
7. If too much time passed → Mark as FAILED
```

### Scenario 3: User Cancellation
```
1. User clicks "Cancel Analysis"
2. Frontend calls POST /api/pipeline/cancel/:requestId
3. Backend updates global_keywords SET status = 'CANCELLED'
4. Gold Layer checks cancellation flag before each operation
5. Python gracefully stops
6. Frontend shows: "Analysis cancelled"
```

---

## ✅ Implementation Checklist

### Phase 1: Database (30 min)
- [ ] Create migration file: `003_date_filtering_support.sql`
- [ ] Add `start_date`, `end_date` to `global_keywords`
- [ ] Create `pipeline_sessions` table
- [ ] Create `pipeline_cancellations` table
- [ ] Create `acquire_pipeline_lock()` function
- [ ] Run migration in pgAdmin

### Phase 2: Backend API (1 hour)
- [ ] Update `routes/pipeline.js`
  - [ ] Accept `start_date`, `end_date` in `/analyze`
  - [ ] Store dates in database
  - [ ] Add `/cancel/:requestId` endpoint
  - [ ] Add `/session/:userId` endpoint
  - [ ] Add `/heartbeat/:requestId` endpoint
  - [ ] Implement in-memory lock (Map)
- [ ] Update `routes/data.js`
  - [ ] Add date filtering to `/results/:requestId`
  - [ ] Add date filtering to `/details/:requestId`
  - [ ] Join with `global_keywords` for dates

### Phase 3: Gold Layer (45 min)
- [ ] Update `ETL_2/gold_layer.py`
  - [ ] Add date filter to INSERT_POST_SENTIMENT_SQL
  - [ ] Add date filter to INSERT_COMMENT_SENTIMENT_SQL
  - [ ] Add `check_cancellation()` function
  - [ ] Call cancellation check before each operation
  - [ ] Test with date range

### Phase 4: Frontend (2 hours)
- [ ] Update `client/src/hooks/useAnalysis.ts`
  - [ ] Add `startDate`, `endDate` parameters
  - [ ] Add `cancelAnalysis()` method
  - [ ] Add `recoverSession()` method
  - [ ] Add heartbeat mechanism
  - [ ] Add disconnection handling
- [ ] Update `client/src/pages/SentimentAnalysis.tsx`
  - [ ] Remove client-side filtering logic
  - [ ] Add cancellation button
  - [ ] Add session recovery UI
  - [ ] Add disconnection indicator
  - [ ] Update date picker behavior
- [ ] Update `client/src/pages/Login.tsx`
  - [ ] Change navigation: `navigate('/')` instead of `navigate('/profile')`
- [ ] Update `client/src/pages/Registration.tsx`
  - [ ] Change navigation: `navigate('/')` instead of `navigate('/profile')`
- [ ] Create/Update `client/src/components/Header.tsx`
  - [ ] Add navbar with logo
  - [ ] Add profile icon dropdown
  - [ ] Add logout functionality
- [ ] Update `client/src/App.tsx`
  - [ ] Add `<Header />` to all routes

### Phase 5: Race Conditions (45 min)
- [ ] Implement database-level locking
- [ ] Add in-memory lock in backend
- [ ] Add debouncing in frontend
- [ ] Add request deduplication
- [ ] Test concurrent requests

### Phase 6: Testing (1 hour)
- [ ] Test date filtering accuracy
- [ ] Test page refresh during processing
- [ ] Test internet disconnection
- [ ] Test user cancellation
- [ ] Test concurrent requests
- [ ] Test session recovery
- [ ] Test navigation flow (login → home)
- [ ] Test profile icon dropdown

---

## 🎯 Success Criteria

- [ ] Date filtering happens in Gold Layer (SQL queries)
- [ ] Bronze Layer only uses keyword (no date logic)
- [ ] Page refresh resumes active pipeline
- [ ] Internet disconnection handled gracefully
- [ ] User can cancel pipeline mid-execution
- [ ] Login/signup navigates to home page
- [ ] Profile accessible via navbar icon
- [ ] No race conditions when running concurrent analyses
- [ ] All tests pass
- [ ] Zero data inconsistencies

---

## 📚 Documentation Needs

- [ ] Update API documentation with new endpoints
- [ ] Update database schema documentation
- [ ] Create troubleshooting guide for sync issues
- [ ] Document race condition prevention strategies
- [ ] Update user guide with new navigation flow

---

**Estimated Total Time**: 6-7 hours  
**Complexity**: HIGH (Architectural change)  
**Risk**: MEDIUM (Requires careful testing)  
**Impact**: HIGH (Better performance, UX, reliability)

---

Ready to begin implementation? Confirm and I'll start with Phase 1.
