# ADR 0013: Portfóliá na subdoménach japs.app

**Status:** Prijaté · 2026-10-20
**Nadväzuje na:** [ADR 0009](0009-hosted-on-cloudflare.md) (hosting na Cloudflare), [ADR 0011](0011-cloud-publish-github-actions.md) (publikovanie cez GitHub Actions), [ADR 0012](0012-cloudflare-pages.md) (ciele publikovania)
**Mení:** ADR 0012 (`publish.target` má tretiu hodnotu `japs`)

## Kontext

Hostovaná verzia doteraz publikovala portfólio na Netlify alebo Cloudflare Pages používateľa. Na publikovanie tak potreboval ďalší účet a pripojenie, hoci JAPS beží na Cloudflare a doménu japs.app už má. Cieľom je adresa ako `jurgo.japs.app` bez ďalšieho účtu.

Požiadavky, ktoré rozhodujú:

- mená musia byť unikátne a nesmú uľahčiť vydávanie sa za iného,
- uvoľnenú adresu si nesmie hneď zabrať niekto cudzí a dostávať návštevy z odkazov na pôvodné portfólio,
- portfóliá na subdoménach nesmú ohroziť editor na japs.app, s ktorým zdieľajú „site“ v prehliadači,
- všetko na bezplatných plánoch Cloudflare.

## Rozhodnutie

### 1. Tretí cieľ publikovania: `japs`

Build ostáva rovnaký (ADR 0011): GitHub Actions zostaví tému a súbory odovzdá Workeru. Pri cieli `japs` posiela SHA-1 ako pri Netlify. Worker vráti, čo v úložisku používateľa chýba, overí obsah každého súboru voči jeho SHA-1 a uloží ho do R2 (bucket `japs-sites`):

| Kľúč | Obsah |
|---|---|
| `<user id>/files/<sha1>` | obsah súboru, raz pre všetky cesty a publikovania |
| `<user id>/deploys/<build id>.json` | manifest jedného publikovania: `{ "/cesta": "<sha1>" }` |

Keď beh skončí, Worker skontroluje, že dorazili všetky súbory, zapíše manifest a prepne adresu jedným `UPDATE`. Návštevník tak nikdy nevidí polovičné portfólio. Potom zmaže manifesty a súbory, ktoré nepoužíva živá verzia ani posledný koncept.

### 2. Mená

Predvolené meno je GitHub login malými písmenami. Používateľ si môže vybrať iné voľné meno. Pravidlá sú v `@japs/schema` (`handleProblem`, `RESERVED_HANDLES`), aby ich editor kontroloval už pri písaní:

- **Tvar:** jeden DNS label, malé písmená a číslice spojené jednoduchými pomlčkami, 3 až 39 znakov. Zmestí sa tak každý GitHub login s aspoň tromi znakmi. Dvojitá pomlčka nie je povolená, lebo oddeľuje koncept od mena a vylučuje aj punycode (`xn--`).
- **Rezervované mená:** názvy služby a infraštruktúry (`www`, `api`, `admin`, `status`, …) a obvyklé phishingové mená (`login`, `account`, `billing`, …). `www` presmeruje na japs.app.
- **Login je rezervovaný pre svojho používateľa.** Login každého používateľa JAPS ostáva jeho, aj keď používa iné meno. Cudzie GitHub loginy, ktoré v JAPS nie sú, zakázané nie sú: pravidlo by bolo príliš prísne a blokovalo by aj bežné slová.
- **Zmeny:** prvý výber a jedna zmena sú hneď. Ďalšia zmena je možná až 30 dní po predchádzajúcej.
- **Karanténa:** meno, ktoré sa uvoľní premenovaním, ostáva 60 dní blokované pre ostatných a presmerúva (302) na nové meno s rovnakou cestou. Presmerovanie je dočasné, lebo po karanténe môže meno patriť niekomu inému. Vlastné staré meno si používateľ môže vziať späť. Po zrušení účtu meno 60 dní ukazuje, že portfólio je preč (410).
- **Väzba na účet, nie na login:** premenovanie účtu na GitHube adresu nezmení.
- **Kto prv príde, ten berie.** Súbeh dvoch žiadostí rozhodne `UNIQUE` v D1.
- **Prvé publikovanie** si predvolené meno zaberie samo, ak je voľné. Inak editor vyzve na výber.

### 3. Servovanie samostatným Workerom `japs-sites`

