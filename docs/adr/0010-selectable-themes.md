# ADR 0010: Témy na výber

**Status:** Prijaté · 2026-10-15
**Issue:** #45
**Mení:** [ADR 0001](0001-astro-for-output.md) (závislosti tém, JS v téme), [ADR 0002](0002-pnpm-monorepo.md) (nový balík), [spec `portfolio.json`](../spec/portfolio-json.md) (profil)

## Kontext

Doteraz existovala jediná téma, `apps/theme-default`, a `japs publish` ju mal zadrôtovanú. Predvolená téma je čistá a rýchla, ale pôsobí ako šablóna; portfólio má byť vizitka a ľudia chcú rôzny výraz. Vznikli tri prototypy s výrazným dizajnom a animáciami v GSAP (editoriálny, tmavý „studio“, hravá galéria) a chceme ich ponúknuť všetky. Cloud (ADR 0009) s výberom témy počíta už v dátovom modeli (`portfolios.theme`).

Každá téma by si inak opakovala to isté: načítanie a validáciu `portfolio.json`, jazykové prefixy URL, UI reťazce, Markdown, štatistiky, Astro konfiguráciu.

## Rozhodnutie

1. **Výber v configu.** `japs.config.json` má pole `theme` (predvolene `"default"`). Hodnota je id vstavanej témy z `THEMES` v `@japs/schema`; téma s id `x` žije v `apps/theme-x` ako balík `@japs/theme-x`. Neznáme id je chyba validácie configu. `japs publish`, `pnpm dev` a `pnpm theme:build` zostavujú zvolenú tému; `--theme <id>` ju dočasne prebije na vyskúšanie.
2. **Vstavané témy:** `default`, `editorial`, `studio`, `gallery`, `fieldnotes`, `riot`, `orbit`, `reel`, `swiss`, `retro`, `blueprint`, `metro`, `arena`, `bento`, `newspaper`, `vinyl`, `museum`, `terminal`, `canvas`, `tunnel`, `posters`, `aurora`. Zoznam s názvom a krátkym popisom je v `@japs/schema`, aby ho editor vedel ukázať bez načítania tém. Téma sa do zoznamu pridáva v tom istom PR, v ktorom vzniká.
3. **`@japs/theme-kit`: voliteľné spoločné funkcie.** Načítanie a validácia portfólia, lokalizácia, URL, poradie projektov, štatistiky, Markdown, základné UI reťazce (en, sk, cs, de) a Astro config helper. Vstavané témy ho používajú. **Kontrakt sa nemení:** cudzia téma naďalej potrebuje len `portfolio.json` (a voliteľne `@japs/schema`); kit je pohodlie, nie povinnosť.
4. **JavaScript v téme je povolený,** ak obsah ostane prístupný: bez JS a pri `prefers-reduced-motion: reduce` je všetok text a odkazy viditeľný a použiteľný, animácie sú len nadstavba. Knižnice (GSAP) sú npm závislosti témy zbalené Astrom, nie skripty z CDN; portfólio nesmie závisieť od cudzieho servera.
5. **Profil dostane kontakt a dostupnosť.** Témy chcú výzvu na kontakt a odznak „voľný pre projekty“; vymýšľať ich nesmú. `profile.email` (voliteľný e-mail) a `profile.available` (voliteľné áno/nie) pribudnú v configu aj v `portfolio.json` ako `string | null` a `boolean | null`. Zmena je aditívna a nullable, staršie `portfolio.json` sa načítajú s `null`, takže **`version` ostáva 1**.

## Alternatívy

- **Jedna téma s nastaveniami (farby, písmo, rozloženie):** rýchle varianty, ale tri prototypy sa líšia štruktúrou a animáciami, nie len farbami; konfigurovateľná téma by bola zložitá a aj tak by vyzerala ako jedna šablóna.
- **Témy ako npm balíky mimo repa:** správny smer pre komunitu (Fáza 4), teraz zbytočná réžia s publikovaním a verziovaním.
- **Kopírovanie spoločného kódu do každej témy:** jednoduché, ale chyby a preklady by sa rozchádzali v štyroch kópiách.
- **GSAP z CDN:** menej konfigurácie, ale web by závisel od cudzieho servera a verzie mimo lockfile.
- **Kontakt ako `mailto:` v `profile.links`:** bez zmeny kontraktu, ale téma by musela hádať, ktorý odkaz je hlavný kontakt, a dostupnosť by chýbala úplne.

## Dôsledky

- Nový balík `packages/theme-kit` (`@japs/theme-kit`), závisí od `@japs/schema` a `marked`; beží len pri zostavovaní témy (Node), nie v `core`.
- `apps/theme-default` sa presúva na kit bez vizuálnej zmeny.
- `JapsConfig.theme`, `Profile.email`, `Profile.available`; `Portfolio.profile.email`, `.available`.
- CLI: `japs theme dev|build [--theme <id>]`; koreňové `pnpm dev` a `pnpm theme:build` ho volajú. `japs publish` zostaví tému z configu.
- Editor dostane výber témy (#52); cloud ukladá config ako celok, takže `theme` sa uloží bez zmeny API.
- Pridanie vstavanej témy = nový `apps/theme-<id>` + záznam v `THEMES`.
