import { spawn } from 'child_process';
import { Router } from 'express';
import pool from '../db.js'; // Ensure you import your DB pool

const router = Router();

// Helper function to save completed analysis to history
async function saveAnalysisToHistory(requestId, keyword, userId, startDate, endDate) {
    try {
        console.log(`[History] Starting to save analysis for Request ID: ${requestId}`);

        // Fetch sentiment data from silver tables (posts)
        const postsQuery = await pool.query(`
            SELECT 
                COUNT(*) as post_count,
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'positive') as positive_posts,
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'neutral') as neutral_posts,
                COUNT(*) FILTER (WHERE LOWER(post_sentiment_label) = 'negative') as negative_posts,
                AVG(post_sentiment_score) as avg_post_score
            FROM silver_reddit_posts sp
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            WHERE sp.global_keyword_id = $1
            AND post_sentiment_label IS NOT NULL
            AND (gk.start_date IS NULL OR DATE(sp.created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sp.created_at_utc) <= gk.end_date)
        `, [requestId]);

        // Fetch sentiment data from silver tables (comments)
        const commentsQuery = await pool.query(`
            SELECT 
                COUNT(*) as comment_count,
                COUNT(*) FILTER (WHERE LOWER(sc.comment_sentiment_label) = 'positive') as positive_comments,
                COUNT(*) FILTER (WHERE LOWER(sc.comment_sentiment_label) = 'neutral') as neutral_comments,
                COUNT(*) FILTER (WHERE LOWER(sc.comment_sentiment_label) = 'negative') as negative_comments,
                AVG(sc.comment_sentiment_score) as avg_comment_score
            FROM silver_reddit_comments sc
            JOIN silver_reddit_posts sp ON sc.silver_post_id = sp.silver_post_id
            JOIN global_keywords gk ON gk.global_keyword_id = sp.global_keyword_id
            WHERE sp.global_keyword_id = $1
            AND sc.comment_sentiment_label IS NOT NULL
            AND (gk.start_date IS NULL OR DATE(sc.created_at_utc) >= gk.start_date)
            AND (gk.end_date IS NULL OR DATE(sc.created_at_utc) <= gk.end_date)
        `, [requestId]);

        // Check if we have any sentiment data
        const totalPosts = parseInt(postsQuery.rows[0]?.post_count) || 0;
        const totalComments = parseInt(commentsQuery.rows[0]?.comment_count) || 0;

        if (totalPosts === 0 && totalComments === 0) {
            console.log(`[History] No sentiment data found for Request ID: ${requestId}, skipping history save`);
            return; // Don't save if no data exists yet
        }

        const posts = postsQuery.rows[0];
        const comments = commentsQuery.rows[0];

        // Calculate dominant sentiment across all content
        const totalPositive = (parseInt(posts.positive_posts) || 0) + (parseInt(comments.positive_comments) || 0);
        const totalNeutral = (parseInt(posts.neutral_posts) || 0) + (parseInt(comments.neutral_comments) || 0);
        const totalNegative = (parseInt(posts.negative_posts) || 0) + (parseInt(comments.negative_comments) || 0);

        let dominantSentiment = 'neutral';
        if (totalPositive >= totalNeutral && totalPositive >= totalNegative) {
            dominantSentiment = 'positive';
        } else if (totalNegative >= totalNeutral && totalNegative >= totalPositive) {
            dominantSentiment = 'negative';
        }

        // Insert into analysis_history
        await pool.query(`
            INSERT INTO analysis_history (
                user_id, keyword, start_date, end_date,
                total_posts, total_comments,
                dominant_sentiment, avg_post_sentiment_score, avg_comment_sentiment_score,
                request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (user_id, keyword, start_date, end_date) 
            DO UPDATE SET
                total_posts = EXCLUDED.total_posts,
                total_comments = EXCLUDED.total_comments,
                dominant_sentiment = EXCLUDED.dominant_sentiment,
                avg_post_sentiment_score = EXCLUDED.avg_post_sentiment_score,
                avg_comment_sentiment_score = EXCLUDED.avg_comment_sentiment_score,
                analysis_timestamp = CURRENT_TIMESTAMP
        `, [
            userId, keyword, startDate, endDate,
            totalPosts, totalComments,
            dominantSentiment,
            parseFloat(posts.avg_post_score) || null,
            parseFloat(comments.avg_comment_score) || null,
            requestId
        ]);

        console.log(`[History] Successfully saved analysis for Request ID: ${requestId} (${totalPosts} posts, ${totalComments} comments, dominant: ${dominantSentiment})`);

    } catch (error) {
        console.error('[History] Error saving to analysis_history:', error.message);
        console.error('[History] Stack:', error.stack);
        throw error;
    }
}


