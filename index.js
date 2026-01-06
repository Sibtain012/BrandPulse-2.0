import express from 'express';
import cors from 'cors';
import pool, { getDBstatus } from './db.js';

// Route Imports
import authRouter from './routes/auth.js';
import pipelineRouter from './routes/pipeline.js'; // The Python Trigger logic
import dataRouter from './routes/data.js';         // The Gold Layer Data logic

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth', authRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/data', dataRouter);

// ==========================================
// SELF-HEALING MAINTENANCE (Interval)
// ==========================================
/**
 * Ruthless Optimization: Every 5 minutes, we reset keywords that 
 * have been stuck in 'PROCESSING' for more than 10 minutes. 
 * This prevents system deadlocks.
 */
setInterval(async () => {
    try {
        const query = `
            UPDATE global_keywords 
            SET status = 'FAILED' 
            WHERE status = 'PROCESSING' 
            AND last_run_at < NOW() - INTERVAL '10 minutes'
        `;
        const result = await pool.query(query);
        if (result.rowCount > 0) {
            console.log(`[MAINTENANCE] Healed ${result.rowCount} stuck processes.`);
        }
    } catch (err) {
        console.error("[MAINTENANCE_ERROR]:", err.message);
    }
}, 5 * 60 * 1000);

// ==========================================
// BASE ENDPOINT & HEALTH CHECK
// ==========================================
app.get('/', async (req, res) => {
    try {
        const dbStatus = await getDBstatus();
        res.json({
            message: 'Welcome to BrandPulse Elite API',
            system_status: 'ONLINE',
            dbStatus
        });
    } catch (error) {
        res.status(400).json({ message: 'Error fetching DB status', error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🚀 BRANDPULSE ENGINE RUNNING ON PORT ${PORT}`);
    console.log(`🔧 MAINTENANCE WORKER: ACTIVE`);
    console.log(`-----------------------------------------`);
});