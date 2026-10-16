# @japs/theme-orbit

Orbit turns a project index into a navigable constellation. Choose a satellite to load its case file into one large live dossier; the project collection is not presented as a vertical card list.

```bash
pnpm dev --theme orbit          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme orbit  # static site in apps/theme-orbit/dist/
```

Choose it with `"theme": "orbit"` in `japs.config.json` or the editor. Data, screenshots and locale routing follow the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- **Navigation:** projects orbit the profile hub; selecting a node updates the case-file display without leaving the page. Each node remains a direct project link when JavaScript is unavailable.
- **Motion:** GSAP animates orbit tracks, node arrivals and dossier changes. Reduced-motion preferences disable the animation layer.
- **Accessibility:** keyboard-operable project links, a live announcement for selection changes, and a compact grid fallback without JavaScript.
- **Locales:** English, Slovak, Czech and German UI labels.
- **Fonts:** Space Grotesk and DM Mono are bundled locally.