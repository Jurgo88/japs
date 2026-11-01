# ADR 0015: Štatistiky návštev

**Status:** Prijaté · 2026-11-01
**Nadväzuje na:** [ADR 0009](0009-hosted-on-cloudflare.md) (hostovaná verzia), [ADR 0011](0011-cloud-publish-github-actions.md) (build v GitHub Actions), [ADR 0013](0013-japs-app-subdomains.md) (portfóliá na subdoménach)
**Mení:** zásady súkromia, ktoré doteraz tvrdili, že JAPS nemá analytiku

## Kontext

Vlastník chce vidieť návštevnosť japs.app a každý používateľ návštevnosť svojho portfólia. Portfólio môže bežať na `<meno>.japs.app`, ale aj na Netlify alebo Cloudflare Pages používateľa, kam JAPS nevidí. Všetko má ostať na bezplatných plánoch a bez cookie lišty.

## Rozhodnutie

### 1. japs.app: Cloudflare Web Analytics

Beacon načíta `apps/dashboard/src/main.ts`, len ak build dostane `VITE_CF_BEACON_TOKEN`. Token je verejný, nastavuje ho `deploy.yml` z premennej repa `CF_BEACON_TOKEN`. Lokálny `japs edit` ho nikdy nenačíta.

### 2. Portfóliá: vlastný počítač návštev

- **Skript:** `theme-kit` vloží do každej stránky krátky inline skript cez Astro integráciu. Rieši sa to na jednom mieste, takže žiadna z tém sa nemení. Skript vznikne len vtedy, keď build dostane `JAPS_ANALYTICS_URL` a `JAPS_ANALYTICS_KEY`.
- **Kedy sa pridá:** iba pri ostrom publikovaní z hostovanej verzie, ak `analytics` v configu nie je `false`. Koncepty a CLI ho nemajú.
- **Požiadavka:** `sendBeacon` s `text/plain` na `POST /api/hit`, bez preflightu. Prehliadače s Do Not Track alebo Global Privacy Control nič neposielajú.
- **Kľúč:** verejný náhodný kľúč v tabuľke `analytics_sites`. Hovorí len to, komu sa návšteva pripočíta.
- **Route `/api/hit`:** je verejná, má výnimku z kontroly `Origin` a nečíta session. Na všetko odpovedá 204, aby nič neprezradila.
- **Čo sa ukladá:** len denné počítadlá v `analytics_daily`: zobrazenia, návštevy, cesta bez query, hostiteľ odkazujúcej stránky a krajina z Cloudflare. IP adresa, user agent ani identifikátor návštevníka sa neukladajú.
- **Návšteva** je zobrazenie, pri ktorom človek prišiel zvonka. Unikátnych návštevníkov JAPS bez identifikátora spočítať nevie a ani nechce.
- **Roboty:** user agenty robotov sa ignorujú. Je to len základný filter.
- **Uchovanie:** 30 dní. Mazanie beží pri každej návšteve pre všetkých používateľov, aby stratili staré dáta aj portfóliá bez návštev.
- **Editor:** karta Stats s prepínačom, súčtami, grafom a zoznamami stránok, zdrojov a krajín.

### 3. Súhrn pre vlastníka

Súhrn cez všetkých používateľov je SQL dotaz v `apps/api/README.md`. Samostatné administrátorské rozhranie zatiaľ netreba.

## Alternatívy

- **Počítanie vo Workeri `japs-sites`:** bez skriptu, ale nepokryje Netlify ani Pages, počíta aj robotov a do Workera bez zápisov by pribudli zápisy do D1.
- **Cloudflare Web Analytics aj pre portfóliá:** bez vlastného kódu, ale dáta by videl len vlastník a každá doména by potrebovala vlastný token.
- **Plausible, Umami:** hotové, ale znamená to platenú službu alebo ďalší server.
- **Workers Analytics Engine:** vhodné na veľké objemy, ale čítanie ide cez samostatné API s tokenom. Pri tomto objeme stačí D1.

## Dôsledky

- Migrácia 0008: tabuľky `analytics_sites` a `analytics_daily`.
- Štatistiky začnú počítať až od ďalšieho publikovania. Skôr zverejnené portfóliá skript nemajú.
- Vypnutie platí tiež od ďalšieho publikovania.
- Kľúč je v zdrojovom kóde stránky, takže návštevy sa dajú sfalšovať. Škoda sú len nepresné čísla jedného používateľa. Po 500 riadkoch za deň rastú už len súčty, takže tabuľka nemôže rásť donekonečna.
- Každá návšteva je jeden request na API Worker a pár zápisov do D1. Započítava sa do bezplatných limitov Cloudflare.
- Prihlásený používateľ na `*.japs.app` posiela pri návšteve aj session cookie, lebo ide o rovnaký „site“. Route ju nečíta.
- Portfólio na vlastnej doméne meria JAPS v mene jeho majiteľa, ktorý si to môže vypnúť. Súhlas návštevníka sa pri tomto rozsahu dát nerieši. Pred väčším nasadením to treba overiť právne.
