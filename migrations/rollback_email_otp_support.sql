-- Rollback: Remove Email OTP Support
-- Use this to rollback the add_email_otp_support.sql migration

BEGIN;

-- Drop indexes
DROP INDEX IF EXISTS idx_user_profiles_email_verified;
DROP INDEX IF EXISTS idx_user_profiles_registration_otp_expiry;
DROP INDEX IF EXISTS idx_user_profiles_otp_expiry;

-- Remove Email OTP columns
ALTER TABLE user_profiles
DROP COLUMN IF EXISTS registration_otp_code,
DROP COLUMN IF EXISTS registration_otp_expiry,
DROP COLUMN IF EXISTS registration_otp_attempts,
DROP COLUMN IF EXISTS otp_code,
DROP COLUMN IF EXISTS otp_expiry,
DROP COLUMN IF EXISTS otp_attempts,
DROP COLUMN IF EXISTS last_otp_sent_at,
DROP COLUMN IF EXISTS is_email_verified;

COMMIT;
