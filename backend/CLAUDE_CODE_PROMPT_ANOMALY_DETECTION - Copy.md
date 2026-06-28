# Implementation: Anomaly Detection (Z-Score Spike Detection)

## FROZEN GUARDRAILS

### Architecture Constraints (NON-NEGOTIABLE)

**Database Layer:**
- PostgreSQL ONLY. No new MongoDB collections.
- Use existing `fact_sentiment_events` table. DO NOT add columns to it.
- Create NEW table: `fact_anomaly_events` (schema below).
- All queries use window functions: `AVG() OVER`, `STDDEV_SAMP() OVER`.
- No application-level computation. All anomaly detection = pure SQL.

**Pipeline Layer:**
- Anomaly detection runs AFTER sentiment analysis completes.
- Do NOT modify `sentiment_classification/` or `intent_classification/` code.
- Do NOT call external models or APIs.
- Anomaly detection = batch job, triggered by `/api/analysis/:id/analyze-anomalies` endpoint.

**Frontend Layer:**
- Add anomaly badges/markers to EXISTING Trend Analysis chart (do not create new chart).
- Do NOT modify existing sentiment distribution/intent charts.
- Anomaly data displayed as overlay on existing visualizations.

### Forbidden Patterns (WILL BREAK SCOPE)

❌ Do NOT add `z_score` or `anomaly_flag` columns to `fact_sentiment_events`
❌ Do NOT create materialized views (use queries, let PostgreSQL optimize)
❌ Do NOT compute Z-scores in Python/Node.js (SQL only)
❌ Do NOT call external anomaly detection APIs (Isolation Forest, etc.)
❌ Do NOT modify existing routes: `/api/analysis/:id` (create new route)
❌ Do NOT change sentiment label values (stays 'Positive'/'Negative'/'Neutral')
❌ Do NOT create cron job for automatic anomaly detection (manual API call only)
❌ Do NOT store threshold in code (make it a query parameter with default 2.0)
❌ Do NOT touch `routes/data.js` sentiment retrieval endpoints

### File Structure (Explicit Read/Write Permissions)

**READ ONLY:**
```
routes/data.js                          (existing sentiment endpoints)
routes/pipeline.js                      (orchestration)
src/components/TrendAnalysis.jsx        (existing chart component)
db/migrations/001_initial_schema.sql    (reference for table structure)
```

**MODIFY/CREATE:**
```
routes/anomaly.js                       (NEW — anomaly endpoints)
db/migrations/[YYYYMMDD]_anomaly_schema.sql  (NEW — schema migration)
src/components/AnomalyOverlay.jsx       (NEW — badge/marker component)
src/hooks/useAnomalies.js               (NEW — data fetch hook)
```

---

## IMPLEMENTATION SPECIFICATION

### 1. Schema Definition

**New table — EXACT SQL (run in migration):**

```sql
-- Migration: db/migrations/[date]_add_anomaly_detection.sql

CREATE TABLE IF NOT EXISTS fact_anomaly_events (
  anomaly_id SERIAL PRIMARY KEY,
  analysis_id INT NOT NULL,
  metric_name VARCHAR(50) NOT NULL,  -- e.g., "negative_volume", "total_volume"
  event_date DATE NOT NULL,
  brand_id INT NOT NULL,
  platform_id INT NOT NULL,
  sentiment_label VARCHAR(20),  -- Positive, Negative, Neutral (nullable for total_volume metric)
  
  -- Observed values
  observed_count INT NOT NULL,
  baseline_mean FLOAT NOT NULL,
  baseline_std FLOAT NOT NULL,
  z_score FLOAT NOT NULL,
  
  -- Configuration
  threshold_z FLOAT NOT NULL DEFAULT 2.0,
  exceeded_threshold BOOLEAN NOT NULL,
  
  -- Metadata
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (analysis_id) REFERENCES analysis_history(id),
  FOREIGN KEY (brand_id) REFERENCES dim_brand(brand_id),
  FOREIGN KEY (platform_id) REFERENCES dim_platform(platform_id),
  
  UNIQUE(analysis_id, event_date, metric_name, sentiment_label, platform_id)
);

CREATE INDEX idx_anomaly_analysis ON fact_anomaly_events(analysis_id);
CREATE INDEX idx_anomaly_date ON fact_anomaly_events(event_date);
CREATE INDEX idx_anomaly_exceeded ON fact_anomaly_events(exceeded_threshold);
```

