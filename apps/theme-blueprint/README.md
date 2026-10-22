# @japs/theme-blueprint

Blueprint presents the portfolio as a technical drawing set on blue paper: a framed sheet with zone markers, dimension lines, detail callouts, a drawing index, a legend of technologies and a title block on every page. Screenshots are drawn as white linework and show the real photo on hover or in Photo view.

```bash
pnpm dev --theme blueprint          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme blueprint  # static site in apps/theme-blueprint/dist/
```

Choose it with `"theme": "blueprint"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The cover sheet (A-000) holds the name with a dimension line spanning the active years, general notes, the drawing index, project details and the legend. Each project is a sheet P-01, P-02, … in home-page order.
- Project sheets show desktop and mobile elevations side by side with dimensions, a specifications table, references and notes; the title block links to the next sheet.
- The Line / Photo switch (remembered in the browser) turns the blueprint rendering of screenshots off; hovering a screenshot shows the photo too. Without JavaScript screenshots stay in line view with photo on hover.
- Projects without a screenshot get a hatched "no drawing on file" plate.
- English, Slovak, Czech and German UI labels are included. Barlow Condensed, IBM Plex Mono and Caveat are bundled locally.