Portfóliá servuje vlastný Worker (`wrangler.sites.jsonc`, route `*.japs.app/*`). Má len D1 a bucket `japs-sites`, žiadne tajomstvá, tokeny ani relácie. Chyba v servovaní tak nemôže siahnuť na prihlásenia ani tokeny používateľov.

- Podľa hlavičky `Host` nájde meno, majiteľa a manifest. Manifesty sa nemenia, takže si ich izolát drží v pamäti.
- Stránky sú priečinky ako v Astre: `/about` presmeruje (301) na `/about/`. Neznáma cesta dostane `404.html` portfólia, ak ju téma má.
- Cache: `/_astro/*` na rok (`immutable`), ostatné s `ETag` a revalidáciou (304).
- Hlavičky `X-Content-Type-Options: nosniff` a `Referrer-Policy: strict-origin-when-cross-origin`.
- Len `GET` a `HEAD`.

### 4. Koncepty

Koncept je na `https://<kľúč>--<meno>.japs.app`. Kľúč má 50 bitov náhody a pri každom koncepte je nový, takže starší odkaz prestane fungovať. Koncept má `X-Robots-Tag: noindex` a `Cache-Control: no-store`. Živú verziu nemení.

### 5. Bezpečnosť zdieľanej domény

Editor na japs.app a portfóliá na subdoménach sú pre prehliadač jeden „site“. Ochrana:

- cookies editora majú prefix `__Host-`, takže ich subdoména nemôže nastaviť ani prepísať (PR #72),
- zápisy v API kontrolujú hlavičku `Origin` a subdoména ju nemá rovnakú,
- odkazy v portfóliu smú byť len `http(s)` a `mailto:` (PR #72),
- obsah portfólia vzniká len buildom témy JAPS v overenom behu GitHub Actions (OIDC, ADR 0011). Používateľ nemôže nahrať vlastné súbory ani skripty.

## Alternatívy

- **CNAME z `meno.japs.app` na web používateľa na Netlify, Vercel alebo Pages:** používateľ by potreboval účet, každý hosting overuje domény inak a po zmazaní webu by hrozilo prevzatie subdomény cez visiaci CNAME.
- **Jeden Worker pre API aj portfóliá:** menej nasadení, ale servovanie by bežalo s tajomstvami a statické súbory editora by sa museli smerovať podľa hosta (`run_worker_first: true` pre všetko).
- **Vykresľovanie tém vo Workeri (SSR):** bez buildu, ale každú tému by bolo treba udržiavať aj ako SSR a narazilo by to na limit CPU bezplatného plánu (ADR 0011).
- **Pevné mená podľa loginu, ako github.io:** jednoduchšie, ale bez výberu, napríklad `jurgo` namiesto `jurgo88`.
- **Súbory priamo pod cestami (`<user id>/live/<cesta>`):** jednoduchšie čítanie, ale bez atomického prepnutia a bez súčasného konceptu.

## Dôsledky

- Migrácia 0007: tabuľky `hosted_sites` a `retired_handles`. Tabuľka `builds` sa prestavuje, aby `target` povolil `japs`.
- API: `GET /api/site`, `GET /api/site/check?handle=` a `PUT /api/site`, každá s testom izolácie. Zrušenie účtu zmaže súbory portfólia a meno dá do karantény.
- Editor: cieľ „japs.app“ v karte Publish to a pole na adresu s kontrolou dostupnosti.
- CLI: `japs publish` cieľ `japs` odmietne s odkazom na hostovanú verziu. `japs cloud-build` posiela pre `japs` SHA-1.
- **Jednorazové nastavenie:** R2 bucket `japs-sites` a proxied DNS záznam `*` v zóne japs.app (návod v `apps/api/README.md`). Bez bucketu zlyhá nasadenie oboch Workerov. Universal SSL pokrýva `*.japs.app`.
- `deploy.yml` nasadí po API Workeri aj `japs-sites`.
- Lokálne `pnpm dev:sites` beží s `wrangler.sites.dev.jsonc` bez route. S route by wrangler dev prepísal `Host` na zónu a každá adresa by vyzerala ako japs.app.
- Limity: súbor najviac 25 MB ako na Pages, 5000 súborov na build a 20 publikovaní denne (ADR 0011).
- **Neskôr:** vlastná doména používateľa cez Cloudflare for SaaS, japs.app v Public Suffix List, Content-Security-Policy pre témy.
