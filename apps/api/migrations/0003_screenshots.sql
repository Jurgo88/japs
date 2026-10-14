-- Own screenshots in the hosted version (#33). Images live in R2 under <user_id>/<file>;
-- this table is the manifest the build and the editor read.
CREATE TABLE screenshots (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_key TEXT NOT NULL,
  viewport TEXT NOT NULL CHECK (viewport IN ('desktop', 'mobile')),
  file TEXT NOT NULL,
  url TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  PRIMARY KEY (user_id, project_key, viewport)
);
