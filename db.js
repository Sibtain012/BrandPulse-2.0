import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

export default pool;

export const getDBstatus = async () => {
    try {
        const result = await pool.query('SELECT NOW()');

        return {
            message: 'Database connected',
            connected_db: process.env.DB_NAME,
            server_time: result.rows[0].now,
            time: result.rows[0].now,
        }

    } catch (error) {
        return { message: 'Database connection error', error: error.message };
    }
};