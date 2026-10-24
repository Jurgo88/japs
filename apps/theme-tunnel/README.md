# @japs/theme-tunnel

Tunnel is a flight through deep space. A warp starfield streams toward you (faster while you scroll), and below the intro the page becomes a 3D tunnel: scrolling flies the camera forward, projects approach out of the fog from alternating sides, settle in front of you, then fly past. A side HUD lists every project (click to jump) and a counter shows where you are. The end of the tunnel opens into the contact section with a "fuel" gauge of technologies.

```bash
pnpm dev --theme tunnel          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme tunnel  # static site in apps/theme-tunnel/dist/
```

Choose it with `"theme": "tunnel"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The camera dwells at each project (eased progress with a hold), so a project reads comfortably before the next one arrives. Only the project in front of you takes clicks; tabbing to a card scrolls to it.
- Without JavaScript or with `prefers-reduced-motion`, the tunnel is a plain list of the same cards and the starfield stands still.
- Project pages: screenshots (desktop and mobile side by side) settle from a tilted perspective as they scroll in (CSS scroll-driven animation where supported), a flight log of facts, the description and the next destination with its screenshot.
- English, Slovak, Czech and German UI labels are included. Space Grotesk is bundled locally.
