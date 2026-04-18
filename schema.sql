-- Create tables for BrandPulse

CREATE TABLE public.auth_identities (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_until TIMESTAMP,
    failed_login_attempts INTEGER DEFAULT 0,
    password_changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.user_profiles (
    user_id INTEGER REFERENCES public.auth_identities(user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    is_current BOOLEAN DEFAULT TRUE,
    is_email_verified BOOLEAN DEFAULT FALSE,
    registration_otp_code VARCHAR(255),
    registration_otp_expiry TIMESTAMP,
    registration_otp_attempts INTEGER DEFAULT 0,
    subscription_tier VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, is_current)
);

CREATE TABLE public.user_sessions (
    session_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.auth_identities(user_id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.verification_tokens (
    token_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.auth_identities(user_id) ON DELETE CASCADE,
    token_type VARCHAR(50) NOT NULL,
    token_value VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES public.auth_identities(user_id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);