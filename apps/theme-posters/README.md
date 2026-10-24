# @japs/theme-posters

Posters presents the portfolio as a series of generative prints pinned to a wall. Every project gets a unique poster computed at build time from its own data; hovering a print reveals the real screenshot through a growing circle. Project pages show the full print next to the facts, then the desktop and mobile screenshots side by side.

```bash
pnpm dev --theme posters          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme posters  # static site in apps/theme-posters/dist/
```

Choose it with `"theme": "posters"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- `src/lib/generate.ts`: the slug seeds a small PRNG and picks one of six compositions (orbits, truchet, stripes, blocks, waves, rays) and one of six palettes; each technology shifts the colour order, so projects with the same stack look related; the number of technologies sets the layers and the active years set the rhythm. A halftone texture is added on top. The same data always produces the same poster.
- Posters are inline SVG: no images, no JavaScript, crisp at any size.
- English, Slovak, Czech and German UI labels are included. Schibsted Grotesk is bundled locally.
