# ADR 0012: Cloudflare Pages ako druhý poskytovateľ

**Status:** Prijaté · 2026-10-16
**Nadväzuje na:** [ADR 0003](0003-project-as-entity-1n.md) (párovanie), [ADR 0008](0008-publish-to-netlify.md) (publikovanie), [ADR 0009](0009-hosted-on-cloudflare.md) (hosting), [ADR 0011](0011-cloud-publish-github-actions.md) (publikovanie z cloudu)

## Kontext

Vývojári nemajú weby len na Netlify; časť ich má na Cloudflare. JAPS doteraz poznal iba Netlify, takže takéto projekty v portfóliu chýbali a publikovať sa dalo len na Netlify.

## Rozhodnutie

1. **Objavovanie: najprv len Cloudflare Pages.** Pages projekt prepojený s GitHubom priamo uvádza repo (`source.config.owner` a `repo_name`), takže sa páruje rovnako spoľahlivo ako Netlify `repo_url`. Pravidlo z ADR 0003 platí: nikdy podľa mien. Projekty nahrané priamo (direct upload) sa párujú cez `homepage` repa alebo ručnú väzbu. Workers so statickými súbormi pridáme neskôr: repo poznajú len pri Workers Builds.
2. **Id a kľúče:** web z Cloudflare má id `cf:<id Pages projektu>` a `provider: "cloudflare"`, kľúč projektu bez repa je `site:cf:<id>`. Netlify id ostávajú bez zmeny, takže existujúce `japs.config.json` platia ďalej. Jeden projekt môže mať weby u oboch poskytovateľov.
3. **Fakty:** pri Pages webe sa zbierajú fakty o živom webe a hosting „Cloudflare Pages“. Netlify detaily deployu (funkcie, Lighthouse) Pages nemá. Pole `provider` vo faktoch majú len weby, ktoré nie sú z Netlify, aby sa hash existujúcich faktov nezmenil a texty sa negenerovali nanovo. Cloudflare neposkytuje screenshot, preto náhľad pochádza len z vlastných snímok (Browser Run, Playwright).
4. **Prihlásenie:** v CLI je to API token (`CLOUDFLARE_API_TOKEN`) a na objavovanie stačí Pages: Read. V cloude používame OAuth klienta Cloudflare (dostupný od júna 2026): tlačidlo „Connect Cloudflare“, token uložený zašifrovaný ako pri Netlify. Rozsah je len čítanie, a ak používateľ chce publikovať na Pages, aj zápis do Pages.
5. **Publikovanie aj na Cloudflare Pages:** `japs.config.json` dostane `publish.target` (`netlify` je predvolené, alebo `cloudflare`). Build je rovnaký, mení sa len nahranie výsledku (Pages Direct Upload). JAPS na Pages vytvára a mení len vlastný projekt portfólia, nikdy iný projekt používateľa.
6. **Stačí jeden poskytovateľ.** Objavovanie potrebuje Netlify alebo Cloudflare, nie oba.

## Alternatívy

- **Párovanie podľa názvu Pages projektu:** jednoduché, ale v rozpore s ADR 0003, lebo názvy sa rozchádzajú.
- **GitHub Deployments API namiesto Cloudflare API:** Pages zapisuje deploye do GitHubu, takže netreba ďalší token. Fungovalo by to však len pre repá s Git integráciou, chýbali by domény a direct upload a nedalo by sa publikovať.
- **Hneď aj Workers:** viac pokrytia, ale bez spoľahlivého prepojenia s repom pre väčšinu Workerov; odložené.

## Dôsledky

- **Doplnené 2026-10-20:** `publish.target` má aj hodnotu `japs`, portfólio na `<meno>.japs.app` bez ďalšieho účtu ([ADR 0013](0013-japs-app-subdomains.md)).
- `Site.provider` je `"netlify" | "cloudflare"`, `SiteFacts.provider` je voliteľné a má iba hodnotu `"cloudflare"`.
- `discover()` berie `netlifyToken` a/alebo `cloudflareToken`; CLI číta `NETLIFY_TOKEN` a/alebo `CLOUDFLARE_API_TOKEN`.
- Cloud: pripojenie `cloudflare`, OAuth callback a import z oboch zdrojov (samostatný krok).
- Publikovanie na Pages: `japs publish --to cloudflare` (alebo `publish.target` v configu) a cieľ v editore. Nahráva sa rovnako ako cez wrangler: upload token projektu, `check-missing`, `upload`, `upsert-hashes` a deploy s manifestom. Hash je BLAKE3 (`@noble/hashes`, čistý JS, beží aj vo Workeri) a je overený voči wrangleru.
- `publish.json` (a dokument `publish` v cloude) si pamätá stránku pre každý cieľ zvlášť (`netlify`, `cloudflare`). Starý tvar s jedinou Netlify stránkou sa načíta automaticky.
- V cloude ostáva token používateľa vo Workeri aj pri Pages (ADR 0011). Hash súborov pre Pages však Worker neprepočítava: BLAKE3 nad base64 by na veľkých súboroch prekročil limit 10 ms CPU. Beh je overený cez OIDC a zlý súbor by pokazil len vlastný deploy používateľa.
- Koncept (`--draft`) ide na Pages na vetvu `japs-draft` s vlastnou adresou náhľadu.
- **Workers (doplnené 2026-10-16):** Worker sa berie ako web, len ak má verejnú adresu (vlastnú doménu, route v zóne alebo zapnuté `workers.dev`). Ostatné sú backendy. Id je `cf:worker:<názov>`, hosting je „Cloudflare Workers“. Repo zatiaľ neuvádzajú (Workers Builds nečítame, kým ho nevieme overiť na skutočných dátach), takže sa párujú cez `homepage` repa alebo ručnú väzbu. OAuth pridáva scope `workers-scripts.read`. Token bez práv na Workers jednoducho žiadne Workery nenájde, nehlási chybu.
