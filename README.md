# JAPS — Just Another Portfolio Site

> Your portfolio, minus the part where you build your portfolio.

**[See a live portfolio](https://jurgo.japs.app) · [Try it on japs.app](https://japs.app) · [22 themes](#themes)**

<table>
<tr><td><img src="docs/themes/terminal.jpg" alt="Terminal theme"></td><td><img src="docs/themes/vinyl.jpg" alt="Vinyl theme"></td><td><img src="docs/themes/aurora.jpg" alt="Aurora theme"></td></tr>
</table>

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

<table>
<tr><td><img src="docs/themes/default.jpg" alt="default theme"><br><code>default</code></td><td><img src="docs/themes/editorial.jpg" alt="editorial theme"><br><code>editorial</code></td><td><img src="docs/themes/studio.jpg" alt="studio theme"><br><code>studio</code></td></tr>
<tr><td><img src="docs/themes/gallery.jpg" alt="gallery theme"><br><code>gallery</code></td><td><img src="docs/themes/fieldnotes.jpg" alt="fieldnotes theme"><br><code>fieldnotes</code></td><td><img src="docs/themes/riot.jpg" alt="riot theme"><br><code>riot</code></td></tr>
<tr><td><img src="docs/themes/orbit.jpg" alt="orbit theme"><br><code>orbit</code></td><td><img src="docs/themes/reel.jpg" alt="reel theme"><br><code>reel</code></td><td><img src="docs/themes/swiss.jpg" alt="swiss theme"><br><code>swiss</code></td></tr>
<tr><td><img src="docs/themes/retro.jpg" alt="retro theme"><br><code>retro</code></td><td><img src="docs/themes/blueprint.jpg" alt="blueprint theme"><br><code>blueprint</code></td><td><img src="docs/themes/metro.jpg" alt="metro theme"><br><code>metro</code></td></tr>
<tr><td><img src="docs/themes/arena.jpg" alt="arena theme"><br><code>arena</code></td><td><img src="docs/themes/bento.jpg" alt="bento theme"><br><code>bento</code></td><td><img src="docs/themes/newspaper.jpg" alt="newspaper theme"><br><code>newspaper</code></td></tr>
<tr><td><img src="docs/themes/vinyl.jpg" alt="vinyl theme"><br><code>vinyl</code></td><td><img src="docs/themes/museum.jpg" alt="museum theme"><br><code>museum</code></td><td><img src="docs/themes/terminal.jpg" alt="terminal theme"><br><code>terminal</code></td></tr>
<tr><td><img src="docs/themes/canvas.jpg" alt="canvas theme"><br><code>canvas</code></td><td><img src="docs/themes/tunnel.jpg" alt="tunnel theme"><br><code>tunnel</code></td><td><img src="docs/themes/posters.jpg" alt="posters theme"><br><code>posters</code></td></tr>
<tr><td><img src="docs/themes/aurora.jpg" alt="aurora theme"><br><code>aurora</code></td></tr>
</table>

All themes read the same `out/portfolio.json` and are localized into every language you declare, and all of them are free to use for your portfolio ([licenses](#license)). The default theme has light and dark mode, a technology filter, screenshots in device frames and subtle motion that respects `prefers-reduced-motion`.

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

JAPS uses different licenses for different parts:

| Part | License |
|---|---|
| Core, CLI, schema, theme kit, editor and everything else without its own `LICENSE` | [MIT](LICENSE) |
| Themes `default`, `editorial`, `swiss`, `bento` | [MIT](LICENSE) |
| `apps/api` (the hosted service) | [AGPL-3.0-only](apps/api/LICENSE) |
| All other themes | JAPS Theme License 1.0, see the `LICENSE` in each theme |

The JAPS Theme License is not an open-source license. You can use and modify those themes for your own portfolio for free, including one that wins you paid work, but you can't resell or redistribute them as themes. Your portfolio's content stays yours under every license above.

Dependencies keep their own licenses. Fonts use the SIL Open Font License, and the `editorial`, `gallery`, `orbit` and `studio` themes depend on [GSAP](https://gsap.com/standard-license), which has its own free license from Webflow.
