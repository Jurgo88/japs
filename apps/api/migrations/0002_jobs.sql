-- Background jobs (#32). Facts and analysis are stored per project, so a job step reads and
-- writes one small row instead of re-parsing a whole document (free plan: 10 ms CPU per step).

CREATE TABLE project_docs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('facts', 'analysis')),
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_key, kind)
);

-- One row per sync or generation run; per-project workflow instances count themselves done.
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sync', 'generate')),
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  total INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  -- JSON array of per-project problems ("key: message"), capped in code
  problems TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX jobs_user ON jobs(user_id, created_at);
