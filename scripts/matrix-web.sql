CREATE SCHEMA IF NOT EXISTS matrix_web;

CREATE TABLE IF NOT EXISTS matrix_web.sessions (
    token_hash text PRIMARY KEY,
    origin text NOT NULL,
    discord_id text NOT NULL,
    display_name text NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS matrix_web_session_expiry ON matrix_web.sessions (expires_at);
