# @japs/theme-reel

Reel is a cinematic, dark portfolio: projects spin on a 3D carousel at the top, and below it a showcase grid can be filtered by technology. Screenshots are shown through a sunset duotone filter; a spotlight follows the pointer and reveals the real colours.

```bash
pnpm dev --theme reel          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme reel  # static site in apps/theme-reel/dist/
```

Choose it with `"theme": "reel"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The carousel rotates on its own, pauses on hover and focus, and can be dragged, stepped with the arrow buttons or the keyboard, or paused with a button. Clicking a side card brings it to the front; clicking the front card opens the project.
- With fewer than three projects, without JavaScript or with `prefers-reduced-motion`, the carousel degrades to a horizontal scroll-snap strip (reduced motion keeps the 3D ring but never auto-rotates). All content and links stay usable.
- The technology filter uses the View Transitions API where available and announces the number of shown projects.
- English, Slovak, Czech and German UI labels are included.
- Archivo and JetBrains Mono are bundled locally; there are no third-party font requests.
