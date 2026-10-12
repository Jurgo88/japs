# ADR 0001: Astro pre generovaný portfólio web

**Status:** Prijaté · 2026-10-12

## Kontext

Výstupom JAPS je statický portfólio web, ktorý sa nasadí na Netlify používateľa. Potrebujeme témy, ktoré vedia písať aj iní (open-source komunita), rýchly statický výstup a dobré SEO.

## Rozhodnutie

Generovaný web stavať v **Astro**. Dashboard/editor ostáva vo **Vue 3**.

## Dôvody

- Astro je primárne statický generátor: nulový JS, kde netreba, výborné Core Web Vitals.
- Témy sú obyčajné `.astro` komponenty čítajúce `portfolio.json`, nízka bariéra pre prispievateľov.
- Astro vie použiť Vue komponenty (islands), takže interaktívne prvky môžu zdieľať kód s dashboardom.
- Nová technológia je zároveň zámerná učebná investícia.

## Alternatívy

- **Vue + Vite SSG:** konzistentné so stackom, ale viac ručnej práce okolo SSG a SEO.
- **Nuxt (static):** silné, ale na jednostránkové portfólio zbytočne ťažké.

## Dôsledky

- Šablóny žijú v `apps/theme-*` a sú závislé len od `@japs/schema`.
- Build výstupu prebieha cez `astro build` s `portfolio.json` ako vstupom.
