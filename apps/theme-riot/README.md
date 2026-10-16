# @japs/theme-riot

Riot is a high-energy, cut-and-paste portfolio: comic-panel project cards, fluorescent print colours and chunky display type, with an orderly vertical reading flow underneath the noise.

```bash
pnpm dev --theme riot          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme riot  # static site in apps/theme-riot/dist/
```

Choose it with `"theme": "riot"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Project links, summaries, screenshots and detail pages stay legible and keyboard accessible.
- English, Slovak, Czech and German UI labels are included.
- Motion is decorative CSS only and respects `prefers-reduced-motion`; all content works without JavaScript.
- Bricolage Grotesque and DM Mono are bundled locally; there are no third-party font requests.