import { Router } from "express";
import { MongoClient } from "mongodb";
import pool from "../db.js";

const router = Router();

// MongoDB connection for ingestion stats
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
let mongoClient;
let mongoDb;

async function getMongoDb() {
    if (!mongoClient) {
        mongoClient = new MongoClient(MONGO_URI);
        await mongoClient.connect();
        mongoDb = mongoClient.db("BrandPulse_1");
    }
    return mongoDb;
}

// GET /api/data/results/:requestId
// Returns sentiment distribution for BOTH posts and comments separately
// Filters by date range from global_keywords table
router.get("/results/:requestId", async (req, res) => {
    try {
        const rid = parseInt(req.params.requestId);
        console.log(`[API] Fetching results for Request ID: ${rid}`);

        // Query for POSTS sentiment (filtered by dates from global_keywords)
        const postsResult = await pool.query(`
            SELECT 
                sp.post_sentiment_label as name, 
                COUNT(*)::INT as value 
            FROM silver_reddit_posts sp
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            JOIN dim_sentiment ds ON ds.sentiment_label = sp.post_sentiment_label
            WHERE sp.global_keyword_id = $1
            AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
            GROUP BY sp.post_sentiment_label, ds.sentiment_order
            ORDER BY ds.sentiment_order ASC
        `, [rid]);

        // Query for COMMENTS sentiment (filtered by dates from global_keywords)
        const commentsResult = await pool.query(`
            SELECT 
                sc.comment_sentiment_label as name, 
                COUNT(*)::INT as value 
            FROM silver_reddit_comments sc
            JOIN silver_reddit_posts sp ON sc.silver_post_id = sp.silver_post_id
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            JOIN dim_sentiment ds ON ds.sentiment_label = sc.comment_sentiment_label
            WHERE sp.global_keyword_id = $1
            AND (gk.start_date IS NULL OR DATE(sc.comment_created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sc.comment_created_at_utc) <= gk.end_date)
            GROUP BY sc.comment_sentiment_label, ds.sentiment_order
            ORDER BY ds.sentiment_order ASC
        `, [rid]);

        // Calculate totals
        const postTotal = postsResult.rows.reduce((sum, r) => sum + r.value, 0);
        const commentTotal = commentsResult.rows.reduce((sum, r) => sum + r.value, 0);

        console.log(`[API] Found ${postTotal} posts and ${commentTotal} comments for ID ${rid} (date filtered)`);

        res.json({
            posts: postsResult.rows,
            comments: commentsResult.rows,
            totals: {
                posts: postTotal,
                comments: commentTotal,
                total: postTotal + commentTotal
            }
        });
    } catch (err) {
        console.error("Fetch failed:", err.message);
        res.status(500).json({ error: "Fetch failed" });
    }
});

// GET /api/data/details/:requestId
// Returns actual posts and comments with their sentiment labels as proof
// Filters by date range if user specified dates
router.get("/details/:requestId", async (req, res) => {
    try {
        const rid = parseInt(req.params.requestId);
        console.log(`[API] Fetching detailed data for Request ID: ${rid}`);

        // Fetch posts with sentiment, applying date filter from global_keywords
        const postsResult = await pool.query(`
            SELECT 
                sp.silver_post_id as id,
                sp.title_clean as title,
                sp.body_clean as body,
                sp.subreddit_name as subreddit,
                sp.post_score as score,
                sp.post_sentiment_label as sentiment,
                sp.post_sentiment_score as confidence,
                sp.post_url as url,
                sp.created_at_utc as created_at
            FROM silver_reddit_posts sp
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            WHERE sp.global_keyword_id = $1
            AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
            ORDER BY sp.post_score DESC
            LIMIT 50
        `, [rid]);

        // Fetch comments with sentiment (joined with posts for context)
        // Apply date filter to match Gold Layer behavior
        const commentsResult = await pool.query(`
            SELECT 
                c.silver_comment_id as id,
                c.comment_body_clean as body,
                c.comment_score as score,
                c.comment_sentiment_label as sentiment,
                c.comment_sentiment_score as confidence,
                c.comment_created_at_utc as created_at,
                p.title_clean as post_title,
                p.silver_post_id as post_id
            FROM silver_reddit_comments c
            JOIN silver_reddit_posts p ON c.silver_post_id = p.silver_post_id
            JOIN global_keywords gk ON gk.global_keyword_id = p.global_keyword_id
            WHERE p.global_keyword_id = $1
            AND (gk.start_date IS NULL OR DATE(c.comment_created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(c.comment_created_at_utc) <= gk.end_date)
            ORDER BY c.comment_score DESC
            LIMIT 100
        `, [rid]);

        console.log(`[API] Found ${postsResult.rows.length} posts and ${commentsResult.rows.length} comments details`);

        res.json({
            posts: postsResult.rows,
            comments: commentsResult.rows
        });
    } catch (err) {
        console.error("Details fetch failed:", err.message);
        res.status(500).json({ error: "Details fetch failed" });
    }
});

