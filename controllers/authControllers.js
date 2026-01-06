import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import pool from '../db.js';
import sendEmail from '../utils/sendEmail.js';

// Helper: Audit Log
const logAudit = async (userId, action, details, ip) => {
    await pool.query(
        `INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
        [userId, action, details, ip]
    );
};

// 1. REGISTER
export const register = async (req, res) => {
    try {
        let { email, password, fullName } = req.body;

        if (!email || !password || !fullName) return res.status(400).json({ msg: "All fields required" });

        // Sanitization
        email = email.trim().toLowerCase();

        // Validation
        if (password.length < 8) return res.status(400).json({ msg: "Password must be 8+ chars" });

        // Check Duplicate
        const existing = await pool.query('SELECT * FROM auth_identities WHERE email = $1', [email]);
        if (existing.rows.length > 0) return res.status(400).json({ msg: "User already exists" });

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        // Insert Identity & Profile (Transaction)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const idRes = await client.query(
                'INSERT INTO auth_identities (email, password_hash) VALUES ($1, $2) RETURNING user_id',
                [email, hash]
            );
            const userId = idRes.rows[0].user_id;

            await client.query(
                'INSERT INTO user_profiles (user_id, full_name, is_current) VALUES ($1, $2, TRUE)',
                [userId, fullName]
            );

            await client.query('COMMIT');

            // Auto-Login Token
            const token = jwt.sign({ user_id: userId, role: 'FREE' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            logAudit(userId, 'REGISTER', 'New user registration', req.ip);
            res.json({ token, msg: "Registered successfully" });

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

        // Get Role & 2FA Status
        // NOTE: We added 'is_2fa_enabled' and 'two_fa_secret' to the query
        const profileRes = await pool.query('SELECT subscription_tier, is_2fa_enabled, two_fa_secret FROM user_profiles WHERE user_id = $1 AND is_current = TRUE', [user.user_id]);
        const profile = profileRes.rows[0];

        // ============================================================
        // START 2FA CHECK
        // ============================================================
        if (profile.is_2fa_enabled) {
            // 1. Check if user sent the 6-digit code
            if (!token) {
                // Return specific status so frontend knows to show the 2FA input box
                return res.status(200).json({ msg: "2FA Required", is2fa: true });
            }

            // 2. Verify the code using speakeasy
            const verified = speakeasy.totp.verify({
                secret: profile.two_fa_secret,
                encoding: 'base32',
                token: token
            });

            if (!verified) {
                logAudit(user.user_id, 'LOGIN_FAILED', 'Invalid 2FA Token', ip);
                return res.status(400).json({ msg: "Invalid 2FA Code" });
            }
        }
        // ============================================================
        // END 2FA CHECK
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

        if (userRes.rows.length === 0) return res.status(404).json({ msg: "User not found" });

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
            res.json({ msg: "Reset link sent to email" });
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

// 6. SETUP 2FA (Generate Secret & QR)
export const setup2FA = async (req, res) => {
    try {
        const userId = req.user.user_id; // Comes from verifyToken middleware

        // Generate a temporary secret
        const secret = speakeasy.generateSecret({ name: "BrandPulse App" });

        // Generate QR Code Image Data
        const qrImage = await qrcode.toDataURL(secret.otpauth_url);

        // Save secret to DB (but keep 2FA disabled until they verify!)
        await pool.query(
            'UPDATE user_profiles SET two_fa_secret = $1 WHERE user_id = $2 AND is_current = TRUE',
            [secret.base32, userId]
        );

        // Send QR code to frontend to display to user
        res.json({ secret: secret.base32, qrImage });

    } catch (err) {
        res.status(500).send("Server Error");
    }
};

// 7. VERIFY & ENABLE 2FA
export const verify2FA = async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user.user_id;

        // Get the secret from DB
        const profileRes = await pool.query('SELECT two_fa_secret FROM user_profiles WHERE user_id = $1 AND is_current = TRUE', [userId]);
        const secret = profileRes.rows[0].two_fa_secret;

        // Verify the token the user typed from their app
        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: token
        });

        if (!verified) return res.status(400).json({ msg: "Invalid Token" });

        // If valid, PERMANENTLY enable 2FA
        await pool.query('UPDATE user_profiles SET is_2fa_enabled = TRUE WHERE user_id = $1', [userId]);

        res.json({ msg: "2FA Enabled Successfully" });

    } catch (err) {
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


// I have to [Task Name]. Break this down into a checklist of micro-steps so small I cannot fail. Identify dependencies.