**Verify constraints before proceeding:**
- `dim_brand` has `brand_id` PK
- `dim_platform` has `platform_id` PK
- `analysis_history` has `id` PK
- `fact_sentiment_events` has `created_at` column (timestamp)

---

### 2. Core SQL Query (Template)

**Do NOT modify. Use EXACTLY as-is in backend.**

```sql
-- Query: Compute rolling Z-scores per day per brand per platform per sentiment
WITH daily_sentiment_counts AS (
  SELECT 
    DATE(fse.created_at) AS event_date,
    fse.brand_id,
    fse.platform_id,
    fse.sentiment_label,
    COUNT(*) AS daily_count
  FROM fact_sentiment_events fse
  WHERE fse.brand_id = $1
    AND fse.created_at >= (CURRENT_DATE - INTERVAL '60 days')
  GROUP BY 1, 2, 3, 4
),
rolling_stats AS (
  SELECT 
    event_date,
    brand_id,
    platform_id,
    sentiment_label,
    daily_count,
    
    -- 7-day trailing mean (excluding current day)
    AVG(daily_count) OVER (
      PARTITION BY brand_id, platform_id, sentiment_label
      ORDER BY event_date
      ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
    ) AS baseline_mean,
    
    -- 7-day trailing std dev (excluding current day)
    STDDEV_SAMP(daily_count) OVER (
      PARTITION BY brand_id, platform_id, sentiment_label
      ORDER BY event_date
      ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
    ) AS baseline_std
    
  FROM daily_sentiment_counts
)
SELECT 
  event_date,
  brand_id,
  platform_id,
  sentiment_label,
  daily_count,
  baseline_mean,
  baseline_std,
  CASE 
    WHEN baseline_std IS NULL OR baseline_std = 0 THEN 0
    ELSE (daily_count - COALESCE(baseline_mean, 0)) / baseline_std
  END AS z_score
FROM rolling_stats
WHERE event_date >= (CURRENT_DATE - INTERVAL '60 days')
  AND event_date < CURRENT_DATE  -- Exclude partial today
ORDER BY event_date DESC;
```

**Parameters:**
- `$1` = `brand_id` (INT)

**Notes:**
- 7-day window = standard baseline. Non-negotiable.
- Excludes current day (ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING).
- First 7 days of data = NULL baseline (intentional; no flagging before baseline available).
- Handle division-by-zero explicitly (baseline_std = 0 → z_score = 0).

---

### 3. Backend Implementation

**File: `routes/anomaly.js` (NEW)**

