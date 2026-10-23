# @japs/theme-newspaper

Newspaper prints the portfolio as a broadsheet front page: a blackletter masthead with volume, number and date, a lead story with its photo and body set in justified columns, an index with dotted leaders, a tongue-in-cheek forecast, three secondary stories, news in brief, a tech index set like market quotes and a classified ad for contact. Project pages are full articles.

```bash
pnpm dev --theme newspaper          # http://localhost:4321 with out/portfolio.json (or the kit's sample)
pnpm theme:build --theme newspaper  # static site in apps/theme-newspaper/dist/
```

Choose it with `"theme": "newspaper"` in `japs.config.json` or the editor. Content, screenshots and locale routing use the shared [`@japs/theme-kit`](../../packages/theme-kit) contract.

- The volume is the number of active years in Roman numerals; the issue number is the project count. The paper is "The {name} Times" in English and "Noviny {name}" in Slovak and Czech, so the name never needs inflecting.
- The lead is a featured project, otherwise the first one with a screenshot; it runs its first two paragraphs and continues on its own page. Every project has a page number (A1, A2, …) in the index.
- Screenshots are printed as halftone (greyscale with a dot screen) and show in colour on hover. Desktop and mobile shots sit side by side on article pages.
- English, Slovak, Czech and German UI labels are included. Grenze Gotisch, Playfair Display and Source Serif 4 are bundled locally.
