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

**Phase 1 — Core.** Discovery + pairing → `projects.json`. Next: fact extraction and analysis → `portfolio.json`.

## Layout

```
packages/schema   Zod types (ProjectsFile, Portfolio, ProjectFacts). No deps besides zod.
packages/core     discovery (Netlify, GitHub), pairing, filters. Uses only fetch.
packages/cli      `japs` command (pnpm japs discover)
apps/*            dashboard (Vue 3, Phase 3), theme-default (Astro, Phase 2) — placeholders
```

## Commands

```bash
pnpm install
pnpm test            # vitest, all packages
pnpm typecheck       # tsc --noEmit, all packages
pnpm japs discover   # needs NETLIFY_TOKEN and GITHUB_TOKEN in .env
```

## Files (until Supabase in Phase 3)

- `japs.config.json` — user decisions (profile, locales, manual links, merges, per-project overrides). **Written only by the user**; tools read it, `japs init` may create it if missing (ADR 0004).
- `projects.json`, `facts.json`, `analysis.json`, `portfolio.json` — generated, overwritten on every run.
- Projects are referenced in config by a stable key: `repo:<owner>/<repo>` or `site:<netlify id>`, never by slug.

## Rules

- `@japs/core` must not import Node-only modules (fs, path, child_process). File I/O belongs to `@japs/cli`. Core must run in Node 20+, Netlify Functions and Supabase Edge Functions.
- All external data is validated with Zod at the boundary (`@japs/schema`).
- Pairing never uses project/repo names. Only `repo_url`, `commit_url`, `review_url`, `homepage`, or manual links (see ADR 0003).
- Never commit tokens, `.env`, or generated `projects.json` / `portfolio.json` from a real account.
- Test fixtures must be anonymized (fake names and domains). Real account data stays out of the repo.
- Private repos: never expose their URL in public output (`links.repo = null`).
- Before the repo goes public (Phase 4), anonymize client names in `docs/kickoff.md`.
- Every new architectural decision gets an ADR in `docs/adr/`.
- Portfolio texts are localized (`LocalizedText`, ADR 0005). Never hard-code `sk`/`en`; use the declared `locales`.
- Private repos and suggested client projects stay unpublished unless the config explicitly sets `"hidden": false`.