```javascript
// POST /api/analysis/:analysisId/anomalies/detect
// Detect anomalies for a given analysis. Store results in fact_anomaly_events.

const express = require('express');
const router = express.Router();
const pool = require('../db');

const detectAnomalies = async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { threshold = 2.0 } = req.query;  // Z-score threshold, default 2.0 (2σ)
    
    // Step 1: Fetch analysis metadata (brand_id, analysis details)
    const analysisQuery = `
      SELECT id, brand_id FROM analysis_history WHERE id = $1
    `;
    const analysisResult = await pool.query(analysisQuery, [analysisId]);
    
    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    const { brand_id } = analysisResult.rows[0];
    
    // Step 2: Run rolling Z-score query (EXACT SQL from above)
    const anomalyQuery = `
      WITH daily_sentiment_counts AS (
        SELECT 
          DATE(fse.created_at) AS event_date,
          fse.brand_id,
          fse.platform_id,
          fse.sentiment_label,
          COUNT(*) AS daily_count
        FROM fact_sentiment_events fse
        WHERE fse.brand_id = $1
          AND fse.created_at >= (CURRENT_DATE - INTERVAL '60 days')
        GROUP BY 1, 2, 3, 4
      ),
      rolling_stats AS (
        SELECT 
          event_date,
          brand_id,
          platform_id,
          sentiment_label,
          daily_count,
          AVG(daily_count) OVER (
            PARTITION BY brand_id, platform_id, sentiment_label
            ORDER BY event_date
            ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
          ) AS baseline_mean,
          STDDEV_SAMP(daily_count) OVER (
            PARTITION BY brand_id, platform_id, sentiment_label
            ORDER BY event_date
            ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
          ) AS baseline_std
        FROM daily_sentiment_counts
      )
      SELECT 
        event_date,
        brand_id,
        platform_id,
        sentiment_label,
        daily_count,
        baseline_mean,
        baseline_std,
        CASE 
          WHEN baseline_std IS NULL OR baseline_std = 0 THEN 0
          ELSE (daily_count - COALESCE(baseline_mean, 0)) / baseline_std
        END AS z_score
      FROM rolling_stats
      WHERE event_date >= (CURRENT_DATE - INTERVAL '60 days')
        AND event_date < CURRENT_DATE
      ORDER BY event_date DESC
    `;
    
    const zscoreResult = await pool.query(anomalyQuery, [brand_id]);
    const anomalies = zscoreResult.rows;
    
    // Step 3: Filter anomalies by threshold and insert to fact_anomaly_events
    const insertQuery = `
      INSERT INTO fact_anomaly_events 
        (analysis_id, metric_name, event_date, brand_id, platform_id, 
         sentiment_label, observed_count, baseline_mean, baseline_std, 
         z_score, threshold_z, exceeded_threshold)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (analysis_id, event_date, metric_name, sentiment_label, platform_id)
        DO UPDATE SET
          z_score = EXCLUDED.z_score,
          exceeded_threshold = EXCLUDED.exceeded_threshold,
          detected_at = CURRENT_TIMESTAMP
    `;
    
    let insertedCount = 0;
    
    for (const row of anomalies) {
      // Skip rows with NULL baseline (first 7 days)
      if (row.baseline_mean === null || row.baseline_std === null) {
        continue;
      }
      
      const metricName = `${row.sentiment_label}_volume`;
      const exceeded = Math.abs(row.z_score) > threshold;
      
      await pool.query(insertQuery, [
        analysisId,
        metricName,
        row.event_date,
        row.brand_id,
        row.platform_id,
        row.sentiment_label,
        row.daily_count,
        row.baseline_mean,
        row.baseline_std,
        row.z_score,
        threshold,
        exceeded
      ]);
      
      insertedCount++;
    }
    
    res.json({
      success: true,
      analysisId,
      threshold,
      anomaliesDetected: insertedCount,
      message: `Detected ${insertedCount} anomalies for analysis ${analysisId}`
    });
    
  } catch (error) {
    console.error('Anomaly detection error:', error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/analysis/:analysisId/anomalies?threshold=2.0&limit=20
// Fetch detected anomalies for a given analysis.

const getAnomalies = async (req, res) => {
  try {
    const { analysisId } = req.params;
    const { threshold = 2.0, limit = 20 } = req.query;
    
    const query = `
      SELECT 
        anomaly_id,
        event_date,
        metric_name,
        sentiment_label,
        observed_count,
        baseline_mean,
        baseline_std,
        z_score,
        detected_at
      FROM fact_anomaly_events
      WHERE analysis_id = $1
        AND exceeded_threshold = TRUE
        AND ABS(z_score) > $2
      ORDER BY event_date DESC
      LIMIT $3
    `;
    
    const result = await pool.query(query, [analysisId, threshold, limit]);
    
    res.json({
      analysisId,
      threshold,
      count: result.rows.length,
      anomalies: result.rows
    });
    
  } catch (error) {
    console.error('Get anomalies error:', error);
    res.status(500).json({ error: error.message });
  }
};

router.post('/analysis/:analysisId/anomalies/detect', detectAnomalies);
router.get('/analysis/:analysisId/anomalies', getAnomalies);

module.exports = router;
```

**Integration in `routes/index.js` or main app:**

```javascript
const anomalyRoutes = require('./anomaly');
app.use('/api', anomalyRoutes);
```

---

### 4. Frontend Implementation

**File: `src/hooks/useAnomalies.js` (NEW)**

```javascript
import { useState, useEffect } from 'react';
import axios from 'axios';

export const useAnomalies = (analysisId, threshold = 2.0) => {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!analysisId) return;
    
    const fetchAnomalies = async () => {
      try {
        setLoading(true);
        const response = await axios.get(
          `/api/analysis/${analysisId}/anomalies?threshold=${threshold}`
        );
        setAnomalies(response.data.anomalies || []);
        setError(null);
      } catch (err) {
        setError(err.message);
        setAnomalies([]);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAnomalies();
  }, [analysisId, threshold]);
  
  return { anomalies, loading, error };
};
```

**File: `src/components/AnomalyOverlay.jsx` (NEW)**

