-- Publishing to Cloudflare Pages too (ADR 0012): where a build goes, and the Cloudflare account.
ALTER TABLE builds ADD COLUMN target TEXT NOT NULL DEFAULT 'netlify' CHECK (target IN ('netlify', 'cloudflare'));
ALTER TABLE builds ADD COLUMN account_id TEXT;