// GET /api/data/ingestion-stats/:requestId
// Returns ingestion job statistics from MongoDB
router.get("/ingestion-stats/:requestId", async (req, res) => {
    try {
        const rid = parseInt(req.params.requestId);
        console.log(`[API] Fetching ingestion stats for Request ID: ${rid}`);

        const db = await getMongoDb();
        const jobsCollection = db.collection("bronze_ingestion_jobs");

        // Find the job by global_keyword_id
        const job = await jobsCollection.findOne({ global_keyword_id: rid });

        if (!job) {
            return res.json({
                processed: 0,
                skipped_nsfw: 0,
                skipped_non_english: 0
            });
        }

        res.json({
            processed: job.stats?.processed || 0,
            skipped_nsfw: job.stats?.skipped_nsfw || 0,
            skipped_non_english: job.stats?.skipped_non_english || 0
        });
    } catch (err) {
        console.error("Ingestion stats fetch failed:", err.message);
        res.status(500).json({ error: "Ingestion stats fetch failed" });
    }
});

// GET /api/data/history/:userId
// Returns all past analyses for a user, sorted by most recent
router.get("/history/:userId", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const limit = parseInt(req.query.limit) || 50; // Default 50 results
        const offset = parseInt(req.query.offset) || 0;

        console.log(`[API] Fetching analysis history for User ID: ${userId}`);

        const result = await pool.query(`
            SELECT 
                history_id,
                keyword,
                start_date,
                end_date,
                total_posts,
                total_comments,
                dominant_sentiment,
                avg_post_sentiment_score,
                avg_comment_sentiment_score,
                avg_sentiment_score,
                request_id,
                analysis_timestamp,
                created_at
            FROM analysis_history
            WHERE user_id = $1
            ORDER BY analysis_timestamp DESC
            LIMIT $2 OFFSET $3
        `, [userId, limit, offset]);

        // Also get total count for pagination
        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM analysis_history WHERE user_id = $1`,
            [userId]
        );

        res.json({
            analyses: result.rows,
            total: parseInt(countResult.rows[0].total),
            limit,
            offset
        });
    } catch (err) {
        console.error("History fetch failed:", err.message);
        res.status(500).json({ error: "Failed to fetch analysis history" });
    }
});

// GET /api/data/history/:userId/search?keyword=bitcoin
// Search user's history by keyword
router.get("/history/:userId/search", async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const searchKeyword = req.query.keyword || '';

        console.log(`[API] Searching history for User ID: ${userId}, Keyword: ${searchKeyword}`);

        const result = await pool.query(`
            SELECT 
                history_id,
                keyword,
                start_date,
                end_date,
                total_posts,
                total_comments,
                dominant_sentiment,
                avg_post_sentiment_score,
                avg_comment_sentiment_score,
                avg_sentiment_score,
                request_id,
                analysis_timestamp
            FROM analysis_history
            WHERE user_id = $1 AND keyword ILIKE $2
            ORDER BY analysis_timestamp DESC
            LIMIT 20
        `, [userId, `%${searchKeyword}%`]);

        res.json({ analyses: result.rows });
    } catch (err) {
        console.error("History search failed:", err.message);
        res.status(500).json({ error: "Failed to search analysis history" });
    }
});

export default router;