```jsx
import React from 'react';
import { useAnomalies } from '../hooks/useAnomalies';

export const AnomalyOverlay = ({ analysisId, trendChartData, threshold = 2.0 }) => {
  const { anomalies, loading } = useAnomalies(analysisId, threshold);
  
  if (loading || !anomalies.length) {
    return null;
  }
  
  // Build a map of date → anomaly z-score for easy lookup
  const anomalyMap = {};
  anomalies.forEach(a => {
    anomalyMap[a.event_date] = a.z_score;
  });
  
  return (
    <div className="anomaly-overlay">
      <h4>Detected Anomalies (|Z| > {threshold})</h4>
      <div className="anomaly-list">
        {anomalies.map((a) => (
          <div key={a.anomaly_id} className="anomaly-item">
            <span className="date">{a.event_date}</span>
            <span className="metric">{a.metric_name}</span>
            <span className={`zscore ${Math.abs(a.z_score) > 3 ? 'critical' : 'warning'}`}>
              Z = {a.z_score.toFixed(2)}σ
            </span>
            <span className="count">
              {a.observed_count} observed (baseline: {a.baseline_mean?.toFixed(1)})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

**Integration in Trend Analysis component:**

```jsx
import { AnomalyOverlay } from './AnomalyOverlay';

export const TrendAnalysis = ({ analysisId }) => {
  // ... existing trend chart code ...
  
  return (
    <div className="trend-analysis">
      {/* Existing trend chart */}
      <TrendChart data={trendData} />
      
      {/* NEW: Anomaly overlay */}
      <AnomalyOverlay analysisId={analysisId} threshold={2.0} />
    </div>
  );
};
```

---

## PRE-FLIGHT CHECKLIST

**Before you write any code, confirm ALL of these:**

- [ ] PostgreSQL schema: `\d fact_sentiment_events` shows `created_at` (TIMESTAMP)
- [ ] PostgreSQL schema: `\d dim_brand` shows `brand_id` (PK)
- [ ] PostgreSQL schema: `\d dim_platform` shows `platform_id` (PK)
- [ ] PostgreSQL schema: `\d analysis_history` shows `id` (PK)
- [ ] Confirm `routes/data.js` exists and is untouched
- [ ] Confirm `src/components/TrendAnalysis.jsx` exists
- [ ] Verify Node.js `pool` connection pool available in `routes/` modules

**Report findings:**

```
Confirmed fact_sentiment_events.created_at type: [type]
Confirmed dim_brand.brand_id exists: [yes/no]
Confirmed dim_platform.platform_id exists: [yes/no]
Confirmed analysis_history.id exists: [yes/no]
Confirmed routes/data.js path: [path]
Ready to proceed: [YES/NO]
```

---

## SUCCESS CRITERIA

- [ ] Migration runs without errors: `fact_anomaly_events` table created
- [ ] POST `/api/analysis/:id/anomalies/detect?threshold=2.0` returns 200 with anomaly count
- [ ] GET `/api/analysis/:id/anomalies` returns JSON array of detected anomalies
- [ ] No rows inserted into `fact_sentiment_events` or modified in `analysis_history`
- [ ] Frontend: AnomalyOverlay renders without console errors
- [ ] Frontend: clicking TrendAnalysis shows anomaly badges on dates
- [ ] Anomalies only flagged for event_date >= (first date + 7 days)
- [ ] Z-score = 0 for dates with baseline_std = 0

---

## IMPLEMENTATION SEQUENCE

1. Create migration file: `db/migrations/[date]_add_anomaly_detection.sql`
2. Run migration to create `fact_anomaly_events` table
3. Create `routes/anomaly.js` with detectAnomalies + getAnomalies functions
4. Register routes in main app (routes/index.js or app.js)
5. Create `src/hooks/useAnomalies.js`
6. Create `src/components/AnomalyOverlay.jsx`
7. Import AnomalyOverlay into TrendAnalysis component
8. Test: POST to `/api/analysis/[test-id]/anomalies/detect`
9. Test: GET `/api/analysis/[test-id]/anomalies`
10. Verify frontend renders without errors

---

## NOTES FOR CLAUDE CODE

- Z-score threshold (default 2.0) = 2 standard deviations ≈ 5% false positive rate under normal distribution. Non-negotiable.
- Window size (7 days) is business standard for sentiment anomaly detection. Non-negotiable.
- Query uses `ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING` (excludes current day). This is intentional — you can't compare today to its own baseline.
- All computation MUST be SQL. Do not move window function logic to Node.js.
- `fact_anomaly_events` is append-only (no deletes, only inserts or UPSERTs). Preserve audit trail.

