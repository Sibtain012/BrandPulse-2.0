import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import pool from "../db.js";
import { verifyToken } from "../middleware/VerifyToken.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Python runner lives in the clean pipeline package.
const RUNNER = path.join(
  __dirname,
  "..",
  "brandpulse_clean",
  "cooccurrence_analysis",
  "run_cooccurrence.py",
);

// Resolve analysis + verify caller owns it. Returns { platform_id, keyword } or null.
async function resolveOwnedAnalysis(requestId, userId) {
  const r = await pool.query(
    `SELECT platform_id, keyword FROM analysis_history
     WHERE request_id = $1 AND user_id = $2 LIMIT 1`,
    [requestId, userId],
  );
  return r.rows.length ? r.rows[0] : null;
}

// POST /api/cooccurrence/analysis/:analysisId/cooccurrence/analyze?keyword=tesla
// Spawn Python runner -> compute PMI co-occurrence -> upsert into table.
const analyzeCooccurrence = async (req, res) => {
  try {
    const requestId = parseInt(req.params.analysisId, 10);
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

    // keyword defaults to the analysis's own keyword.
    const keyword = (req.query.keyword || owned.keyword || "").toString();
    if (!keyword.trim()) {
      return res.status(400).json({ error: "keyword required" });
    }
    const platform = owned.platform_id === 2 ? "twitter" : "reddit";

    const pythonExe = process.env.PYTHON_EXE_PATH || "python";
    const proc = spawn(pythonExe, [
      RUNNER,
      requestId.toString(),
      keyword,
      platform,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error("[cooccurrence] runner failed:", stderr || stdout);
        return res
          .status(500)
          .json({ error: "Co-occurrence computation failed", detail: stderr });
      }
      // Runner prints a JSON summary line; take the last non-empty line.
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      let summary = {};
      try {
        summary = JSON.parse(lines[lines.length - 1]);
      } catch {
        summary = { raw: stdout.trim() };
      }
      res.json({
        success: true,
        analysisId: requestId,
        keyword: keyword.toLowerCase().trim(),
        tokensFound: summary.tokensFound ?? null,
        documents: summary.documents ?? null,
      });
    });
  } catch (error) {
    console.error("Co-occurrence analyze error:", error);
    res.status(500).json({ error: error.message });
  }
};

// GET /api/cooccurrence/analysis/:analysisId/cooccurrence
//     ?keyword=tesla&limit=20&minFreq=5&sortBy=pmi|count
const getCooccurrence = async (req, res) => {
  try {
    const requestId = parseInt(req.params.analysisId, 10);
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

    const keyword = (req.query.keyword || owned.keyword || "")
      .toString()
      .toLowerCase()
      .trim();
    const limit = Math.min(parseInt(req.query.limit ?? "20", 10) || 20, 200);
    const minFreq = parseInt(req.query.minFreq ?? "5", 10) || 0;
    const sortBy = req.query.sortBy === "count" ? "count" : "pmi";
    const orderCol =
      sortBy === "count" ? "cooccurrence_count" : "pmi_score";

    const { rows } = await pool.query(
      `
      SELECT
        cooccurrence_id,
        cooccur_token,
        cooccurrence_count AS count,
        pmi_score,
        docs_with_token,
        docs_with_both,
        total_documents
      FROM fact_keyword_cooccurrence
      WHERE request_id = $1
        AND primary_keyword = $2
        AND cooccurrence_count >= $3
      ORDER BY ${orderCol} DESC, cooccurrence_count DESC
      LIMIT $4
      `,
      [requestId, keyword, minFreq, limit],
    );

    res.json({
      analysisId: requestId,
      keyword,
      sortBy,
      minFreq,
      count: rows.length,
      tokens: rows,
    });
  } catch (error) {
    console.error("Get co-occurrence error:", error);
    res.status(500).json({ error: error.message });
  }
};

router.post(
  "/analysis/:analysisId/cooccurrence/analyze",
  verifyToken,
  analyzeCooccurrence,
);
router.get(
  "/analysis/:analysisId/cooccurrence",
  verifyToken,
  getCooccurrence,
);

export default router;
