# ADR 0014: Licencie

**Status:** Prijaté · 2026-11-01
**Nadväzuje na:** [ADR 0009](0009-hosted-on-cloudflare.md) (hostovaná verzia), [ADR 0010](0010-selectable-themes.md) (témy)
**Mení:** kickoff, sekcia 10 (témy už nie sú všetky pod MIT)

## Kontext

Repo je verejné, ale doteraz nemalo licenciu, takže kód formálne nikto nesmel použiť. Kickoff plánoval MIT pre jadro, CLI a šablónu a otvorenú nechal hostovanú verziu.

Zarábanie nie je priorita, ale vlastník ho nevylučuje: niektoré témy nemusia byť navždy zadarmo a hostovaná verzia môže byť raz platená. Rozhodlo, že licenciu sa dá uvoľniť kedykoľvek, ale vydanú verziu pod MIT už späť vziať nemožno. Kým je vlastník jediným autorom, voľnejšiu licenciu môže zvoliť neskôr.

## Rozhodnutie

| Časť | Licencia |
|---|---|
| `packages/*`, `apps/dashboard`, zvyšok repa | MIT (`LICENSE` v koreni) |
| `apps/theme-default`, `-editorial`, `-swiss`, `-bento` | MIT |
| `apps/api` | AGPL-3.0-only (`apps/api/LICENSE`) |
| Ostatných 18 tém | JAPS Theme License 1.0 (`LICENSE` v priečinku témy) |

- **Dashboard ostáva pod MIT,** lebo ho spúšťa aj CLI cez `japs edit`.
- **Závislosti smerujú len k MIT:** `apps/api` používa `@japs/core` a `@japs/schema`, ale nič pod MIT neimportuje z `apps/api`.
- **AGPL, nie GPL:** hostovaná verzia je webová služba a GPL by jej prevádzku bez zverejnenia úprav nezachytila.
- **JAPS Theme License** dovoľuje zadarmo použiť a upraviť tému na vlastné portfólio, aj keď prináša zákazky. Zakazuje tému predávať alebo šíriť ako tému. Už zverejnené portfóliá môžu ostať online a budúce verzie môžu mať iné podmienky.
- **Výstup:** portfólio používateľa nespadá pod AGPL. Jeho obsah patrí používateľovi.

## Alternatívy

- **Všetko pod MIT:** najjednoduchšie, ale témy aj hostovaná verzia by sa nedali neskôr spoplatniť ani chrániť pred uzavretým predajom. Rozhodnutie by bolo nevratné.
- **FSL pre `apps/api`:** silnejšia ochrana pred konkurenčnou službou, ale API by nebolo open source a pri launchi by to mohlo vyvolať kritiku.
- **Licencia „non-commercial“ pre témy (napríklad CC BY-NC):** portfólio freelancera sa dá považovať za komerčné použitie.
- **Súkromné repo pre témy už teraz:** silnejšia kontrola, ale lokálni používatelia by o témy prišli a zbytočne by sa skomplikoval build.

## Dôsledky

- Nová téma musí mať licenciu: `LICENSE` v priečinku a pole `license` v `package.json`.
- Vlastná licencia nie je taká preverená ako MIT. Pred skutočným predajom tém ju treba dať skontrolovať právnikovi.
- Licencia určuje, čo je dovolené, ale kopírovaniu nezabráni: HTML a CSS témy sú viditeľné na každom portfóliu.
- Spoplatnenie témy znamená presun do súkromného repa a úpravu `publish.yml`. Staršie verzie sa dajú používať ďalej podľa ich licencie.
- Pri cudzích príspevkoch do `apps/api` alebo do tém bude na neskoršiu zmenu licencie treba súhlas autorov (CLA). Dovtedy to netreba riešiť.
- GSAP (témy `editorial`, `gallery`, `orbit`, `studio`) má vlastnú licenciu Webflow a nie je súčasťou MIT. Je to len závislosť, v repe nie je. Komerčné použitie dovoľuje a zakazuje nástroje na vizuálnu tvorbu animácií bez kódu, čo JAPS nie je.
- Názov JAPS žiadna z licencií nechráni.
