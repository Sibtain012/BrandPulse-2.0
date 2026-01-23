import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for OTP generation requests
 * Prevents spam and abuse of OTP email sending
 * Limit: 3 requests per 15 minutes per IP
 */
export const otpGenerationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 OTP requests per window
    message: 'Too many OTP requests from this IP. Please try again in 15 minutes.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests, even successful ones
});

/**
 * Rate limiter for OTP verification attempts
 * Prevents brute-force attacks on OTP codes
 * Limit: 5 attempts per 10 minutes per IP
 */
export const otpVerificationLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes (OTP lifetime)
    max: 5, // 5 verification attempts per window
    message: 'Too many verification attempts. Please request a new OTP.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Only count failed attempts
});

/**
 * Rate limiter for resend OTP requests
 * Prevents rapid resend spam
 * Limit: 5 resends per 15 minutes per IP
 */
export const otpResendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 resend requests per window
    message: 'Too many resend requests. Please wait before requesting another OTP.',
    standardHeaders: true,
    legacyHeaders: false,
});

export default {
    otpGenerationLimiter,
    otpVerificationLimiter,
    otpResendLimiter
};
