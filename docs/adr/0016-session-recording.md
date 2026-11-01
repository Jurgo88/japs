# ADR 0016: Nahrávanie relácií na japs.app

**Status:** Prijaté · 2026-11-01
**Nadväzuje na:** [ADR 0015](0015-visit-statistics.md) (štatistiky návštev)

## Kontext

Vlastník chce vidieť, ako ľudia používajú japs.app, nielen koľko ich je. Cloudflare nahrávanie relácií neponúka. Editor pritom zobrazuje súkromné repozitáre a mená klientov a pracuje s AI kľúčmi, takže nahrávka nesmie zachytiť obsah.

## Rozhodnutie

- **Služba:** PostHog Cloud v EÚ. Bezplatný plán stačí a SDK vie maskovať nahrávku v prehliadači, ešte pred odoslaním.
- **Rozsah:** len aplikácia na japs.app. Portfóliá sa nenahrávajú nikdy, lebo sú to weby iných ľudí a ich návštevníci by o tom nevedeli.
- **Súhlas:** okno sa pýta pri prvej návšteve a obe odpovede sú rovnocenné. Pred súhlasom sa PostHog ani nestiahne (dynamický import). Voľbu možno zmeniť odkazom Session recording pri prihlásení aj v nastaveniach účtu.
- **Odvolanie:** zastaví nahrávanie a zmaže lokálne dáta PostHogu. Už odoslané nahrávky ostávajú v PostHogu, kým neexpirujú alebo ich vlastník nezmaže.
- **Bez identity:** `person_profiles: "never"` a bez `identify`, takže nahrávka nie je spojená s účtom.
- **Bez cookies:** PostHog ukladá stav do localStorage.
- **Maskovanie:** text cez `maskTextSelector: "*"`, vstupy cez `maskAllInputs`, obrázky cez `blockSelector` a atribúty cez `maskAttributeFn`.
- **Atribúty sú zoznam povolených (`LAYOUT_ATTRIBUTES`).** Maskovanie textu atribúty nepokrýva a test na reálnej nahrávke ukázal názvy projektov v `aria-label`, `href`, `id`, `for` a `placeholder`. Zoznam povolených je bezpečný aj pre budúce komponenty.
- **Nič navyše:** bez autocapture, heatmáp, rage clicks, chýb a sieťových hlavičiek či tiel. Zaznamenáva sa len zobrazenie stránky a nahrávka.
- **Kľúč:** projektový kľúč PostHogu je verejný a je v `deploy.yml`. Bez neho editor nič nenačíta, takže `japs edit` nikdy nenahráva.

## Alternatívy

- **Microsoft Clarity:** zadarmo bez limitov, ale dáta sú u Microsoftu a menej kontroly nad maskovaním.
- **Nahrávanie aj na portfóliách:** zaznamenávalo by návštevníkov cudzích webov bez upozornenia a odporovalo by sľubu bez identifikátorov z ADR 0015.
- **Blokovať celý editor (`blockSelector`):** najjednoduchšie, ale nahrávka by ukázala len sivé plochy.
- **`maskAllElementAttributes`:** maskuje aj `class` a `style`, takže sa rozloženie nedá prehrať.

## Dôsledky

- `posthog-js` je nová závislosť editora, v `apps/dashboard`. Do hlavného balíka sa nedostane, kým človek nesúhlasí. Nedotýka sa ani tém, ani API.
- `core-js` je v `allowBuilds` vypnutý, inak `pnpm install --frozen-lockfile` v CI zlyhá na ignorovanom build skripte.
- V PostHogu treba zapnúť session replay a zahadzovanie IP adries (`apps/api/README.md`).
- Nahrávka ukáže rozloženie, kliky a pohyb, nie obsah. Nedá sa z nej zistiť, ktorý projekt človek upravoval. To je zámer.
- Nový atribút v `LAYOUT_ATTRIBUTES` môže odhaliť obsah. Pridávať len také, ktoré nikdy nenesú dáta používateľa.
- Maskovanie treba po väčšej zmene SDK overiť na skutočnej nahrávke.
- Súhlas je v localStorage, takže sa viaže na prehliadač, nie na účet.
