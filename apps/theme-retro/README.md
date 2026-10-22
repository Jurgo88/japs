# @japs/theme-retro

Retro OS turns the portfolio into a classic desktop: platinum windows with pinstriped title bars, a menu bar with a clock, and pixel icons on a dithered desktop. The projects live in a folder window with icon and list views; clicking one opens a quick-look window with its screenshots, summary and an Open button to the full project page.

```bash
pnpm dev --theme retro          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme retro  # static site in apps/theme-retro/dist/
```

Choose it with `"theme": "retro"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- On screens 900 px and wider, windows can be dragged by the title bar, focused and closed (Esc closes the active one). The folder view (icons or list) is remembered in the browser.
- A short startup screen shows once per browser session; it is skipped with `prefers-reduced-motion`, and a click dismisses it.
- On small screens, and without JavaScript, the windows sit in the normal page flow and every project icon is a plain link to its page.
- Desktop and mobile screenshots sit side by side in quick look and on project pages.
- English, Slovak, Czech and German UI labels are included. Pixelify Sans is bundled locally; body text uses the system's Geneva or Verdana.
