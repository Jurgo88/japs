# @japs/theme-canvas

Canvas lays the portfolio out on an infinite design board, in the spirit of Figma or Miro. The intro is a frame with sticky notes beside it (availability, location, most used technologies); every project is a frame group (desktop and mobile side by side) placed in a loose, hand-arranged grid. A collaborator cursor with your first name wanders over the board.

```bash
pnpm dev --theme canvas          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme canvas  # static site in apps/theme-canvas/dist/
```

Choose it with `"theme": "canvas"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- On screens 900 px and wider: drag to pan, scroll (or pinch) to zoom around the pointer, click a frame to zoom to it, the zoom percentage fits the whole board, arrow keys / + / − / 0 work with the board focused, and the minimap shows the viewport (click it to jump). Tabbing to a link brings its frame into view.
- Layout is deterministic (`src/lib/layout.ts`): the same portfolio always gives the same board. Projects without a screenshot get a striped placeholder frame.
- Phones and no JavaScript: the same frames and notes stack in a single column.
- Project pages are an editor view: a Layers panel listing every project, the board with the selected desktop frame (handles and size badge) next to the mobile frame, notes, and an inspector with properties, technologies as components and links.
- English, Slovak, Czech and German UI labels are included. Inter is bundled locally.
