# @japs/theme-arena

Arena turns the portfolio into game night. An LED scoreboard opens the page (projects shipped against zero bugs, a running game clock, technologies and seasons), followed by the lineup on the ice: projects in forward lines of three with jersey numbers. Stats leaders rank the technologies, and every project page is a match report.

```bash
pnpm dev --theme arena          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme arena  # static site in apps/theme-arena/dist/
```

Choose it with `"theme": "arena"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Scoreboard digits are drawn as seven-segment SVG (`src/lib/segments.ts`); the game clock counts down a 20-minute period with JavaScript and stays at 20:00 without it or with `prefers-reduced-motion`.
- Availability shows as "Free agent" or "Under contract". Client projects wear a "C" patch; projects with a live site are marked Live.
- Project pages show a jersey number, Watch live / Game tape buttons, desktop and mobile screenshots side by side as jumbotron screens, a box score and the game recap, and lead to the next game.
- A top-down rink (200 × 85 ft) decorates the ice and project headers; it is also the placeholder for projects without a screenshot.
- English, Slovak, Czech and German UI labels are included. Archivo (with its width axis) and Graduate are bundled locally.
