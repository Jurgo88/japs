-- Publishing from the hosted version (#34, ADR 0011): one row per publish. The theme is built
-- by GitHub Actions; the Worker keeps the Netlify token and forwards the files.
CREATE TABLE builds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('building', 'deploying', 'live', 'failed')),
  theme TEXT NOT NULL,
  draft INTEGER NOT NULL DEFAULT 0,
  site_id TEXT NOT NULL,
  site_url TEXT NOT NULL,
  -- The GitHub Actions run that took the build (first OIDC call); later calls must match.
  run_id TEXT,
  deploy_id TEXT,
  -- {path: sha1} of the built site, and the shas Netlify asked for.
  files TEXT,
  required TEXT,
  url TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX builds_user ON builds (user_id, created_at);
