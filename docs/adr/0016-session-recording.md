# ADR 0016: Nahrávanie relácií na japs.app

**Status:** Prijaté · 2026-11-01
**Nadväzuje na:** [ADR 0015](0015-visit-statistics.md) (štatistiky návštev)

## Kontext

Vlastník chce vidieť, ako ľudia používajú japs.app, nielen koľko ich je. Cloudflare nahrávanie relácií neponúka. Editor pritom zobrazuje súkromné repozitáre a mená klientov a pracuje s AI kľúčmi, takže nahrávka nesmie zachytiť obsah.

## Rozhodnutie

- **Služba:** PostHog Cloud v EÚ. Bezplatný plán stačí a SDK vie maskovať nahrávku v prehliadači, ešte pred odoslaním.
- **Rozsah:** aplikácia japs.app a živé portfólio účtu v `JAPS_RECORDING_LOGIN`, teda vlastníkovo. Portfóliá ostatných používateľov sa nenahrávajú nikdy, lebo sú to ich weby. Koncepty a CLI sa nenahrávajú.
- **Spustenie:** rozhodnutie vlastníka je nahrávať hneď po načítaní, kým človek nestlačí No thanks. Oznámenie je viditeľné od prvej návštevy. Do Not Track a Global Privacy Control nahrávanie vôbec nespustia.
- **Portfólio:** skript vkladá `theme-kit` a PostHog načíta z jeho CDN. Text ostáva viditeľný, lebo portfólio je verejné a vlastník chce vidieť, čo si ľudia čítali. Vstupy sú skryté.
- **Zastavenie:** No thanks zastaví nahrávanie a zmaže lokálne dáta PostHogu. Už odoslané nahrávky ostávajú v PostHogu, kým neexpirujú alebo ich vlastník nezmaže.
- **Bez identity:** `person_profiles: "never"` a bez `identify`, takže nahrávka nie je spojená s účtom.
- **Bez ukladania v prehliadači:** PostHog beží s `persistence: "memory"`. V localStorage je len odpoveď na oznámenie.
- **Maskovanie v editore:** text cez `maskTextSelector: "*"`, vstupy cez `maskAllInputs`, obrázky cez `blockSelector` a atribúty cez `maskAttributeFn`.
- **Atribúty sú zoznam povolených (`LAYOUT_ATTRIBUTES`).** Maskovanie textu atribúty nepokrýva a test na reálnej nahrávke ukázal názvy projektov v `aria-label`, `href`, `id`, `for` a `placeholder`. Zoznam povolených je bezpečný aj pre budúce komponenty.
- **Nič navyše:** bez autocapture, heatmáp, rage clicks, chýb a sieťových hlavičiek či tiel. Zaznamenáva sa len zobrazenie stránky a nahrávka.
- **Kľúč:** projektový kľúč PostHogu je verejný a je v `deploy.yml`. Bez neho editor nič nenačíta, takže `japs edit` nikdy nenahráva.

## Alternatívy

- **Microsoft Clarity:** zadarmo bez limitov, ale dáta sú u Microsoftu a menej kontroly nad maskovaním.
- **Nahrávanie na všetkých portfóliách:** zaznamenávalo by návštevníkov webov iných ľudí bez ich vedomia a odporovalo by sľubu bez identifikátorov z ADR 0015.
- **Nahrávať až po súhlase (Allow):** pôvodná verzia tohto rozhodnutia. Podľa odporúčania bezpečnejšia v EÚ, ale dá menej nahrávok. Vlastník zvolil automatické spustenie.
- **Blokovať celý editor (`blockSelector`):** najjednoduchšie, ale nahrávka by ukázala len sivé plochy.
- **`maskAllElementAttributes`:** maskuje aj `class` a `style`, takže sa rozloženie nedá prehrať.

## Dôsledky

- **Právne riziko:** nahrávanie začína pred akoukoľvek odpoveďou. Pre EÚ to pravdepodobne nespĺňa požiadavku predchádzajúceho súhlasu. Riziko vedome prijal vlastník. Ak by sa JAPS rozšíril alebo prišla sťažnosť, treba prejsť späť na Allow.
- `posthog-js` je závislosť editora v samostatnom balíku, ktorý sa načíta až pri spustení nahrávania. Portfólio ho berie z CDN PostHogu.
- Bez ukladania v prehliadači je každé načítanie stránky samostatná nahrávka, takže návšteva viacerých stránok portfólia sa nespojí do jednej.
- Oznámenie na portfóliu je len v angličtine. Vloží ho skript, ktorý nepozná texty témy.
- `core-js` je v `allowBuilds` vypnutý, inak `pnpm install --frozen-lockfile` v CI zlyhá na ignorovanom build skripte.
- V PostHogu treba zapnúť session replay a zahadzovanie IP adries (`apps/api/README.md`).
- Nahrávka editora ukáže rozloženie, kliky a pohyb, nie obsah. Nedá sa z nej zistiť, ktorý projekt človek upravoval. To je zámer.
- Nový atribút v `LAYOUT_ATTRIBUTES` môže odhaliť obsah. Pridávať len také, ktoré nikdy nenesú dáta používateľa.
- Maskovanie treba po väčšej zmene SDK overiť na skutočnej nahrávke.
- Odpoveď je v localStorage, takže sa viaže na prehliadač, nie na účet.
