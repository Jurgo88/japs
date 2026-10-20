-- Portfolios on <handle>.japs.app (ADR 0013).

-- One address per user. handle_changed_at stays null until the user changes the first address,
-- so the first pick and one change are free; after that a change waits 30 days. The files are
-- in R2 (bucket japs-sites): <user id>/files/<sha1> and <user id>/deploys/<build id>.json.
CREATE TABLE hosted_sites (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  handle_changed_at TEXT,
  live_build TEXT,                     -- served at https://<handle>.japs.app
  draft_build TEXT,                    -- the latest draft, at https://<draft_key>--<handle>.japs.app
  draft_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Addresses given up by a rename or an account deletion. Nobody else can take one until
-- `until`; meanwhile it redirects to the user's current address, or says the portfolio is gone
-- (user_id null). No foreign key: a row outlives the account on purpose.
CREATE TABLE retired_handles (
  handle TEXT PRIMARY KEY,
  user_id TEXT,
  until TEXT NOT NULL
);
CREATE INDEX retired_handles_user ON retired_handles (user_id);

-- A third publish target. SQLite can't change a CHECK constraint, so builds is rebuilt with the
-- same columns; the running version keeps working while the new one deploys (deploy.yml).
CREATE TABLE builds_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('building', 'deploying', 'live', 'failed')),
  theme TEXT NOT NULL,
  draft INTEGER NOT NULL DEFAULT 0,
  site_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  run_id TEXT,
  deploy_id TEXT,
  files TEXT,
  required TEXT,
  url TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT 'netlify' CHECK (target IN ('netlify', 'cloudflare', 'japs')),
  account_id TEXT
);
INSERT INTO builds_new (id, user_id, status, theme, draft, site_id, site_url, run_id, deploy_id, files, required, url, message, created_at, updated_at, target, account_id)
  SELECT id, user_id, status, theme, draft, site_id, site_url, run_id, deploy_id, files, required, url, message, created_at, updated_at, target, account_id FROM builds;
DROP TABLE builds;
ALTER TABLE builds_new RENAME TO builds;
CREATE INDEX builds_user ON builds (user_id, created_at);
