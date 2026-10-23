# @japs/theme-vinyl

Vinyl presents the portfolio as a 70s record. The front is an LP sleeve with the name and rainbow stripes, its record half out (it slides further and turns on hover). Projects are the tracklist on sides A and B next to a turntable: hovering or focusing a track puts its screenshot on the record label, drops the tone arm and spins the record. The discography shows every project as an album cover with a record peeking out, followed by liner notes and credits.

```bash
pnpm dev --theme vinyl          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme vinyl  # static site in apps/theme-vinyl/dist/
```

Choose it with `"theme": "vinyl"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The first half of the projects is side A, the rest side B (A1, A2, …, B1, …). Without JavaScript the turntable shows the first project with a screenshot and every track is a plain link.
- Availability is a sticker on the sleeve ("Now booking" / "Sold out"). Credits list the technologies with how many tracks they play on.
- Album pages: the cover with its record, role / period / client as producer, recorded and label, Listen live and Source tapes buttons, desktop and mobile screenshots side by side "inside the gatefold", liner notes, personnel and the next record.
- Spinning is off with `prefers-reduced-motion`. English, Slovak, Czech and German UI labels are included. Fraunces and Work Sans are bundled locally.
