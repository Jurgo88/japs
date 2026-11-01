-- Visit statistics for published portfolios (ADR 0015).

-- The public key a portfolio sends its visits with. It is in the page, so it's no secret: it
-- only says whose statistics a visit counts toward.
CREATE TABLE analytics_sites (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

-- Daily counters only, never single visits: no IP address, no user agent, no visitor id.
-- `value` is empty for views and visits, otherwise the path, referring host or country.
CREATE TABLE analytics_daily (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                   -- YYYY-MM-DD, UTC
  dimension TEXT NOT NULL CHECK (dimension IN ('views', 'visits', 'page', 'referrer', 'country')),
  value TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, dimension, value)
);
CREATE INDEX analytics_daily_day ON analytics_daily (day);
