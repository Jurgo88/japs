# ADR 0008: Publikovanie na Netlify (`japs publish`)

**Status:** Prijaté · 2026-10-14
**Issue:** #26

## Kontext

Výstupom JAPS je statický web na Netlify používateľa (kickoff, sekcia 4). Používateľ už má na Netlify iné weby a domény (napr. svoje doterajšie portfólio), ktoré sa nesmú zmeniť omylom.

## Rozhodnutie

1. **Vlastný web pre portfólio.** Prvé `japs publish` vytvorí nový Netlify web (`<meno>-portfolio.netlify.app`, alebo `--site-name`). Do existujúceho webu používateľa JAPS nikdy nenasadzuje a domény nemení; vlastnú doménu si používateľ napojí v Netlify sám.
2. **Stav v `publish.json`** (generovaný, v `.gitignore`): ID a názov webu, URL, posledný deploy. Zapisuje sa hneď po vytvorení webu, aby neúspešný prvý deploy nevytvoril pri ďalšom pokuse druhý web. Ak web medzitým zmizol, príkaz skončí s návodom, nevytvorí nový potichu. Vo Fáze 3 sa presunie do tabuľky `portfolios` (`netlify_site_id`).
3. **Nasadenie cez file-digest API:** SHA-1 každého súboru → Netlify vráti, ktoré obsahy nemá → nahrajú sa len tie (rovnaký obsah raz) → čaká sa na stav `ready`. Bez zipu a bez Netlify CLI; core používa len `fetch` a Web Crypto (beží aj v Edge Functions).
4. **Poradie:** `japs build` (aktuálny `out/`) → build témy s `JAPS_SITE_URL` = URL webu (absolútne `hreflang`) → deploy. Prázdne portfólio sa odmietne skôr, než sa Netlify vôbec kontaktuje.
5. **`--draft`:** náhľad na vlastnej URL, živý web sa nemení.

## Alternatívy

- **Netlify CLI (`netlify deploy`):** ďalšia ťažká závislosť a prihlásenie; API stačí a beží aj na serveri.
- **ZIP deploy:** jednoduchší, ale vždy nahrá všetko; digest nahrá len zmeny (typicky pár HTML súborov).
- **Nasadiť do existujúceho webu (napr. jurgo.sk):** riziko prepísania živého webu; ak to používateľ chce, prepne doménu v Netlify sám.

## Dôsledky

- `NETLIFY_TOKEN` musí mať právo zápisu (osobný access token ho má).
- CLI spúšťa build témy cez `pnpm` v monorepe; pri publikovaní balíkov na npm (Fáza 4) sa to nahradí programovým `astro build`.
- `portfolio.json` je súčasťou nasadeného webu (čitateľné strojovo); obsahuje len verejné údaje, ktoré sú aj na stránkach.
