# ADR 0011: Publikovanie z cloudu cez GitHub Actions

**Status:** Prijaté · 2026-10-16
**Issue:** #34
**Nadväzuje na:** [ADR 0008](0008-publish-to-netlify.md) (nasadenie cez file-digest API), [ADR 0009](0009-hosted-on-cloudflare.md) (hosting na Cloudflare), [ADR 0010](0010-selectable-themes.md) (témy)

## Kontext

Hostovaný JAPS má vedieť to isté ako `japs publish`: zostaviť zvolenú tému z portfólia používateľa a nasadiť ju na jeho Netlify. Témy sú statické Astro stránky, ktoré pri builde načítajú `portfolio.json` zo súboru. Astro build potrebuje Node a Vite, takže vo Workeri nebeží. Bezplatný plán Workers navyše dáva 10 ms CPU na požiadavku aj na krok workflowu, čo na vykreslenie celého webu nestačí.

## Rozhodnutie

1. **Tému zostaví GitHub Actions v repe JAPS** (`.github/workflows/publish.yml`), presne ako `japs publish` v CLI: rovnaký `buildTheme`, rovnaký výstup, akákoľvek téma bez úprav. Pre verejné repo je to zadarmo.
2. **Spúšťa ho Worker** cez `workflow_dispatch` jemne obmedzeným tokenom (`GITHUB_BUILD_TOKEN`: len Actions read/write na repe JAPS). Vstupom je iba id buildu, nie dáta ani tajomstvá.
3. **Akcia sa Workeru preukazuje GitHub OIDC tokenom.** Worker overí podpis (JWKS GitHubu), vydavateľa, publikum (`APP_URL`), repo, workflow súbor a vetvu `main`. Prvé volanie pripojí build k `run_id` a ďalšie volania musia prísť z toho istého behu. Tajný odkaz ani token používateľa sa do akcie nedostane.
4. **Netlify token používateľa ostáva vo Workeri.** Akcia pošle zoznam súborov s SHA-1, Worker vytvorí deploy a vráti, čo Netlify chýba. Akcia potom posiela súbory po jednom a Worker každý rovno preposiela na Netlify. Každé volanie je samostatná požiadavka s jedným odchádzajúcim spojením a minimom CPU, takže sa zmestí do bezplatného plánu.
5. **Limity Netlify** (3 deploye za minútu, 100 za deň na účet): naraz beží jeden build na používateľa, medzi publikovaniami je aspoň 30 s a denne ich je najviac 20.
6. **Vstup buildu** (`portfolio.json` a zoznam screenshotov) leží v R2 pod prefixom používateľa a po dokončení sa zmaže. Vlastné screenshoty si akcia stiahne cez rovnako overené API, screenshoty Netlify priamo z ich verejnej adresy.

## Alternatívy

- **Render vo Workeri (Astro SSR alebo Container API):** všetko v Cloudflare a rýchlejšie, ale každá téma by sa musela udržiavať aj ako SSR balík, `theme-kit` by čítal portfólio z požiadavky a na bezplatnom pláne by to narazilo na limit CPU, teda Workers Paid.
- **Build priamo na Netlify (stránka napojená na repo):** vyžaduje prepojenie Netlify s repom pre každého používateľa a odovzdanie portfólia buildu; zložité a krehké.
- **Akcia nasadzuje na Netlify sama:** menej volaní, ale token používateľa by musel opustiť Worker.
- **Cloudflare Containers:** platené.

## Dôsledky

- Nová tabuľka `builds` (migrácia 0004), routy `POST /api/publish`, `GET /api/publish/latest` a `/builder/*` (overené OIDC, mimo session a kontroly Origin).
- CLI dostane príkaz `japs cloud-build --build <id> --api <url>`, ktorý volá iba akcia.
- Publikovanie trvá asi 1 až 2 minúty (štart runnera, inštalácia, build).
- Build logy verejného repa sú verejné. Akcia preto nevypisuje obsah portfólia ani výstup Astra, iba počty a pri chybe koniec výstupu buildu.
- Tajomstvo `GITHUB_BUILD_TOKEN` a premenná `JAPS_BUILD_REPO` vo Workeri.
