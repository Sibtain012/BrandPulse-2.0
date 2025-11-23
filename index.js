import express from 'express';
import cors from 'cors';
import router from './routes/auth.js';
import pool, { getDBstatus } from './db.js';
const app = express();

app.use(express.json());
app.use(cors());

// Routes
app.use('/api/auth', router);

const PORT = process.env.PORT || 5000;

app.get('/', async (req, res) => {
    try {
        const dbStatus = await getDBstatus();
        res.json({
            message: 'Welcome to BrandPulse API',
            dbStatus
        });
    } catch (error) {
        res.status(400).json({ message: 'Error fetching DB status', error: error.message });
    }
})
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjozLCJyb2xlIjoiRlJFRSIsImlhdCI6MTc2MzgyNzQxMywiZXhwIjoxNzYzODMxMDEzfQ.Fhe2PvmT1r4NUDjIpVTv8L59S4LyHF9Qh3V4DvYYQoM