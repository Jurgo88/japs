# Spec: `portfolio.json`

**Status:** Návrh
**Implementácia:** `packages/schema/src/portfolio.ts` (Zod), zostavenie `packages/core/src/build/portfolio.ts`, príkaz `japs build` → `out/portfolio.json` + `out/screenshots/`.

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
    "links": [{ "label": "GitHub", "url": "https://github.com/…" }],
    "email": "jane@example.com",
    "available": true
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
- `profile.email` (kontakt pre výzvu na spoluprácu) a `profile.available` (odznak dostupnosti) sú voliteľné, `null` keď nie sú v configu. Pribudli v rámci verzie 1 ([ADR 0010](../adr/0010-selectable-themes.md)); súbor bez nich sa načíta s `null`.
- `defaultLocale` musí byť v `locales`. Jednojazyčné portfólio = `locales` s jedným prvkom.

- `links.repo` je `null` pre privátne repá (nikdy neprezradiť existenciu privátneho repa).
- Odkazy smú mať len bezpečnú schému: `links.live` a `links.repo` len `http:`/`https:`, `profile.links[].url` aj `mailto:`. `javascript:`, `data:` a podobné schémy validácia odmietne, lebo by po kliknutí spustili skript na doméne portfólia (portfóliá na zdieľaných subdoménach). Markdown v `description` môže odkazovať len na `http(s)`, `mailto:` alebo relatívne ciele; iný odkaz `renderMarkdown` z `@japs/theme-kit` nahradí jeho textom.
- Ak `client.anonymized = true`: `title` je generický, `links.live` je `null`, `client.label` napr. `{ "sk": "E-shop pre klienta z gastro sektora", "en": "E-shop for a hospitality client" }`, screenshoty sa nezobrazujú, pokiaľ ich používateľ výslovne nepovolí.
- Obrázky sú relatívne cesty k súborom, ktoré sa kopírujú spolu s `portfolio.json` (žiadne hotlinky na Netlify CDN).
- Do portfólia ide len projekt, ktorý je viditeľný podľa **aktuálneho** configu (úprava `hidden` / `isClient` platí bez nového `discover`) a má analýzu vo všetkých jazykoch. Ostatné sú vo varovaniach.
- Poradie: `order` z configu, potom posledná aktivita. `period.from` = prvý commit, `period.to` = posledná aktivita.
- Texty: analýza, prekrytá po jazykoch `projects.<key>.copy` z configu; `tags` z configu nahrádzajú celé pole.
- Anonymizovaný projekt sa preskočí, ak jeho analýza nebola generovaná anonymne (inak by text mohol obsahovať meno klienta).
- Screenshoty: vlastné zábery z `japs screenshots` (Playwright, desktop 1440×900 a mobil 390×844 @2x, JPEG, `screenshots/manifest.json`) majú prednosť; bez desktopového záberu sa použije Netlify screenshot (stiahnutý, nie hotlink). Fotí sa len to, čo `build` publikuje (nie skryté, nie anonymizované bez `allowScreenshots`), na URL `screenshotUrl` z configu alebo hlavného webu. Cookie lišty sa skrývajú CSS. Súbor, ktorý sa nepodarí umiestniť, sa z portfólia vyradí.
- `version` sa zvyšuje pri breaking zmene. Šablóna deklaruje, ktoré verzie podporuje.
