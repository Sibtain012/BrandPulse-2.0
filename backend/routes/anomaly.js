import { Router } from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/VerifyToken.js";

const router = Router();

// Rolling Z-score query, adapted to the BrandPulse star schema.
//   - unit of analysis = request_id (no brand_id exists in this schema)
//   - event_date comes from dim_date, sentiment_label from dim_sentiment
//   - 7-day trailing window, excludes current day (can't compare a day to itself)
//   - division-by-zero handled (baseline_std = 0 -> z_score = 0)
//   - first 7 days have NULL baseline (intentional, not flagged)
const ROLLING_ZSCORE_SQL = `
  WITH daily_sentiment_counts AS (
    SELECT
      dd.calendar_date     AS event_date,
      fse.platform_id      AS platform_id,
      ds.sentiment_label   AS sentiment_label,
      COUNT(*)             AS daily_count
    FROM fact_sentiment_events fse
    JOIN dim_date      dd ON fse.date_id      = dd.date_id
    JOIN dim_sentiment ds ON fse.sentiment_id = ds.sentiment_id
    WHERE fse.request_id  = $1
      AND fse.platform_id = $2
    GROUP BY dd.calendar_date, fse.platform_id, ds.sentiment_label
  ),
  rolling_stats AS (
    SELECT
      event_date,
      platform_id,
      sentiment_label,
      daily_count,
      AVG(daily_count) OVER (
        PARTITION BY platform_id, sentiment_label
        ORDER BY event_date
        ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
      ) AS baseline_mean,
      STDDEV_SAMP(daily_count) OVER (
        PARTITION BY platform_id, sentiment_label
        ORDER BY event_date
        ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
      ) AS baseline_std
    FROM daily_sentiment_counts
  )
  SELECT
    event_date,
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
  ORDER BY event_date DESC
`;

// Resolve the analysis and verify the caller owns it. Returns { platform_id } or null.
async function resolveOwnedAnalysis(requestId, userId) {
  const r = await pool.query(
    `SELECT platform_id FROM analysis_history WHERE request_id = $1 AND user_id = $2 LIMIT 1`,
    [requestId, userId],
  );
  return r.rows.length ? r.rows[0] : null;
}

// POST /api/anomaly/analysis/:analysisId/anomalies/detect?threshold=2.0
// Detect anomalies for an analysis (by request_id). Upserts into fact_anomaly_events.
const detectAnomalies = async (req, res) => {
  try {
    const requestId = parseInt(req.params.analysisId, 10);
    const threshold = parseFloat(req.query.threshold ?? "2.0");
    const userId = req.user.user_id;

    if (Number.isNaN(requestId)) {
      return res.status(400).json({ error: "Invalid analysisId" });
    }

    const owned = await resolveOwnedAnalysis(requestId, userId);
    if (!owned) {
      return res
        .status(403)
        .json({ error: "Not authorized or analysis not found" });
    }
    const { platform_id } = owned;

    const { rows } = await pool.query(ROLLING_ZSCORE_SQL, [
      requestId,
      platform_id,
    ]);

    const insertQuery = `
      INSERT INTO fact_anomaly_events
        (request_id, metric_name, event_date, platform_id,
         sentiment_label, observed_count, baseline_mean, baseline_std,
         z_score, threshold_z, exceeded_threshold)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (request_id, event_date, metric_name, sentiment_label, platform_id)
        DO UPDATE SET
          observed_count     = EXCLUDED.observed_count,
          baseline_mean      = EXCLUDED.baseline_mean,
          baseline_std       = EXCLUDED.baseline_std,
          z_score            = EXCLUDED.z_score,
          threshold_z        = EXCLUDED.threshold_z,
          exceeded_threshold = EXCLUDED.exceeded_threshold,
          detected_at        = CURRENT_TIMESTAMP
    `;

    let inserted = 0;
    let exceededCount = 0;

    for (const row of rows) {
      // Skip the first 7 days (NULL baseline) — no baseline to compare against.
      if (row.baseline_mean === null || row.baseline_std === null) {
        continue;
      }

      const zScore = Number(row.z_score);
      const exceeded = Math.abs(zScore) > threshold;
      const metricName = `${row.sentiment_label}_volume`;

      await pool.query(insertQuery, [
        requestId,
        metricName,
        row.event_date,
        row.platform_id,
        row.sentiment_label,
        row.daily_count,
        row.baseline_mean,
        row.baseline_std,
        zScore,
        threshold,
        exceeded,
      ]);

      inserted++;
      if (exceeded) exceededCount++;
    }

    res.json({
      success: true,
      analysisId: requestId,
      threshold,
      rowsScored: inserted,
      anomaliesDetected: exceededCount,
      message: `Scored ${inserted} day/sentiment rows, ${exceededCount} exceeded |Z| > ${threshold}`,
    });
  } catch (error) {
    console.error("Anomaly detection error:", error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/anomaly/analysis/:analysisId/anomalies?threshold=2.0&limit=20
// Fetch detected anomalies that exceeded the threshold for an analysis.
const getAnomalies = async (req, res) => {
  try {
    const requestId = parseInt(req.params.analysisId, 10);
    const threshold = parseFloat(req.query.threshold ?? "2.0");
    const limit = parseInt(req.query.limit ?? "20", 10);
    const userId = req.user.user_id;

    if (Number.isNaN(requestId)) {
      return res.status(400).json({ error: "Invalid analysisId" });
    }

    const owned = await resolveOwnedAnalysis(requestId, userId);
    if (!owned) {
      return res
        .status(403)
        .json({ error: "Not authorized or analysis not found" });
    }

    const { rows } = await pool.query(
      `
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
      WHERE request_id = $1
        AND exceeded_threshold = TRUE
        AND ABS(z_score) > $2
      ORDER BY event_date DESC
      LIMIT $3
      `,
      [requestId, threshold, limit],
    );

    res.json({
      analysisId: requestId,
      threshold,
      count: rows.length,
      anomalies: rows,
    });
  } catch (error) {
    console.error("Get anomalies error:", error);
    res.status(500).json({ error: error.message });
  }
};

router.post(
  "/analysis/:analysisId/anomalies/detect",
  verifyToken,
  detectAnomalies,
);
router.get("/analysis/:analysisId/anomalies", verifyToken, getAnomalies);

export default router;
