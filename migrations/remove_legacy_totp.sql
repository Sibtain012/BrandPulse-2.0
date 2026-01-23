-- Migration: Remove Legacy TOTP Column
-- This removes the two_fa_secret column used by speakeasy TOTP

BEGIN;

-- Remove legacy TOTP secret column
ALTER TABLE user_profiles
DROP COLUMN IF EXISTS two_fa_secret;

-- Update comment for is_2fa_enabled
COMMENT ON COLUMN user_profiles.is_2fa_enabled IS 'Whether user has Email OTP 2FA enabled (not TOTP)';

COMMIT;

-- Verification query
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'user_profiles'
AND column_name = 'two_fa_secret';
-- Should return 0 rows if successful