// NEW: Polling Route for React Hook
router.get('/status/id/:requestId', async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT status FROM global_keywords WHERE global_keyword_id = $1",
            [req.params.requestId] // Use ID instead of keyword
        );
        res.json({ status: result.rows[0]?.status || 'IDLE' });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch status" });
    }
});

router.post('/analyze', async (req, res) => {
    // 1. EXTRACT ALL REQUIRED DATA FROM BODY (including optional date filters)
    const { keyword, user_id, start_date, end_date } = req.body;

    if (!keyword || !user_id) {
        return res.status(400).json({ error: "Keyword and User ID are required" });
    }

    // Default to current date if no dates provided
    const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
    const finalStartDate = start_date || today;
    const finalEndDate = end_date || today;

    try {
        // 2. CHECK FOR DUPLICATE (keyword + dates combination)
        const duplicateCheck = await pool.query(
            `SELECT global_keyword_id, status FROM global_keywords 
             WHERE keyword = $1 AND user_id = $2 AND start_date = $3 AND end_date = $4`,
            [keyword, user_id, finalStartDate, finalEndDate]
        );

        if (duplicateCheck.rows.length > 0) {
            const existingRecord = duplicateCheck.rows[0];

            // If already processing, return busy status
            if (existingRecord.status === 'PROCESSING') {
                return res.status(202).json({
                    message: "Analysis already in progress...",
                    status: 'PROCESSING',
                    requestId: existingRecord.global_keyword_id,
                    trigger: false
                });
            }

            // If completed/failed, return existing results (don't re-run pipeline)
            return res.status(200).json({
                message: "Results already exist for this keyword and date range",
                status: existingRecord.status,
                requestId: existingRecord.global_keyword_id,
                trigger: false,
                cached: true
            });
        }

        // 3. NO DUPLICATE - Create new record and trigger pipeline
        const result = await pool.query(`
    INSERT INTO global_keywords (keyword, user_id, platform_id, status, bronze_processed, last_run_at, start_date, end_date)
    VALUES ($1, $2, 1, 'PROCESSING', FALSE, NOW(), $3, $4)
    RETURNING global_keyword_id
`, [keyword, user_id, finalStartDate, finalEndDate]);

        // 4. CAPTURE THE GENERATED ID
        const requestId = result.rows[0].global_keyword_id;

        // 5. RESPOND TO FRONTEND IMMEDIATELY
        res.status(202).json({
            message: "Analysis started",
            trigger: true,
            status: 'PROCESSING',
            requestId: requestId
        });

        const pythonExe = process.env.PYTHON_EXE_PATH || 'python';
        const pythonScript = process.env.PYTHON_SCRIPT_PATH;
        if (!pythonExe || !pythonScript) {
            console.error("CRITICAL: Environment variables for Python are missing!");
        }

        // 6. SPAWN ORCHESTRATOR (Variables now defined)
        const pythonProcess = spawn(pythonExe, [
            pythonScript,
            keyword,
            requestId.toString() // Ensure ID is passed as string to spawn
        ]);
        pythonProcess.stdout.on('data', (data) => console.log(`Python Output: ${data}`));
        pythonProcess.stderr.on('data', (data) => console.error(`Python Error: ${data}`));

        pythonProcess.on('close', async (code) => {
            console.log(`Pipeline (ID: ${requestId}) exited with code ${code}`);
            if (code !== 0) {
                await pool.query(
                    "UPDATE global_keywords SET status = 'FAILED' WHERE global_keyword_id = $1",
                    [requestId]
                );
            } else {
                // Pipeline succeeded - save results to analysis_history
                try {
                    await saveAnalysisToHistory(requestId, keyword, user_id, finalStartDate, finalEndDate);
                    console.log(`✅ Analysis results saved to history (ID: ${requestId})`);
                } catch (historyErr) {
                    console.error(`⚠️ Failed to save to history (ID: ${requestId}):`, historyErr.message);
                    // Don't fail the entire pipeline if history save fails
                }
            }
        });

    } catch (err) {
        console.error("PIPELINE ERROR:", err.message);
        res.status(500).json({ error: "Pipeline Trigger Failure" });
    }
});
export default router;