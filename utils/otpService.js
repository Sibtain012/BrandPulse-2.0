import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * OTP Service for Email-based Authentication
 * Provides utilities for generating, hashing, and validating OTP codes
 */

/**
 * Generate a 6-digit numeric OTP code
 * @returns {string} 6-digit OTP code
 */
export function generateOTP() {
    // Generate cryptographically secure random 6-digit number
    const otp = crypto.randomInt(100000, 999999).toString();
    return otp;
}

/**
 * Hash an OTP code using bcrypt
 * @param {string} code - Plain OTP code to hash
 * @returns {Promise<string>} Hashed OTP code
 */
export async function hashOTP(code) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(code, salt);
    return hash;
}

/**
 * Verify an OTP code against its hash
 * @param {string} code - Plain OTP code to verify
 * @param {string} hash - Hashed OTP code from database
 * @returns {Promise<boolean>} True if OTP matches, false otherwise
 */
export async function verifyOTP(code, hash) {
    if (!code || !hash) return false;
    return await bcrypt.compare(code, hash);
}

/**
 * Check if an OTP has expired
 * @param {Date|string} expiry - OTP expiration timestamp
 * @returns {boolean} True if expired, false otherwise
 */
export function isOTPExpired(expiry) {
    if (!expiry) return true;
    const expiryDate = new Date(expiry);
    return expiryDate < new Date();
}

/**
 * Generate OTP expiration timestamp (1 minute from now)
 * @returns {Date} Expiration timestamp
 */
export function generateOTPExpiry() {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + 1); // 1-minute TTL
    return expiry;
}

/**
 * Mask an email address for privacy
 * Example: john.doe@example.com -> j***@example.com
 * @param {string} email - Email address to mask
 * @returns {string} Masked email address
 */
export function maskEmail(email) {
    if (!email || !email.includes('@')) return '***';

    const [localPart, domain] = email.split('@');
    const maskedLocal = localPart.length > 1
        ? localPart[0] + '***'
        : '***';

    return `${maskedLocal}@${domain}`;
}

/**
 * Check if user can request a new OTP (rate limiting)
 * @param {Date|string} lastOTPSentAt - Timestamp of last OTP sent
 * @param {number} cooldownSeconds - Cooldown period in seconds (default: 60)
 * @returns {boolean} True if user can request new OTP, false otherwise
 */
export function canRequestOTP(lastOTPSentAt, cooldownSeconds = 60) {
    if (!lastOTPSentAt) return true;

    const lastSent = new Date(lastOTPSentAt);
    const now = new Date();
    const diffSeconds = (now - lastSent) / 1000;

    return diffSeconds >= cooldownSeconds;
}

/**
 * Calculate when user can next request an OTP
 * @param {Date|string} lastOTPSentAt - Timestamp of last OTP sent
 * @param {number} cooldownSeconds - Cooldown period in seconds (default: 60)
 * @returns {Date|null} Next allowed request time, or null if can request now
 */
export function getNextOTPRequestTime(lastOTPSentAt, cooldownSeconds = 60) {
    if (!lastOTPSentAt) return null;

    const lastSent = new Date(lastOTPSentAt);
    const nextRequest = new Date(lastSent.getTime() + (cooldownSeconds * 1000));

    return nextRequest > new Date() ? nextRequest : null;
}

export default {
    generateOTP,
    hashOTP,
    verifyOTP,
    isOTPExpired,
    generateOTPExpiry,
    maskEmail,
    canRequestOTP,
    getNextOTPRequestTime
};
