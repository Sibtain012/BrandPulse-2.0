import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db.js';
import sendEmail, { sendOTPEmail } from '../utils/sendEmail.js';
import { generateOTP, hashOTP, verifyOTP, isOTPExpired, generateOTPExpiry, maskEmail, canRequestOTP, getNextOTPRequestTime } from '../utils/otpService.js';

// Helper: Audit Log
const logAudit = async (userId, action, details, ip) => {
    await pool.query(
        `INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
        [userId, action, details, ip]
    );
};

// 1. REGISTER (Step 1: Create user and send OTP for email verification)
export const register = async (req, res) => {
    try {
        let { email, password, fullName } = req.body;

        if (!email || !password || !fullName) return res.status(400).json({ msg: "All fields required" });

        // Sanitization
        email = email.trim().toLowerCase();
        fullName = fullName.trim();

        // Validation
        if (password.length < 8) return res.status(400).json({ msg: "Password must be 8+ chars" });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ msg: "Invalid email format" });
        if (fullName.length > 255) return res.status(400).json({ msg: "Name too long (max 255 characters)" });
        if (email.length > 255) return res.status(400).json({ msg: "Email too long (max 255 characters)" });

        // Check Duplicate
        const existing = await pool.query('SELECT * FROM auth_identities WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ msg: "Email already registered" });

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Generate OTP for email verification
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);
        const otpExpiry = generateOTPExpiry();

        // Create user account (unverified)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const idRes = await client.query(
                'INSERT INTO auth_identities (email, password_hash) VALUES ($1, $2) RETURNING user_id',
                [email, hash]
            );
            const userId = idRes.rows[0].user_id;

            // USES: registration_otp_code, registration_otp_expiry, registration_otp_attempts, is_email_verified
            await client.query(
                `INSERT INTO user_profiles 
                (user_id, full_name, is_current, is_email_verified, registration_otp_code, registration_otp_expiry, registration_otp_attempts) 
                VALUES ($1, $2, TRUE, FALSE, $3, $4, 0)`,
                [userId, fullName, otpHash, otpExpiry]
            );

            await client.query('COMMIT');

            // Send OTP email
            try {
                await sendOTPEmail(email, otp, fullName);
                logAudit(userId, 'REGISTER_PENDING', 'User registered, awaiting email verification', req.ip);

                res.json({
                    msg: "Verification code sent to your email",
                    email: maskEmail(email),
                    requiresVerification: true
                });
            } catch (emailError) {
                console.error('[EMAIL ERROR]:', emailError);
                // For development, return OTP in response
                logAudit(userId, 'REGISTER_PENDING', 'User registered, email failed, OTP in response', req.ip);

                res.json({
                    msg: "Email failed, but account created. Use this OTP to verify",
                    otp: otp, // For development only
                    email: maskEmail(email),
                    requiresVerification: true
                });
            }

        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 1b. VERIFY REGISTRATION (Step 2: Verify OTP and activate account)
export const verifyRegistration = async (req, res) => {
    try {
        let { email, otp } = req.body;

        if (!email || !otp) return res.status(400).json({ msg: "Email and OTP required" });

        email = email.trim().toLowerCase();

        // Get unverified user - USES: is_email_verified, registration_otp_code, registration_otp_expiry, registration_otp_attempts
        const userRes = await pool.query(
            `SELECT ai.user_id, ai.email, up.full_name, up.is_email_verified, up.registration_otp_code, up.registration_otp_expiry, up.registration_otp_attempts
             FROM auth_identities ai
             JOIN user_profiles up ON ai.user_id = up.user_id
             WHERE ai.email = $1 AND up.is_current = TRUE`,
            [email]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ msg: "No account found with this email." });
        }

        const user = userRes.rows[0];

        // Check if already verified
        if (user.is_email_verified) {
            return res.status(400).json({ msg: "Email already verified. Please login." });
        }

        // Check if OTP exists
        if (!user.registration_otp_code) {
            return res.status(400).json({ msg: "No verification code found. Please request a new one." });
        }

        // Check if OTP has expired
        if (isOTPExpired(user.registration_otp_expiry)) {
            return res.status(400).json({ msg: "Verification code has expired. Please request a new one." });
        }

        // Check if too many attempts
        if (user.registration_otp_attempts >= 5) {
            // Clear OTP to force new request
            await pool.query(
                `UPDATE user_profiles 
                 SET registration_otp_code = NULL, registration_otp_expiry = NULL, registration_otp_attempts = 0 
                 WHERE user_id = $1`,
                [user.user_id]
            );
            return res.status(400).json({ msg: "Too many failed attempts. Please request a new code." });
        }

        // Verify OTP
        const isValidOTP = await verifyOTP(otp, user.registration_otp_code);

        if (!isValidOTP) {
            // Increment failed attempts
            await pool.query(
                'UPDATE user_profiles SET registration_otp_attempts = registration_otp_attempts + 1 WHERE user_id = $1',
                [user.user_id]
            );
            return res.status(400).json({ msg: "Invalid verification code" });
        }

        // OTP is valid - activate account and clear OTP fields
        await pool.query(
            `UPDATE user_profiles 
             SET is_email_verified = TRUE, registration_otp_code = NULL, registration_otp_expiry = NULL, registration_otp_attempts = 0 
             WHERE user_id = $1`,
            [user.user_id]
        );

        // Auto-Login Token
        const token = jwt.sign({ user_id: user.user_id, role: 'FREE' }, process.env.JWT_SECRET, { expiresIn: '1h' });

        logAudit(user.user_id, 'EMAIL_VERIFIED', 'Email verified successfully', req.ip);

        res.json({
            token,
            msg: "Email verified successfully! Welcome to BrandPulse."
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 1c. RESEND REGISTRATION OTP
export const resendRegistrationOTP = async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) return res.status(400).json({ msg: "Email required" });

        email = email.trim().toLowerCase();

        // Get unverified user
        const userRes = await pool.query(
            `SELECT ai.user_id, ai.email, up.full_name, up.is_email_verified
             FROM auth_identities ai
             JOIN user_profiles up ON ai.user_id = up.user_id
             WHERE ai.email = $1 AND up.is_current = TRUE`,
            [email]
        );

        if (userRes.rows.length === 0) {
            return res.status(400).json({ msg: "No account found with this email." });
        }

        const user = userRes.rows[0];

        // Check if already verified
        if (user.is_email_verified) {
            return res.status(400).json({ msg: "Email already verified. Please login." });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);
        const otpExpiry = generateOTPExpiry();

        // Update OTP in user_profiles - USES: registration_otp_code, registration_otp_expiry, registration_otp_attempts
        await pool.query(
            `UPDATE user_profiles 
             SET registration_otp_code = $1, registration_otp_expiry = $2, registration_otp_attempts = 0 
             WHERE user_id = $3`,
            [otpHash, otpExpiry, user.user_id]
        );

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, user.full_name);
        } catch (emailError) {
            console.error('[EMAIL ERROR]:', emailError);
            return res.status(500).json({ msg: "Failed to send verification email. Please try again." });
        }

        logAudit(user.user_id, 'REGISTRATION_OTP_RESENT', 'Registration OTP resent', req.ip);

        res.json({
            msg: "Verification code resent to your email",
            email: maskEmail(email)
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 2. LOGIN
export const login = async (req, res) => {
    try {
        const { email, password, token } = req.body; // Added 'token' for 2FA code
        const ip = req.ip;

        const userRes = await pool.query('SELECT * FROM auth_identities WHERE email = $1', [email]);
        if (userRes.rows.length === 0) return res.status(400).json({ msg: "Invalid Credentials" });

        const user = userRes.rows[0];

        // Check Lockout
        if (user.is_locked && new Date() < new Date(user.locked_until)) {
            return res.status(403).json({ msg: "Account locked. Try again later." });
        }

        // Check Password
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            // Increment Failures
            const newCount = user.failed_login_attempts + 1;
            let updateQuery = 'UPDATE auth_identities SET failed_login_attempts = $1 WHERE user_id = $2';
            let params = [newCount, user.user_id];

            if (newCount >= 5) {
                updateQuery = 'UPDATE auth_identities SET failed_login_attempts = $1, is_locked = TRUE, locked_until = NOW() + INTERVAL \'15 minutes\' WHERE user_id = $2';
            }

            await pool.query(updateQuery, params);
            logAudit(user.user_id, 'LOGIN_FAILED', `Failed attempt ${newCount}`, ip);
            return res.status(400).json({ msg: "Invalid Credentials" });
        }

        // Login Success: Reset counters
        await pool.query('UPDATE auth_identities SET failed_login_attempts = 0, is_locked = FALSE WHERE user_id = $1', [user.user_id]);

        // Get Role, 2FA Status, and Email Verification - USES: is_email_verified, is_2fa_enabled
        const profileRes = await pool.query(
            'SELECT subscription_tier, is_2fa_enabled, is_email_verified, full_name FROM user_profiles WHERE user_id = $1 AND is_current = TRUE',
            [user.user_id]
        );
        const profile = profileRes.rows[0];

        // ============================================================
        // CHECK EMAIL VERIFICATION
        // ============================================================
        if (!profile.is_email_verified) {
            logAudit(user.user_id, 'LOGIN_BLOCKED', 'Email not verified', ip);
            return res.status(403).json({
                msg: "Please verify your email before logging in. Check your inbox for the verification code.",
                requiresVerification: true,
                email: maskEmail(email)
            });
        }

        // ============================================================
        // START EMAIL OTP 2FA CHECK
        // ============================================================
        if (profile.is_2fa_enabled) {
            // 1. Check if user sent the 6-digit OTP code
            if (!token) {
                // Generate and send OTP via email
                const otp = generateOTP();
                const otpHash = await hashOTP(otp);
                const otpExpiry = generateOTPExpiry();

                // Store OTP in database - USES: otp_code, otp_expiry, otp_attempts, last_otp_sent_at
                await pool.query(
                    'UPDATE user_profiles SET otp_code = $1, otp_expiry = $2, otp_attempts = 0, last_otp_sent_at = NOW() WHERE user_id = $3 AND is_current = TRUE',
                    [otpHash, otpExpiry, user.user_id]
                );

                // Send OTP email
                try {
                    await sendOTPEmail(email, otp, profile.full_name);
                    logAudit(user.user_id, 'OTP_SENT', 'Login OTP sent via email', ip);
                } catch (emailError) {
                    console.error('[EMAIL ERROR]:', emailError);
                    return res.status(500).json({ msg: "Failed to send OTP email. Please try again." });
                }

                // Return specific status so frontend knows to show the OTP input box
                return res.status(200).json({
                    msg: "2FA Required",
                    is2fa: true,
                    email: maskEmail(email)
                });
            }

            // 2. Verify the OTP code - USES: otp_code, otp_expiry, otp_attempts
            const otpData = await pool.query(
                'SELECT otp_code, otp_expiry, otp_attempts FROM user_profiles WHERE user_id = $1 AND is_current = TRUE',
                [user.user_id]
            );

            if (!otpData.rows[0] || !otpData.rows[0].otp_code) {
                logAudit(user.user_id, 'LOGIN_FAILED', 'No OTP found', ip);
                return res.status(400).json({ msg: "No OTP found. Please request a new one." });
            }

            const { otp_code: storedOTPHash, otp_expiry, otp_attempts } = otpData.rows[0];

            // Check if OTP has expired
            if (isOTPExpired(otp_expiry)) {
                logAudit(user.user_id, 'LOGIN_FAILED', 'Expired OTP', ip);
                return res.status(400).json({ msg: "OTP has expired. Please request a new one." });
            }

            // Check if too many attempts
            if (otp_attempts >= 5) {
                logAudit(user.user_id, 'LOGIN_FAILED', 'Too many OTP attempts', ip);
                // Invalidate OTP
                await pool.query(
                    'UPDATE user_profiles SET otp_code = NULL, otp_expiry = NULL WHERE user_id = $1',
                    [user.user_id]
                );
                return res.status(400).json({ msg: "Too many failed attempts. Please request a new OTP." });
            }

            // Verify OTP
            const isValidOTP = await verifyOTP(token, storedOTPHash);

            if (!isValidOTP) {
                // Increment failed attempts
                await pool.query(
                    'UPDATE user_profiles SET otp_attempts = otp_attempts + 1 WHERE user_id = $1',
                    [user.user_id]
                );
                logAudit(user.user_id, 'LOGIN_FAILED', `Invalid OTP (attempt ${otp_attempts + 1})`, ip);
                return res.status(400).json({ msg: "Invalid OTP code" });
            }

            // OTP is valid - clear it from database
            await pool.query(
                'UPDATE user_profiles SET otp_code = NULL, otp_expiry = NULL, otp_attempts = 0 WHERE user_id = $1',
                [user.user_id]
            );
            logAudit(user.user_id, 'OTP_VERIFIED', 'OTP verified successfully', ip);
        }
        // ============================================================
        // END EMAIL OTP 2FA CHECK
        // ============================================================

        // Create Session
        const refreshTokenRaw = crypto.randomBytes(40).toString('hex');
        const refreshTokenHash = crypto.createHash('sha256').update(refreshTokenRaw).digest('hex');

        await pool.query(
            'INSERT INTO user_sessions (user_id, refresh_token_hash, device_info, ip_address, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'7 days\')',
            [user.user_id, refreshTokenHash, req.headers['user-agent'], ip]
        );

        const accessToken = jwt.sign({ user_id: user.user_id, role: profile.subscription_tier }, process.env.JWT_SECRET, { expiresIn: '1h' });

        logAudit(user.user_id, 'LOGIN_SUCCESS', 'Successful login', ip);
        res.json({ accessToken, refreshToken: refreshTokenRaw });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 3. LOGOUT
export const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ msg: "Token required" });

        // Hash incoming token to match DB
        const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

        await pool.query('UPDATE user_sessions SET is_revoked = TRUE WHERE refresh_token_hash = $1', [hash]);
        res.json({ msg: "Logged out" });
    } catch (err) {
        res.status(500).send("Server Error");
    }
};

// 4. FORGOT PASSWORD
export const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const userRes = await pool.query('SELECT user_id FROM auth_identities WHERE email = $1', [email]);

        // Prevent user enumeration: always return success message
        if (userRes.rows.length === 0) {
            // Still return success to prevent email enumeration
            return res.json({ msg: "If an account exists for this email, you will receive a reset link" });
        }

        const userId = userRes.rows[0].user_id;

        await pool.query(
            "DELETE FROM verification_tokens WHERE user_id = $1 AND type = 'PASSWORD_RESET'",
            [userId]
        );

        // Generate Token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = await bcrypt.hash(resetToken, 10);

        // Save to DB
        await pool.query(
            'INSERT INTO verification_tokens (user_id, token_hash, type, expires_at) VALUES ($1, $2, \'PASSWORD_RESET\', NOW() + INTERVAL \'1 hour\')',
            [userId, tokenHash]
        );

        const resetUrl = `http://localhost:5173/reset-password?token=${resetToken}&id=${userId}`;

        const message = `
            <h1>You have requested a password reset</h1>
            <p>Please go to this link to reset your password:</p>
            <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
            <p><b>This link expires in 1 hour.</b></p>
        `;

        try {
            await sendEmail({
                to: email,
                subject: "BrandPulse - Password Reset Request",
                html: message
            });
            res.json({ msg: "If an account exists for this email, you will receive a reset link" });
        } catch (emailError) {
            await pool.query('DELETE FROM verification_tokens WHERE token_hash = $1', [tokenHash]);
            console.error("Email Send Failed:", emailError);
            return res.status(500).json({ msg: "Email could not be sent" });
        }

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 5. RESET PASSWORD (Updated with "Same Password" Check)
export const resetPassword = async (req, res) => {
    try {
        const { userId, token, newPassword } = req.body;

        // --- 1. VALIDATION ---
        if (!userId || !token || !newPassword) {
            return res.status(400).json({ msg: "Invalid request data" });
        }

        // Enforce minimum length
        if (newPassword.length < 8) {
            return res.status(400).json({ msg: "Password must be at least 8 characters" });
        }

        // --- 2. FIND TOKEN ---
        const tokenRes = await pool.query(
            `SELECT * FROM verification_tokens 
             WHERE user_id = $1 
             AND type = 'PASSWORD_RESET' 
             AND expires_at > NOW()`,
            [userId]
        );

        if (tokenRes.rows.length === 0) {
            return res.status(400).json({ msg: "Invalid or expired reset link" });
        }

        // --- 3. NEW CHECK: PREVENT SAME PASSWORD ---
        // Fetch the user's current password hash
        const userRes = await pool.query('SELECT password_hash FROM auth_identities WHERE user_id = $1', [userId]);

        if (userRes.rows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        const currentHash = userRes.rows[0].password_hash;

        // Compare new password against the old hash
        const isSameAsOld = await bcrypt.compare(newPassword, currentHash);

        if (isSameAsOld) {
            return res.status(400).json({ msg: "New password cannot be the same as your old password" });
        }
        // -------------------------------------------

        // --- 4. VERIFY TOKEN MATCH ---
        const dbTokenHash = tokenRes.rows[0].token_hash;
        const isMatch = await bcrypt.compare(token, dbTokenHash);

        if (!isMatch) return res.status(400).json({ msg: "Invalid token" });

        // --- 5. UPDATE PASSWORD ---
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await pool.query(
            'UPDATE auth_identities SET password_hash = $1, password_changed_at = NOW(), is_locked = FALSE, failed_login_attempts = 0 WHERE user_id = $2',
            [hash, userId]
        );

        // --- 6. CLEANUP (Revoke Token) ---
        await pool.query('DELETE FROM verification_tokens WHERE token_id = $1', [tokenRes.rows[0].token_id]);

        // Audit Log
        logAudit(userId, 'PASSWORD_RESET', 'Password changed successfully', req.ip);

        res.json({ msg: "Password updated successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 6. SETUP 2FA (Send OTP via Email)
export const setup2FA = async (req, res) => {
    try {
        const userId = req.user.user_id; // Comes from verifyToken middleware

        // Get user email and name
        const userRes = await pool.query(
            'SELECT ai.email, up.full_name FROM auth_identities ai JOIN user_profiles up ON ai.user_id = up.user_id WHERE ai.user_id = $1 AND up.is_current = TRUE',
            [userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        const { email, full_name } = userRes.rows[0];

        // Generate OTP
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);
        const otpExpiry = generateOTPExpiry();

        // Store OTP in database - USES: otp_code, otp_expiry, otp_attempts, last_otp_sent_at
        await pool.query(
            'UPDATE user_profiles SET otp_code = $1, otp_expiry = $2, otp_attempts = 0, last_otp_sent_at = NOW() WHERE user_id = $3 AND is_current = TRUE',
            [otpHash, otpExpiry, userId]
        );

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, full_name);
            logAudit(userId, 'OTP_SENT', '2FA setup OTP sent via email', req.ip);
        } catch (emailError) {
            console.error('[EMAIL ERROR]:', emailError);
            return res.status(500).json({ msg: "Failed to send OTP email. Please try again." });
        }

        res.json({
            msg: "OTP sent to your email",
            email: maskEmail(email)
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 7. VERIFY & ENABLE 2FA (Email OTP)
export const verify2FA = async (req, res) => {
    try {
        const { otp } = req.body;
        const userId = req.user.user_id;

        if (!otp) {
            return res.status(400).json({ msg: "OTP code is required" });
        }

        // Get OTP data from DB - USES: otp_code, otp_expiry, otp_attempts
        const otpData = await pool.query(
            'SELECT otp_code, otp_expiry, otp_attempts FROM user_profiles WHERE user_id = $1 AND is_current = TRUE',
            [userId]
        );

        if (!otpData.rows[0] || !otpData.rows[0].otp_code) {
            return res.status(400).json({ msg: "No OTP found. Please request a new one." });
        }

        const { otp_code: storedOTPHash, otp_expiry, otp_attempts } = otpData.rows[0];

        // Check if OTP has expired
        if (isOTPExpired(otp_expiry)) {
            logAudit(userId, '2FA_SETUP_FAILED', 'Expired OTP', req.ip);
            return res.status(400).json({ msg: "OTP has expired. Please request a new one." });
        }

        // Check if too many attempts
        if (otp_attempts >= 5) {
            logAudit(userId, '2FA_SETUP_FAILED', 'Too many OTP attempts', req.ip);
            await pool.query(
                'UPDATE user_profiles SET otp_code = NULL, otp_expiry = NULL WHERE user_id = $1',
                [userId]
            );
            return res.status(400).json({ msg: "Too many failed attempts. Please request a new OTP." });
        }

        // Verify OTP
        const isValidOTP = await verifyOTP(otp, storedOTPHash);

        if (!isValidOTP) {
            // Increment failed attempts
            await pool.query(
                'UPDATE user_profiles SET otp_attempts = otp_attempts + 1 WHERE user_id = $1',
                [userId]
            );
            logAudit(userId, '2FA_SETUP_FAILED', `Invalid OTP (attempt ${otp_attempts + 1})`, req.ip);
            return res.status(400).json({ msg: "Invalid OTP code" });
        }

        // OTP is valid - enable 2FA and clear OTP
        await pool.query(
            'UPDATE user_profiles SET is_2fa_enabled = TRUE, is_email_verified = TRUE, otp_code = NULL, otp_expiry = NULL, otp_attempts = 0 WHERE user_id = $1',
            [userId]
        );

        logAudit(userId, '2FA_ENABLED', 'Email 2FA enabled successfully', req.ip);
        res.json({ msg: "2FA Enabled Successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 8. UPDATE PROFILE (Name only for now)
export const updateProfile = async (req, res) => {
    try {
        const { fullName } = req.body;
        const userId = req.user.user_id;

        if (!fullName) return res.status(400).json({ msg: "Name is required" });

        // Update the profile
        await pool.query(
            'UPDATE user_profiles SET full_name = $1 WHERE user_id = $2 AND is_current = TRUE',
            [fullName, userId]
        );

        res.json({ msg: "Profile updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};

// 9. CHANGE PASSWORD (Logged In Mode)
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.user_id;

        // === NEW CHECK: Prevent Same Password ===
        if (currentPassword === newPassword) {
            return res.status(400).json({ msg: "New password cannot be the same as the current password" });
        }

        // 1. Get current hash
        const userRes = await pool.query('SELECT password_hash FROM auth_identities WHERE user_id = $1', [userId]);
        const currentHash = userRes.rows[0].password_hash;

        // 2. Verify Old Password
        const isMatch = await bcrypt.compare(currentPassword, currentHash);
        if (!isMatch) return res.status(400).json({ msg: "Incorrect current password" });

        // 3. Validate New Password
        if (newPassword.length < 8) return res.status(400).json({ msg: "New password must be 8+ chars" });

        // 4. Hash & Update
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(newPassword, salt);

        await pool.query(
            'UPDATE auth_identities SET password_hash = $1, password_changed_at = NOW() WHERE user_id = $2',
            [hash, userId]
        );

        // Optional: Log Audit
        await pool.query(`INSERT INTO audit_logs (user_id, action, ip_address) VALUES ($1, 'PASSWORD_CHANGE', $2)`, [userId, req.ip]);

        res.json({ msg: "Password changed successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};


// I have to [Task Name]. Break this down into a checklist of micro-steps so small I cannot fail. Identify dependencies.// 8. RESEND OTP (For Login 2FA)
export const resendOTP = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Get user data
        const userRes = await pool.query(
            'SELECT ai.email, up.full_name, up.last_otp_sent_at FROM auth_identities ai JOIN user_profiles up ON ai.user_id = up.user_id WHERE ai.user_id = $1 AND up.is_current = TRUE',
            [userId]
        );

        if (userRes.rows.length === 0) {
            return res.status(404).json({ msg: "User not found" });
        }

        const { email, full_name, last_otp_sent_at } = userRes.rows[0];

        // Check rate limiting (60-second cooldown) - USES: last_otp_sent_at
        if (!canRequestOTP(last_otp_sent_at, 60)) {
            const nextRequestTime = getNextOTPRequestTime(last_otp_sent_at, 60);
            return res.status(429).json({
                msg: "Please wait before requesting another OTP",
                canResendAt: nextRequestTime
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        const otpHash = await hashOTP(otp);
        const otpExpiry = generateOTPExpiry();

        // Update OTP in database - USES: otp_code, otp_expiry, otp_attempts, last_otp_sent_at
        await pool.query(
            'UPDATE user_profiles SET otp_code = $1, otp_expiry = $2, otp_attempts = 0, last_otp_sent_at = NOW() WHERE user_id = $3 AND is_current = TRUE',
            [otpHash, otpExpiry, userId]
        );

        // Send OTP email
        try {
            await sendOTPEmail(email, otp, full_name);
            logAudit(userId, 'OTP_RESENT', 'OTP resent via email', req.ip);
        } catch (emailError) {
            console.error('[EMAIL ERROR]:', emailError);
            return res.status(500).json({ msg: "Failed to send OTP email. Please try again." });
        }

        res.json({
            msg: "OTP resent to your email",
            email: maskEmail(email),
            canResendAt: new Date(Date.now() + 60000) // 60 seconds from now
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
};
