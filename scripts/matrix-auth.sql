CREATE SCHEMA IF NOT EXISTS matrix_auth;

CREATE TABLE IF NOT EXISTS matrix_auth.login_attempts (
    id text PRIMARY KEY,
    oauth_state_hash text UNIQUE,
    verifier text,
    approval_code_hash text NOT NULL,
    browser_hash text UNIQUE,
    phase text NOT NULL CHECK (phase IN ('WAITING', 'PROCESSING', 'APPROVAL', 'VERIFIED', 'DENIED', 'CANCELLED', 'FAILED')),
    discord_id text,
    wrong_codes smallint NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS matrix_attempt_expiry ON matrix_auth.login_attempts (expires_at);

CREATE TABLE IF NOT EXISTS matrix_auth.sessions (
    token_hash text PRIMARY KEY,
    discord_id text NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);
CREATE INDEX IF NOT EXISTS matrix_session_expiry ON matrix_auth.sessions (expires_at);

CREATE TABLE IF NOT EXISTS matrix_auth.start_limits (
    bucket bigint NOT NULL,
    subject text NOT NULL,
    used integer NOT NULL,
    PRIMARY KEY (bucket, subject)
);
