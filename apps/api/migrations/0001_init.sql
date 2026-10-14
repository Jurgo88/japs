-- Hosted JAPS (ADR 0009). Every user-owned row carries user_id; access goes through src/db.ts.

CREATE TABLE users (
  id TEXT PRIMARY KEY,                 -- random UUID
  github_id INTEGER NOT NULL UNIQUE,   -- stable across login renames
  github_login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT NOT NULL
);

-- Only the SHA-256 of the session token is stored: a database leak doesn't leak logins.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- Connected accounts and the user's own LLM key. Secrets are AES-GCM ciphertext ("v1:...").
CREATE TABLE connections (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'netlify', 'llm')),
  account_login TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,                     -- GitHub App user tokens expire (8 h)
  meta TEXT,                           -- JSON, e.g. LLM provider/model
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);

-- The same documents the CLI keeps in files, one row per user and kind, validated with @japs/schema.
CREATE TABLE documents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('config', 'projects', 'facts', 'analysis', 'screenshots', 'publish')),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, kind)
);

-- LLM usage on the shared key, per calendar month (quota, #35).
CREATE TABLE usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                 -- "2026-10"
  generations INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
