# @japs/theme-default

The default JAPS theme: a static [Astro](https://astro.build) site generated from `portfolio.json` (contract: [`docs/spec/portfolio-json.md`](../../docs/spec/portfolio-json.md)). It knows nothing about Netlify or GitHub.

```bash
pnpm japs build      # writes out/portfolio.json + out/screenshots/
pnpm dev             # the theme set in japs.config.json, http://localhost:4321
pnpm dev --theme default   # this one regardless of the config
pnpm theme:build     # static site in apps/theme-<id>/dist/
```

- **Data:** `out/` in the repo root, or `JAPS_PORTFOLIO_DIR=<dir>`. Without either, the anonymized [sample](../../packages/theme-kit/sample/portfolio.json) from `@japs/theme-kit` is used, so the theme runs with no account at all.
- **Images:** the portfolio directory is Astro's `publicDir`; screenshots are served from it, never hotlinked.
- **Languages:** one page set per locale in `portfolio.json`; the default locale lives at `/`, others under `/<locale>/`, with `hreflang` links. UI strings are in `src/lib/i18n.ts` (en, sk, cs, de); a locale without them fails the build.
- **Motion and interaction:** light/dark/system switch, card → detail morph (cross-document View Transitions), scroll-driven card reveal, tag filter (`?tag=vue`), stats, screenshot lightbox, previous/next project. All of it is progressive: without JS or without browser support the pages work as plain links, and `prefers-reduced-motion` turns the animations off.
- **Canonical URLs:** set `JAPS_SITE_URL=https://your.domain` for absolute `hreflang` links.

Writing another theme: read `portfolio.json`, validate it with `Portfolio` from `@japs/schema`, render. That's the whole interface. The built-in themes also use [`@japs/theme-kit`](../../packages/theme-kit) for loading, locales, URLs and UI strings (ADR 0010).
