# ADR 0007: Lokálny editor (`japs edit`)

**Status:** Prijaté · 2026-10-13
**Issue:** #23
**Mení:** [ADR 0004](0004-japs-config-json.md) (kto zapisuje `japs.config.json`), poradie Fázy 3

## Kontext

Výber projektov, poradie, anonymizácia a úprava textov sa dnes robia ručne v `japs.config.json`. Pre vlastníka to ide, pre ostatných používateľov je to bariéra: musia poznať kľúče projektov a štruktúru JSON-u. Dashboard bol plánovaný až vo Fáze 3 spolu so Supabase (auth, multi-user), čo je veľa práce pred prvým použiteľným výsledkom.

## Rozhodnutie

1. **Dashboard začína lokálne.** `apps/dashboard` (Vue 3 + Vite) sa spúšťa cez `japs edit`: CLI spustí lokálny HTTP server, ktorý servíruje zostavený dashboard a malé JSON API nad lokálnymi súbormi (`projects.json`, `analysis.json`, `screenshots/`, `japs.config.json`).
2. **Editor zapisuje config, ale len na výslovné uloženie.** ADR 0004 hovorí „zapisuje len používateľ“; po novom „zapisuje používateľ, ručne alebo cez editor tlačidlom Uložiť“. Pipeline príkazy (`discover`, `facts`, `analyze`, `build`) ho naďalej len čítajú. Pred zápisom sa config validuje schémou `JapsConfig`.
3. **Config ostáva minimálny.** Editor ukladá len rozdiely voči predvolenému stavu: `hidden` len keď sa líši od filtrov, `copy` len pre polia a jazyky, ktoré používateľ zmenil oproti analýze. Ručne čitateľný súbor tak ostáva čitateľný.
4. **Bezpečnosť lokálneho servera:** počúva len na `127.0.0.1`; odmieta požiadavky s iným `Host` (ochrana proti DNS rebinding); zápisy (`PUT`, `POST`) vyžadujú token vygenerovaný pri štarte a vložený do stránky, takže iná stránka v prehliadači nemôže config prepísať.
5. **Dátová vrstva za rozhraním.** Dashboard pristupuje k dátam cez `EditorBackend` (načítať stav, uložiť config, zostaviť). Teraz je jediná implementácia HTTP voči `japs edit`; vo Fáze 3 pribudne Supabase implementácia a komponenty ostanú.
6. **Logika viditeľnosti je zdieľaná.** Dashboard importuje `isPublished` a ďalšie čisté funkcie z `@japs/core` (core beží aj v prehliadači), takže editor ukazuje presne to, čo `japs build` zverejní.

## Alternatívy

- **Terminálový výber (`japs select`):** rýchly, ale bez úprav textov a náhľadov; slepá ulička pre Fázu 3.
- **Rovno Fáza 3 so Supabase:** auth, RLS a hosting pred prvým použiteľným editorom; pre lokálny CLI nástroj zbytočné.
- **Editor priamo v téme (Astro):** miešal by výstup pre verejnosť s nástrojom na úpravy; téma má zostať čistá a nezávislá.

## Dôsledky

- Nový balík `apps/dashboard` (Vue 3, Vite) a závislosť CLI na jeho zostavenom výstupe (`apps/dashboard/dist`). Bez buildu `japs edit` vypíše, ako ho zostaviť.
- **Generovanie textov z editora:** projekt bez textov (typicky predtým skrytý) alebo s textami vygenerovanými s menom, hoci je teraz anonymizovaný, má tlačidlo, ktoré spustí `facts` + `analyze` len pre tento projekt (rádovo cent). LLM sa volá výhradne na toto kliknutie; editor pred tým uloží config, lebo z neho analýza číta anonymizáciu. Výsledok (model, tokeny, vyhodené vety) sa zobrazí pri projekte.
- `japs facts` vyberá projekty podľa aktuálneho configu (ako `build`) a fakty projektov mimo behu ponecháva, takže zobrazený projekt dostane fakty bez nového `discover`.
- UI je zatiaľ v angličtine (verejný open-source nástroj); preklad UI rieši Fáza 3.
