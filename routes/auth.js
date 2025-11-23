import express from 'express';
import { register, login, logout, forgotPassword, resetPassword, setup2FA, verify2FA } from '../controllers/authControllers.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Public Routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/2fa/setup', verifyToken, setup2FA);
router.post('/2fa/verify', verifyToken, verify2FA);

// Protected Route Example (To test Middleware)
router.get('/me', verifyToken, (req, res) => {
    res.json({ user: req.user, msg: "You are authorized!" });
});

export default router;