# @japs/theme-swiss

Swiss follows the International Typographic Style: every block sits on a strict 12-column grid, the name and project titles are set in huge, tightly tracked grotesque type, and the palette is black, off-white and one signal red. Screenshots stay greyscale until hovered.

```bash
pnpm dev --theme swiss          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme swiss  # static site in apps/theme-swiss/dist/
```

Choose it with `"theme": "swiss"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Press <kbd>G</kbd> (or the Grid button) to show the 12-column grid over the page; the choice is remembered in the browser.
- Featured projects get full-width rows; without any featured project the first two lead. Projects without a screenshot get a typographic plate.
- Desktop and mobile screenshots sit side by side on project pages, also on small screens.
- English, Slovak, Czech and German UI labels are included.
- Inter Tight is bundled locally; there are no third-party font requests. All content works without JavaScript and motion respects `prefers-reduced-motion`.
