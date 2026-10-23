# @japs/theme-bento

Bento lays the portfolio out as a grid of rounded tiles of mixed sizes, in the style of modern product pages: a profile tile, stat tiles with a sparkline, a "based in" tile, links, a scrolling technology marquee, project tiles, an activity chart and a contact tile. It follows the system light or dark mode.

```bash
pnpm dev --theme bento          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme bento  # static site in apps/theme-bento/dist/
```

Choose it with `"theme": "bento"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Project tiles alternate a wide pair and a row of three (`src/lib/layout.ts`). The last row shares the width evenly and never leaves one tile alone; in a pair, the wide tile goes to the project with a screenshot.
- A soft light follows the pointer across tiles (pointer devices only). The technology marquee pauses on hover and wraps without motion under `prefers-reduced-motion`.
- The contact tile has a copy-email button when the clipboard API is available.
- Project pages are bento too: intro and details, desktop and mobile screenshots side by side, overview, the stack with how often each technology is used across the portfolio, and previous / next tiles.
- English, Slovak, Czech and German UI labels are included. Geist and Geist Mono are bundled locally.
