# ADR 0005: Viacjazyčné portfólio (SK + EN)

**Status:** Prijaté · 2026-10-13
**Issue:** #2

## Kontext

Portfólio má vychádzať v slovenčine aj angličtine: slovenskí klienti aj zahraniční. `portfolio.json` je kontrakt medzi analýzou a témami ([spec](../spec/portfolio-json.md)), takže tvar lokalizovaných textov musíme rozhodnúť skôr, než vznikne prvá téma (Fáza 2) a generovanie textov (issue #10).

Iní používatelia (open-source) budú chcieť iné jazyky, takže `sk` a `en` nesmú byť zadrôtované.

## Rozhodnutie

1. **Lokalizované pole = objekt jazyk → text.** Typ `LocalizedText`, napr. `{ "en": "…", "sk": "…" }`. Jeden projekt, jedna štruktúra; jazykovo neutrálne dáta (odkazy, obdobie, screenshoty, tagy) sa neduplikujú.
2. **Zoznam jazykov je na vrchu súboru:** `locales: ["en", "sk"]` a `defaultLocale: "en"`. Jazyk je kód BCP 47 (`en`, `sk`, `pt-BR`). Validácia vyžaduje, aby každé `LocalizedText` obsahovalo **všetky** deklarované jazyky; téma tak nikdy nemusí riešiť chýbajúci preklad.
3. **Čo sa lokalizuje:**

   | Lokalizované | Neutrálne |
   |---|---|
   | `profile.headline`, `profile.bio` | `profile.name`, `profile.location`, `profile.links` |
   | `project.title`, `summary`, `description`, `role` | `slug`, `period`, `tags`, `links`, `featured` |
   | `client.label`, `screenshots[].alt` | `screenshots[].src`, `viewport` |

   Tagy sú názvy technológií (Vue, Supabase), ktoré sa neprekladajú.
4. **Generovanie:** LLM vytvorí všetky jazyky v jednom volaní z tých istých faktov (konzistentný obsah, nižšia cena než samostatné volania). Výstupná schéma `ProjectCopy` používa `LocalizedText`.
5. **Téma:** generuje stránku pre každý jazyk z `locales`; predvolený jazyk bez prefixu (`/`), ostatné s prefixom (`/sk/`), plus `hreflang`. Routing je zodpovednosť témy (Astro i18n), kontrakt ho nepredpisuje.
6. **Verzia kontraktu ostáva `1`.** `portfolio.json` zatiaľ nikto nekonzumuje (žiadna téma ani vydanie), takže v1 je definovaná rovno ako viacjazyčná. Jednojazyčné portfólio = `locales` s jedným prvkom.

## Alternatívy

- **Kópia celého portfólia na jazyk** (`{ "sk": Portfolio, "en": Portfolio }` alebo `portfolio.sk.json`): jednoduché pre tému, ale duplikuje neutrálne dáta a tie sa môžu rozísť (iné poradie, iné screenshoty).
- **Preklad v téme (i18n súbory):** funguje pre UI reťazce témy, nie pre obsah projektov.
- **Pevné polia `titleSk`, `titleEn`:** najjednoduchšie, ale zadrôtuje dva jazyky.

## Dôsledky

- `@japs/schema`: nové `Locale`, `LocalizedText`; `Portfolio` má `locales`, `defaultLocale` a kontrolu úplnosti prekladov.
- `japs.config.json` ([ADR 0004](0004-japs-config-json.md)) deklaruje `locales` a `defaultLocale`; lokalizované texty v configu (profil, `copy`, `clientLabel`) majú rovnaký tvar.
- Ručná úprava jedného jazyka v configu neprepíše druhý: override sa aplikuje po jazykoch.
- Grounding check (issue #11) kontroluje každý jazyk samostatne.
- Téma musí mať vlastné UI reťazce („Projekty“, „Live demo“) pre každý jazyk, ktorý podporuje; nepodporovaný jazyk = chyba buildu témy.
