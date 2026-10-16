# @japs/theme-fieldnotes

Fieldnotes presents a portfolio as a working project journal: warm paper, clear archival labels and vivid orange field marks.

```bash
pnpm dev --theme fieldnotes          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme fieldnotes  # static site in apps/theme-fieldnotes/dist/
```

Choose it with `"theme": "fieldnotes"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Project screenshots stay prominent and link to full project records.
- English, Slovak, Czech and German UI labels are included.
- The layout is responsive, keyboard accessible and fully readable without JavaScript.
- Archivo and DM Mono are bundled locally; the site makes no font requests to third-party servers.