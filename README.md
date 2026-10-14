# JAPS — Just Another Portfolio Site

> Your portfolio, minus the part where you build your portfolio.

JAPS connects to your **Netlify** and **GitHub** accounts, finds what you've actually shipped, pairs deployed sites with their repositories, analyzes each project, and generates a static portfolio you can tweak and publish.

**Status:** early development. The CLI pipeline and a default theme work end to end; editor and one-click publishing are not there yet.

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
cp .env.example .env   # add NETLIFY_TOKEN, GITHUB_TOKEN and an LLM key (OpenAI, Gemini, Groq, OpenRouter or Ollama)
pnpm test
pnpm japs init         # creates japs.config.json for your decisions
pnpm japs discover     # writes projects.json
pnpm japs facts        # writes facts.json (README, dependencies, commits, Netlify, live site)
pnpm japs analyze      # writes analysis.json (project copy in your locales)
pnpm japs screenshots  # desktop + mobile shots of your live sites (Playwright, runs locally)
pnpm japs build        # writes out/portfolio.json + screenshots
pnpm dev               # preview the portfolio at http://localhost:4321
pnpm editor            # choose and edit projects in the browser at http://localhost:4310
pnpm japs publish --draft  # preview deploy to your Netlify
pnpm japs publish      # go live on <your-name>-portfolio.netlify.app
```

The editor writes your choices to `japs.config.json` when you press Save. It can also generate texts for a single project (one LLM call) when you show a project that had none.

### What goes to the LLM

`japs analyze` sends each project's extracted facts to the LLM provider you configure — including README excerpts of private repositories. Pick a provider whose data terms you accept, or run a local model with Ollama. Projects marked `"anonymize": true` in `japs.config.json` are sent without names, domains, URLs or README text. Private and client projects are never published unless you explicitly unhide them.

## Repository layout

| Path | What |
|---|---|
| `packages/schema` | Shared types and validation (Zod) |
| `packages/core` | Discovery, pairing, filters |
| `packages/cli` | `japs` command line |
| `apps/theme-default` | Default Astro theme, built from `portfolio.json` |
| `apps/dashboard` | Vue 3 editor, served locally by `japs edit` |
| `docs/` | Kickoff, specs and architecture decisions (Slovak) |

## License

To be decided before the public release (MIT planned for core, CLI and themes).
