# ADR 0004: `japs.config.json` pre používateľské rozhodnutia

**Status:** Prijaté · 2026-10-13
**Issue:** #1

## Kontext

Supabase (tabuľky `projects`, `portfolios`, väzby `manual`) príde až vo Fáze 3. Fáza 1 a 2 bežia cez CLI nad súbormi a už teraz potrebujeme niekde držať rozhodnutia používateľa:

- profil (meno, headline, bio, odkazy),
- nastavenia discovery (napr. repá z organizácií),
- ručné párovanie web ↔ repo a zlučovanie projektov,
- viditeľnosť, klientsky príznak, anonymizácia, poradie, `featured`,
- ručne upravené texty, ktoré analýza nesmie prepísať.

`projects.json`, `facts.json` a `analysis.json` sú generované a pri každom behu sa prepíšu, preto sa na to nehodia.

## Rozhodnutie

Používateľské rozhodnutia žijú v jednom ručne editovanom súbore **`japs.config.json`** v pracovnom adresári (vedľa `projects.json`).

1. **Schéma:** `JapsConfig` v `@japs/schema` (Zod). Neplatný config zastaví beh s presnou chybou (cesta k poľu).
2. **Nikto ho neprepisuje.** `discover`, `facts`, `analyze`, `build` ho len čítajú. Jediná výnimka: `japs init` vytvorí štartovací config, ak neexistuje; existujúci nikdy nemení.
3. **I/O len v CLI.** `@japs/cli` súbor načíta a zvaliduje, do `@japs/core` posiela hotový objekt. Core ostáva bez `fs` (pravidlo z CLAUDE.md), takže rovnaké funkcie neskôr dostanú config zo Supabase.
4. **Stabilný kľúč projektu.** Projekty sa v configu neodkazujú cez `slug` (mení sa s názvom), ale cez kľúč odvodený zo zdrojov:
   - `repo:<owner>/<repo>` (normalizované `RepoId`), ak má projekt repo,
   - inak `site:<netlify site id>`.
   Discovery tento kľúč zapisuje do `projects.json` (`Project.key`), aby ho používateľ vedel skopírovať.
5. **Prednosť:** config > analýza > discovery. Pole uvedené v configu vždy vyhrá; analýza ho môže prepočítať, ale build ho nepoužije.
6. **Bezpečný default:** projekt s privátnym repom alebo s návrhom „klientsky“ sa nepublikuje, kým ho config výslovne neodkryje (`"hidden": false`). Zodpovedá to riziku „únik privátnych/klientskych dát“ z kickoffu.

### Náčrt štruktúry

Presné typy definuje `JapsConfig` (issue #3); lokalizované texty podľa [ADR 0005](0005-bilingual-portfolio.md).

```jsonc
{
  "version": 1,
  "locales": ["en", "sk"],
  "defaultLocale": "en",
  "profile": {
    "name": "Jane Doe",
    "headline": { "en": "Freelance full-stack developer", "sk": "Freelance full-stack vývojárka" },
    "bio": { "en": "…", "sk": "…" },
    "location": "Bratislava",
    "links": [{ "label": "GitHub", "url": "https://github.com/janedoe" }]
  },
  "discovery": {
    "includeOrgRepos": false,
    "staleAfterMonths": 24
  },
  // Ručné párovanie: pripojiť web k repu, alebo zlý pár zrušiť (repo: null).
  "links": [
    { "site": "0b1c…", "repo": "janedoe/acme-shop" },
    { "site": "9f8e…", "repo": null }
  ],
  // Zlúčenie viacerých projektov do jedného (napr. frontend + API repo).
  "merge": [
    { "into": "repo:janedoe/acme-shop", "from": ["repo:janedoe/acme-shop-api"] }
  ],
  "projects": {
    "repo:janedoe/acme-shop": {
      "hidden": false,
      "isClient": true,
      "anonymize": true,
      "clientLabel": { "en": "E-shop for a hospitality client", "sk": "E-shop pre klienta z gastro sektora" },
      "featured": true,
      "order": 1,
      "screenshotUrl": "https://acme.example.com/?demo=1",
      "copy": {
        "title": { "en": "Restaurant e-shop", "sk": "E-shop pre reštauráciu" }
      }
    }
  }
}
```

## Alternatívy

- **YAML:** príjemnejšie na ručnú úpravu (komentáre), ale ďalšia závislosť a dve syntaxe v projekte. JSON + JSON Schema (automaticky generovaná zo Zod) dá v editore autocomplete a validáciu.
- **Úpravy priamo v `projects.json`:** pri ďalšom `discover` by sa prepísali, alebo by discovery musel robiť merge, čo je krehké.
- **Supabase hneď:** predčasné; Fáza 1–2 má bežať bez backendu a bez účtu.
- **SQLite lokálne:** zbytočne ťažké na pár desiatok záznamov, nedá sa pohodlne editovať ručne.

## Dôsledky

- `japs.config.json` z reálneho účtu sa necommituje (pridaný do `.gitignore`). Pre testy a dokumentáciu vznikne anonymizovaný príklad.
- `Project` v `projects.json` dostane pole `key` (issue #3).
- Discovery prijíma `links` a `merge` z configu; väzby z `links` majú `matchSource: "manual"`.
- **Migrácia vo Fáze 3:** `profile` → `portfolios.profile`; `projects.*` → stĺpce tabuľky `projects`; `links` → `project_sites` s `match_source = 'manual'`; `merge` → `project_repos` / `project_sites`. Kľúč projektu sa zachová ako `projects.source_key`. Import configu do Supabase bude jednorazový príkaz.
- Koncept „ručne upravené pole sa neprepíše“ z [AI pipeline](../spec/ai-pipeline.md) sa do Fázy 3 realizuje cez `projects.<key>.copy` v configu.
