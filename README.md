# JAPS — Just Another Portfolio Site

> Your portfolio, minus the part where you build your portfolio.

JAPS connects to your **Netlify** and **GitHub** accounts, finds what you've actually shipped, pairs deployed sites with their repositories, analyzes each project, and generates a static portfolio you can tweak and publish.

**Status:** early development. Locally, everything works end to end: the CLI pipeline, the browser editor, 22 themes and publishing to your Netlify. The hosted version (sign in with GitHub, no local setup) imports your projects, writes their texts and publishes the portfolio to your Netlify or Cloudflare Pages, or to `<you>.japs.app` without any other account.

## Why another one?

Most portfolio generators read your GitHub profile and stop there. JAPS starts from what's **deployed**:

- **Netlify discovery** — every site you host, paired with its repo through deploy metadata, not guesswork by name
- **Real screenshots** of live sites, not AI cover art
- **Grounded copy** — project texts are written from extracted facts, and numbers that aren't in the facts are rejected
- **Multilingual** — every text in each language you declare (`en`, `sk`, …)
- **Client and private work** — opt-in publishing and anonymization ("E-shop for a client in hospitality")
- **22 themes** — from a clean default to Terminal, Retro OS, Newspaper, Vinyl, Museum, Aurora and more; switch with one line in the config
- **You own the output** — a static Astro site on your own Netlify and domain

## How it works

```
Netlify sites ─┐
               ├─▶ discover & pair ─▶ facts ─▶ AI copy ─▶ portfolio.json ─▶ Astro theme ─▶ Netlify
GitHub repos ──┘                                                ▲
                                          editor (japs.config.json)
```

Two ways to run it:

- **Locally** with the `japs` CLI and your own tokens. All data stays in files in your working directory.
- **Hosted** on Cloudflare Workers + D1: sign in with GitHub (a read-only GitHub App), connect Netlify, and import and edit projects in the browser. Background jobs gather facts and write texts; a monthly free AI quota is included, or you can add your own key (OpenAI, Gemini, Groq, OpenRouter). Tokens and keys are stored encrypted and never sent back to the browser. Publish to your own Netlify or Cloudflare Pages, or to `<you>.japs.app`: your GitHub username by default, or any free name you pick. Setup for running your own deployment is in [`apps/api`](apps/api/README.md).

## Development

Requires Node 20+ and pnpm.

```bash
pnpm install
cp .env.example .env   # add NETLIFY_TOKEN, GITHUB_TOKEN and an LLM key (OpenAI, Gemini, Groq, OpenRouter or Ollama)
pnpm test
pnpm japs init         # creates japs.config.json for your decisions
pnpm japs discover     # writes projects.json
pnpm japs facts        # writes facts.json (README, dependencies, commits, Netlify, live site)
pnpm japs analyze      # writes analysis.json (project copy in your locales)
pnpm japs screenshots  # desktop + mobile shots of your live sites (Playwright, runs locally)
pnpm japs build        # writes out/portfolio.json + screenshots
pnpm dev               # preview the portfolio at http://localhost:4321 (--theme <id> to try another)
pnpm editor            # choose and edit projects in the browser at http://localhost:4310
pnpm japs publish --draft  # preview deploy to your Netlify
pnpm japs publish      # go live on <your-name>-portfolio.netlify.app
```

The editor writes your choices to `japs.config.json` when you press Save. It can also generate texts for a single project (one LLM call) when you show a project that had none.

`japs publish` creates a dedicated Netlify site on the first run and remembers it in `publish.json`. JAPS never deploys to or changes any of your other sites.

### Themes

Pick a theme with `"theme": "<id>"` in `japs.config.json`, or try one without changing the config: `pnpm dev --theme terminal`.

`default`, `editorial`, `studio`, `gallery`, `fieldnotes`, `riot`, `orbit`, `reel`, `swiss`, `retro`, `blueprint`, `metro`, `arena`, `bento`, `newspaper`, `vinyl`, `museum`, `terminal`, `canvas`, `tunnel`, `posters`, `aurora`

All themes read the same `out/portfolio.json` and are localized into every language you declare. The default theme has light and dark mode, a technology filter, screenshots in device frames and subtle motion that respects `prefers-reduced-motion`.

### What goes to the LLM

`japs analyze` sends each project's extracted facts to the LLM provider you configure — including README excerpts of private repositories. Pick a provider whose data terms you accept, or run a local model with Ollama. Projects marked `"anonymize": true` in `japs.config.json` are sent without names, domains, URLs or README text. Private and client projects are never published unless you explicitly unhide them.

## Repository layout

| Path | What |
|---|---|
| `packages/schema` | Shared types and validation (Zod) |
| `packages/core` | Discovery, pairing, filters, fact extraction, AI copy, publishing (runs in Node and Workers) |
| `packages/cli` | `japs` command line |
| `packages/theme-kit` | Optional helpers shared by the built-in themes (loading, locales, UI strings, Astro config) |
| `apps/theme-*` | Astro themes built from `portfolio.json`; pick one with `"theme"` in `japs.config.json` |
| `apps/dashboard` | Vue 3 editor, served locally by `japs edit` and online by the API |
| `apps/api` | Hosted JAPS: Cloudflare Worker (Hono) + D1, GitHub sign-in, Netlify connect; a second, read-only Worker serves `<you>.japs.app` |
| `docs/` | Kickoff, specs and architecture decisions (Slovak) |

## License

To be decided before the public release (MIT planned for core, CLI and themes).
