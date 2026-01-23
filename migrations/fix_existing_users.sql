-- Migration: Fix existing users with legacy 2FA enabled
-- This script updates old users who had TOTP 2FA enabled to disable it
-- since we've migrated to Email OTP and they need to re-enable it

-- Disable 2FA for all existing users who had it enabled with the old TOTP system
-- They will need to re-enable 2FA using the new Email OTP system
UPDATE user_profiles
SET is_2fa_enabled = FALSE
WHERE is_2fa_enabled = TRUE
  AND (otp_code IS NULL OR otp_expiry IS NULL OR otp_attempts IS NULL);

-- Set default values for OTP columns if they are NULL
UPDATE user_profiles
SET 
    otp_attempts = COALESCE(otp_attempts, 0),
    registration_otp_attempts = COALESCE(registration_otp_attempts, 0),
    is_email_verified = COALESCE(is_email_verified, TRUE)  -- Assume old users are verified
WHERE is_current = TRUE;

-- Log the changes
SELECT 
    COUNT(*) as total_users,
    SUM(CASE WHEN is_2fa_enabled = TRUE THEN 1 ELSE 0 END) as users_with_2fa,
    SUM(CASE WHEN is_email_verified = TRUE THEN 1 ELSE 0 END) as verified_users
FROM user_profiles
WHERE is_current = TRUE;
