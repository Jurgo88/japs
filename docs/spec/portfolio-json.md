# Spec: `portfolio.json`

**Status:** Návrh
**Implementácia:** `packages/schema/src/portfolio.ts` (Zod), JSON Schema sa generuje z neho.

## Účel

Jediný kontrakt medzi analýzou (`core`) a výstupom (Astro šablóny). Šablóna nevie nič o Netlify ani GitHube, číta len tento súbor. Vďaka tomu môže ktokoľvek napísať vlastnú tému.

## Štruktúra

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-12T15:00:00Z",
  "profile": {
    "name": "Juraj Paluš",
    "headline": "Freelance full-stack developer",
    "bio": "…",
    "location": "Bratislava",
    "links": [{ "label": "GitHub", "url": "https://github.com/…" }]
  },
  "projects": [
    {
      "slug": "weather-dashboard",
      "title": "Weather Dashboard",
      "summary": "Krátky popis (max ~160 znakov)",
      "description": "Dlhší popis v markdowne",
      "role": "Solo developer",
      "period": { "from": "2025-03", "to": null },
      "tags": ["Vue", "Supabase", "Netlify Functions"],
      "links": {
        "live": "https://weather.example.com",
        "repo": null
      },
      "client": { "isClient": false, "anonymized": false, "label": null },
      "screenshots": [
        { "viewport": "desktop", "src": "screenshots/weather-dashboard-desktop.webp", "alt": "…" }
      ],
      "featured": true
    }
  ]
}
```

## Pravidlá

- `links.repo` je `null` pre privátne repá (nikdy neprezradiť existenciu privátneho repa).
- Ak `client.anonymized = true`: `title` a `links.live` sú generické, `client.label` napr. „E-shop pre klienta z gastro sektora“, screenshoty sa nezobrazujú, pokiaľ ich používateľ výslovne nepovolí.
- Obrázky sú relatívne cesty k súborom, ktoré sa kopírujú spolu s `portfolio.json` (žiadne hotlinky na Netlify CDN).
- `version` sa zvyšuje pri breaking zmene. Šablóna deklaruje, ktoré verzie podporuje.
