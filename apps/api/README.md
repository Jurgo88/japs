# @japs/api

Hosted JAPS on Cloudflare Workers ([ADR 0009](../../docs/adr/0009-hosted-on-cloudflare.md)): GitHub sign-in, Netlify connect, per-user data in D1. The same Worker serves the dashboard (`apps/dashboard/dist` as static assets; only `/api/*` and `/auth/*` reach the Worker). Work in progress — see the "Phase 3 — Cloud" milestone.

## Local development

```bash
cd apps/api
cp .dev.vars.example .dev.vars        # fill in (see below); never commit .dev.vars
pnpm db:migrate:local                 # creates the local D1 database
pnpm dev                              # builds the dashboard, serves it + the API on http://localhost:8787
```

Tests run in Node against `node:sqlite` with the same migrations: `pnpm test` from the repo root.

## One-time setup (owner of the deployment)

### 1. GitHub App (sign-in + read-only repo access)

GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App:

- **Callback URL / Redirect URI:** `<APP_URL>/auth/github/callback`, plus `http://localhost:8787/auth/github/callback` for local development (a GitHub App accepts several)
- **Expire user authorization tokens:** on
- **Request user authorization (OAuth) during installation:** on
- **Webhook:** off
- **Repository permissions:** Contents: *Read-only*, Metadata: *Read-only*. Nothing else.
- **Account permissions:** none (email is not needed)

Copy the **Client ID** and generate a **client secret** → `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.

A GitHub App, not an OAuth App: OAuth Apps can only ask for `repo`, which includes write access to private repositories.

### 2. Netlify OAuth application (Connect Netlify)

Netlify → User settings → Applications → **OAuth applications** → New OAuth app:

- **Redirect URI:** `<APP_URL>/auth/netlify/callback`. Netlify allows one per app, so create a second app (`JAPS (local)`) with `http://localhost:8787/auth/netlify/callback` for development.

→ `NETLIFY_CLIENT_ID`, `NETLIFY_CLIENT_SECRET`.

### 3. Secrets

| Secret | Value |
|---|---|
| `SESSION_SECRET` | any long random string |
| `ENCRYPTION_KEY` | 32 random bytes, base64url: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `OPENAI_API_KEY` | shared LLM key for the free quota (#35) |

In production: `npx wrangler secret put <NAME>` for each. Losing `ENCRYPTION_KEY` makes stored tokens unreadable (users reconnect); leaking it exposes them — treat it like a password.

### 4. Database and deploy

```bash
npx wrangler d1 create japs                 # put the database_id into wrangler.jsonc
npx wrangler d1 migrations apply japs --remote
npx wrangler deploy                         # set APP_URL in wrangler.jsonc to the workers.dev URL first
```
