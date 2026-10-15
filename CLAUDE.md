# CLAUDE.md

Context for Claude Code working in this repository.

## What this is

**JAPS — Just Another Portfolio Site.** Connects to a developer's Netlify and GitHub accounts, discovers deployed sites and repositories, pairs them into projects, analyzes them, and generates a static portfolio (Astro) that can be published to Netlify.

Owner: Juraj Paluš (GitHub `Jurgo88`). **Communicate with Juraj in Slovak.** Code, identifiers, commit messages and code comments in English. Docs under `docs/` are in Slovak; `README.md` is in English (public-facing).

## Where to look first

- `docs/kickoff.md` — goals, scope, phases, Phase 0 results
- `docs/spec/` — discovery, data model, `portfolio.json` contract, AI pipeline
- `docs/adr/` — architecture decisions (read before changing structure)

## Current phase

**Phase 1 — Core.** Discovery + pairing → `projects.json`, facts → `facts.json`. LLM copy → `analysis.json` → `japs build` → `out/portfolio.json` → `apps/theme-default`. Grounding (#11) and Playwright screenshots (#12) done. Next: Netlify deploy of the theme (Phase 2).

## Layout

```
packages/schema   Zod types (ProjectsFile, Portfolio, ProjectFacts). No deps besides zod.
packages/core     discovery (Netlify, GitHub), pairing, filters, fact extraction. Uses only fetch.
packages/cli      `japs` command (pnpm japs discover)
packages/theme-kit  optional theme helpers: load portfolio.json, locales, UI strings, Astro config, sample (ADR 0010)
apps/theme-<id>     Astro themes, read only out/portfolio.json; chosen by `theme` in japs.config.json (ADR 0010)
apps/dashboard      Vue 3 editor served by `japs edit`; data via EditorBackend (local now, cloud API next)
apps/api            hosted JAPS: Cloudflare Worker (Hono) + D1, GitHub App sign-in, Netlify OAuth (ADR 0009)
```

## Commands

```bash
pnpm install
pnpm test            # vitest, all packages
pnpm typecheck       # tsc --noEmit, all packages
pnpm japs init --locales en,sk   # creates japs.config.json (never overwrites)
pnpm japs discover   # needs NETLIFY_TOKEN and GITHUB_TOKEN in .env; reads japs.config.json
pnpm japs facts      # projects.json -> facts.json (no LLM; repo facts cached by pushedAt)
pnpm japs analyze    # facts.json -> analysis.json via LLM (JAPS_LLM_* / OPENAI_API_KEY in .env, ADR 0006)
pnpm japs screenshots  # Playwright desktop+mobile shots -> screenshots/ (once: pnpm --filter @japs/cli exec playwright install chromium)
pnpm japs build      # -> out/portfolio.json + out/screenshots (needs profile in japs.config.json)
pnpm dev             # configured theme on localhost:4321 (--theme <id> to try another; falls back to packages/theme-kit/sample)
pnpm editor          # builds the dashboard and starts the local editor on localhost:4310 (ADR 0007)
pnpm japs publish    # build + deploy to a dedicated Netlify site or Cloudflare Pages project (--to, --draft; ADR 0008, 0012)
```

## Files (local mode; the hosted mode keeps the same documents in D1, ADR 0009)

- `japs.config.json` — user decisions (profile, locales, manual links, merges, per-project overrides). Written by the user, by hand or through the editor's Save (ADR 0004, 0007); pipeline commands only read it, `japs init` may create it if missing. The editor stores only differences from the defaults.
- `projects.json`, `facts.json`, `analysis.json`, `portfolio.json`, `publish.json` — generated, overwritten on every run. `publish.json` remembers the Netlify site JAPS created; JAPS never deploys to or changes any other site.
- Projects are referenced in config by a stable key: `repo:<owner>/<repo>` or `site:<netlify id>`, never by slug.

## Rules

- `@japs/core` must not import Node-only modules (fs, path, child_process). File I/O belongs to `@japs/cli`. Core must run in Node 20+, Cloudflare Workers and Netlify Functions (fetch + Web Crypto only).
- All external data is validated with Zod at the boundary (`@japs/schema`).
- Pairing never uses project/repo names. Only `repo_url`, `commit_url`, `review_url`, `homepage`, or manual links (see ADR 0003).
- Never commit tokens, `.env`, or generated `projects.json` / `portfolio.json` from a real account.
- Test fixtures must be anonymized (fake names and domains). Real account data stays out of the repo.
- Private repos: never expose their URL in public output (`links.repo = null`).
- Before the repo goes public (Phase 4), anonymize client names in `docs/kickoff.md`.
- Every new architectural decision gets an ADR in `docs/adr/`.
- Hosted API (`apps/api`): SQL only in `src/db.ts`, user data only via `forUser(userId)`; tokens and keys encrypted at rest, never returned to the browser; every new route gets an isolation test (ADR 0009).
- LLM access goes through `LlmClient` (ADR 0006); analysis code never calls a provider directly. Anonymized prompts carry no names, domains, URLs or README text.
- Portfolio texts are localized (`LocalizedText`, ADR 0005). Never hard-code `sk`/`en`; use the declared `locales`.
- Private repos and suggested client projects stay unpublished unless the config explicitly sets `"hidden": false`.
