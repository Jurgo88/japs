-- Cloudflare as a connected provider (ADR 0012). SQLite can't change a CHECK constraint, so the
-- table is rebuilt with the same columns and rows.
CREATE TABLE connections_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'netlify', 'cloudflare', 'llm')),
  account_login TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,                     -- GitHub App and Cloudflare OAuth tokens expire
  meta TEXT,                           -- JSON, e.g. LLM provider/model
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);
INSERT INTO connections_new (user_id, provider, account_login, access_token, refresh_token, expires_at, meta, created_at, updated_at)
  SELECT user_id, provider, account_login, access_token, refresh_token, expires_at, meta, created_at, updated_at FROM connections;
DROP TABLE connections;
ALTER TABLE connections_new RENAME TO connections;
