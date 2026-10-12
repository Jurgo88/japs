# JAPS — Just Another Portfolio Site

> Your portfolio, minus the part where you build your portfolio.

JAPS connects to your **Netlify** and **GitHub** accounts, finds what you've actually shipped, pairs deployed sites with their repositories, analyzes each project, and generates a static portfolio you can tweak and publish.

**Status:** early development (Phase 1). Not usable yet.

## Why another one?

Most portfolio generators read your GitHub profile and stop there. JAPS starts from what's **deployed**:

- **Netlify discovery** — every site you host, paired with its repo through deploy metadata, not guesswork by name
- **Real screenshots** of live sites, not AI cover art
- **Client and private work** — opt-in publishing and anonymization ("E-shop for a client in hospitality")
- **You own the output** — a static Astro site on your own Netlify and domain

## How it works

```
Netlify sites ─┐
               ├─▶ discover & pair ─▶ projects.json ─▶ analyze ─▶ portfolio.json ─▶ Astro theme ─▶ Netlify
GitHub repos ──┘
```

## Development

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env   # add NETLIFY_TOKEN and GITHUB_TOKEN
pnpm test
pnpm japs discover     # writes projects.json
```

## Repository layout

| Path | What |
|---|---|
| `packages/schema` | Shared types and validation (Zod) |
| `packages/core` | Discovery, pairing, filters |
| `packages/cli` | `japs` command line |
| `apps/` | Dashboard (Vue 3) and themes (Astro) — coming later |
| `docs/` | Kickoff, specs and architecture decisions (Slovak) |

## License

To be decided before the public release (MIT planned for core, CLI and themes).
