# apps

Each app is added in its phase so the repo never carries dead code.

| App | Phase | Stack |
|---|---|---|
| [`theme-default`](theme-default/) | 2 | Astro, reads `portfolio.json` (see `docs/spec/portfolio-json.md`) |
| [`api`](api/) | 3 (cloud) | Cloudflare Worker + D1: hosted multi-user JAPS (ADR 0009) |
| `dashboard` | 3 (local editor first) | Vue 3 + TypeScript; served by `japs edit`, Supabase backend later (ADR 0007) |
