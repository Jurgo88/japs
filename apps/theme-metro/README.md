# @japs/theme-metro

Metro draws the portfolio as a transit network. The most used technologies become coloured lines, projects become stations in chronological order, and projects on several lines are interchanges. The map is generated from `portfolio.json` at build time.

```bash
pnpm dev --theme metro          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme metro  # static site in apps/theme-metro/dist/
```

Choose it with `"theme": "metro"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Up to six lines: technologies used by at least two projects, most used first. Projects no coloured line serves ride a grey "other" line, so every project is on the map.
- The map runs left to right on wide screens and top to bottom on phones; picking a line in the legend dims the rest. Every station is a link to its project.
- The home page also has a service status panel (availability per line) and an amber departures board listing every project, newest first.
- Station pages show the lines serving the project with the previous and next stop on each, desktop and mobile screenshots side by side as posters, a ticket with the facts and links, and a "next station" display.
- English, Slovak, Czech and German UI labels are included. Overpass and Doto are bundled locally.
