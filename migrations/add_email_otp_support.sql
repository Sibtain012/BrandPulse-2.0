-- Migration: Add Email OTP Support to user_profiles
-- This adds columns for both registration verification and login 2FA using Email OTP

BEGIN;

-- Registration verification columns
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS registration_otp_code VARCHAR(255),
ADD COLUMN IF NOT EXISTS registration_otp_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS registration_otp_attempts INTEGER DEFAULT 0;

-- Login 2FA columns (Email OTP)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS otp_code VARCHAR(255),
ADD COLUMN IF NOT EXISTS otp_expiry TIMESTAMP,
ADD COLUMN IF NOT EXISTS otp_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_otp_sent_at TIMESTAMP;

-- Email verification flag (if not exists)
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE;

-- Update existing users to have verified emails
UPDATE user_profiles 
SET is_email_verified = TRUE 
WHERE is_email_verified IS NULL OR is_email_verified = FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email_verified ON user_profiles(is_email_verified);
CREATE INDEX IF NOT EXISTS idx_user_profiles_registration_otp_expiry ON user_profiles(registration_otp_expiry);
CREATE INDEX IF NOT EXISTS idx_user_profiles_otp_expiry ON user_profiles(otp_expiry);

-- Add comments for documentation
COMMENT ON COLUMN user_profiles.registration_otp_code IS 'Hashed OTP for email verification during registration (1-minute TTL)';
COMMENT ON COLUMN user_profiles.registration_otp_expiry IS 'Expiration timestamp for registration OTP';
COMMENT ON COLUMN user_profiles.registration_otp_attempts IS 'Number of failed registration OTP verification attempts (max 5)';
COMMENT ON COLUMN user_profiles.otp_code IS 'Hashed OTP for Email 2FA during login (1-minute TTL)';
COMMENT ON COLUMN user_profiles.otp_expiry IS 'Expiration timestamp for login 2FA OTP';
COMMENT ON COLUMN user_profiles.otp_attempts IS 'Number of failed login 2FA OTP verification attempts (max 5)';
COMMENT ON COLUMN user_profiles.last_otp_sent_at IS 'Timestamp of last OTP sent (for rate limiting)';
COMMENT ON COLUMN user_profiles.is_email_verified IS 'Whether user has verified their email address';

COMMIT;

-- Verification query
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name IN ('registration_otp_code', 'registration_otp_expiry', 'registration_otp_attempts',
                    'otp_code', 'otp_expiry', 'otp_attempts', 'last_otp_sent_at', 'is_email_verified')
ORDER BY column_name;
