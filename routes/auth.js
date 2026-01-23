import express from 'express';
import { register, login, logout, forgotPassword, resetPassword, setup2FA, verify2FA, updateProfile, changePassword, verifyRegistration, resendRegistrationOTP, resendOTP } from '../controllers/authControllers.js';
import { verifyToken } from '../middleware/VerifyToken.js';
import { otpGenerationLimiter, otpVerificationLimiter, otpResendLimiter } from '../middleware/otpLimiter.js';
import pool from '../db.js';

const router = express.Router();

// Public Routes - Registration with Email Verification
router.post('/register', otpGenerationLimiter, register);  // Step 1: Send OTP (rate limited)
router.post('/verify-registration', otpVerificationLimiter, verifyRegistration);  // Step 2: Verify OTP & Activate
router.post('/resend-registration-otp', otpResendLimiter, resendRegistrationOTP);  // Resend registration OTP

// Public Routes - Login
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// 2FA Routes (Protected + Rate Limited)
router.post('/2fa/setup', verifyToken, otpGenerationLimiter, setup2FA);
router.post('/2fa/verify', verifyToken, otpVerificationLimiter, verify2FA);
router.post('/2fa/resend', verifyToken, otpResendLimiter, resendOTP); // Resend login OTP

// Profile Routes (Protected)
router.put('/profile', verifyToken, updateProfile);
router.put('/change-password', verifyToken, changePassword);

// Protected Route Example (To test Middleware)
router.get('/me', verifyToken, async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Fetch latest profile data
        const result = await pool.query(
            'SELECT full_name, email, subscription_tier, is_2fa_enabled FROM user_profiles p JOIN auth_identities a ON p.user_id = a.user_id WHERE p.user_id = $1 AND p.is_current = TRUE',
            [userId]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: "User not found" });

        res.json({
            user: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

export default router;