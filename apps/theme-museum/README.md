# @japs/theme-museum

Museum hangs the portfolio as a quiet gallery retrospective. The entrance wall carries the name, the years and the introductory wall text; projects are framed works (black lacquer, oak or white frames with a mat) under soft spotlights, three to a room, each room painted a different colour. Every work has a museum wall label with title, artist and year, medium, catalogue number and an audio-guide stop. A floor plan and visitor information close the exhibition.

```bash
pnpm dev --theme museum          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme museum  # static site in apps/theme-museum/dist/
```

Choose it with `"theme": "museum"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- Rooms are numbered in Roman numerals; audio-guide stops are room × 100 + place (203 = room II, third work). Works hang on one centre line at three sizes; the largest frame goes to a work with a screenshot, and works without one hang as an empty mat with a note.
- The medium line is built from the technologies ("Nuxt, Vue and TypeScript on the web"). Availability reads like opening hours ("Open — accepting commissions" / "Closed for installation").
- Work pages hang the desktop and mobile screenshots side by side on the room's wall, with the full wall label (medium, role, dimensions, credit line: collection of the artist or commissioned by the client) and the curator's note.
- English, Slovak, Czech and German UI labels are included. Instrument Serif and Instrument Sans are bundled locally.
