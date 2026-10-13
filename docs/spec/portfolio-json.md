# Spec: `portfolio.json`

**Status:** Návrh
**Implementácia:** `packages/schema/src/portfolio.ts` (Zod), JSON Schema sa generuje z neho.

## Účel

Jediný kontrakt medzi analýzou (`core`) a výstupom (Astro šablóny). Šablóna nevie nič o Netlify ani GitHube, číta len tento súbor. Vďaka tomu môže ktokoľvek napísať vlastnú tému.

## Štruktúra

Texty sú viacjazyčné (`LocalizedText`, [ADR 0005](../adr/0005-bilingual-portfolio.md)): objekt jazyk → text, ktorý musí obsahovať presne jazyky z `locales`.

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-12T15:00:00Z",
  "locales": ["en", "sk"],
  "defaultLocale": "en",
  "profile": {
    "name": "Jane Doe",
    "headline": { "en": "Freelance full-stack developer", "sk": "Freelance full-stack vývojárka" },
    "bio": { "en": "…", "sk": "…" },
    "location": "Bratislava",
    "links": [{ "label": "GitHub", "url": "https://github.com/…" }]
  },
  "projects": [
    {
      "slug": "weather-dashboard",
      "title": { "en": "Weather Dashboard", "sk": "Počasie" },
      "summary": { "en": "Short description (max 200 chars)", "sk": "Krátky popis (max 200 znakov)" },
      "description": { "en": "Longer description in Markdown", "sk": "Dlhší popis v markdowne" },
      "role": { "en": "Solo developer", "sk": "Samostatný vývoj" },
      "period": { "from": "2025-03", "to": null },
      "tags": ["Vue", "Supabase", "Netlify Functions"],
      "links": {
        "live": "https://weather.example.com",
        "repo": null
      },
      "client": { "isClient": false, "anonymized": false, "label": null },
      "screenshots": [
        { "viewport": "desktop", "src": "screenshots/weather-dashboard-desktop.webp", "alt": { "en": "…", "sk": "…" } }
      ],
      "featured": true
    }
  ]
}
```

## Pravidlá

- Lokalizované: `profile.headline`, `profile.bio`, `title`, `summary`, `description`, `role`, `client.label`, `screenshots[].alt`. Ostatné polia (vrátane `tags`) sú jazykovo neutrálne.
- `defaultLocale` musí byť v `locales`. Jednojazyčné portfólio = `locales` s jedným prvkom.

- `links.repo` je `null` pre privátne repá (nikdy neprezradiť existenciu privátneho repa).
- Ak `client.anonymized = true`: `title` je generický, `links.live` je `null`, `client.label` napr. `{ "sk": "E-shop pre klienta z gastro sektora", "en": "E-shop for a hospitality client" }`, screenshoty sa nezobrazujú, pokiaľ ich používateľ výslovne nepovolí.
- Obrázky sú relatívne cesty k súborom, ktoré sa kopírujú spolu s `portfolio.json` (žiadne hotlinky na Netlify CDN).
- `version` sa zvyšuje pri breaking zmene. Šablóna deklaruje, ktoré verzie podporuje.
