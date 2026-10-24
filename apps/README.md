# apps

Each app is added in its phase so the repo never carries dead code.

| App | Phase | Stack |
|---|---|---|
| `theme-*` | 2 | 22 Astro themes (`default`, `terminal`, `aurora`, …), all read `portfolio.json` (see `docs/spec/portfolio-json.md`, ADR 0010) |
| [`api`](api/) | 3 (cloud) | Cloudflare Worker + D1: hosted multi-user JAPS (ADR 0009) |
| `dashboard` | 3 (local editor first) | Vue 3 + TypeScript; served by `japs edit`, Supabase backend later (ADR 0007) |
