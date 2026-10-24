# @japs/theme-aurora

Aurora puts the portfolio on a living northern-lights sky: a WebGL fragment shader draws drifting curtains of teal, violet and pink that slowly lean toward the pointer and shift as you scroll. Content sits on frosted "liquid glass" panels with a bright rim and a specular highlight that follows the pointer; project cards tilt in 3D.

```bash
pnpm dev --theme aurora          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme aurora  # static site in apps/theme-aurora/dist/
```

Choose it with `"theme": "aurora"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The shader renders at reduced resolution (the aurora is soft anyway) and pauses while the tab is hidden. Without WebGL, CSS gradient blobs stand in; with `prefers-reduced-motion` the sky is a still frame and cards do not tilt. A film-grain overlay keeps gradients from banding.
- Home: availability pill, the name in an aurora gradient, stats on glass tiles, project cards with screenshots, and a contact panel with the stack.
- Project pages: desktop and mobile screenshots side by side on a glass stage, sticky details, the description and a next-project card.
- English, Slovak, Czech and German UI labels are included. Sora is bundled locally.
