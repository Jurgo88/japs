# Spec: AI pipeline

**Status:** Návrh (Fáza 1–2)

## Princíp

LLM **nič nevymýšľa**. Generuje text výhradne z faktov, ktoré deterministicky vytiahneme zo zdrojov. Každé tvrdenie vo výstupe musí mať oporu vo faktoch.

## Kroky

### 1. Extrakcia faktov (bez LLM)

| Zdroj | Fakty |
|---|---|
| Netlify deploy | framework, funkcie (počet, názvy), cron joby, edge funkcie, Lighthouse skóre, posledný deploy, commit správa |
| GitHub repo | description, topics, primárny jazyk, jazyky (%), počet commitov, prvý/posledný commit, počet PR (všetky stavy) |
| `README.md` | prvých N znakov, nadpisy |
| `package.json` | dependencies → mapovanie na technológie (napr. `@supabase/supabase-js` → Supabase) |
| Živý web | `<title>`, meta description, `og:*`, `lang` |

Výstup: `ProjectFacts` (typ v `@japs/schema`), príkaz `japs facts` → `facts.json`. Neskôr v `project_analysis.facts`.

**Implementácia** (`packages/core/src/facts/`):

| Časť | Ako |
|---|---|
| Commity | `GET /repos/{r}/commits?per_page=1` → počet z `Link rel="last"`, posledný commit; prvý commit = posledná stránka. 409 = prázdne repo. Len predvolená vetva. |
| Pull requesty | `GET /repos/{r}/pulls?state=all&per_page=1` + `Link` (bežný rate limit, nie Search API s 30 req/min) |
| Jazyky | `GET /repos/{r}/languages` → % (1 desatinné miesto) |
| README | `GET /repos/{r}/readme` (raw) → úryvok max. 1500 znakov bez obrázkov, odznakov, HTML a kódu + nadpisy |
| `package.json` | koreň + workspace balíky (`workspaces` alebo `pnpm-workspace.yaml`, max. 10) → názvy závislostí |
| Netlify deploy | `GET /deploys/{id}`: commit (`title`), committer, funkcie (`n`, `g` = generátor frameworku), crony, edge funkcie, Lighthouse `averages` |
| Živý web | `fetch` s timeoutom 10 s, regex parser `<head>` (core nemá DOM) |
| Technológie | `deriveTech`: mapovacia tabuľka závislostí (`tech.ts`, dá sa rozširovať) + jazyky ≥ 5 % + topics + Netlify framework/funkcie; každá technológia nesie `evidence` |

- Každá časť zlyháva samostatne do `warnings`, zvyšok faktov ostáva.
- **Cache:** fakty repa sa z predošlého `facts.json` použijú znova, kým sa nezmení `pushedAt`. Weby a živé stránky sa sťahujú vždy.
- **Hash:** SHA-256 z faktov (Web Crypto). Analýza beží len pre projekty so zmeneným hashom.
- Predvolene len viditeľné projekty; `--all` alebo `--project <key>` pre ostatné.
- Repo, ktoré token nevidí, má `accessible: false` a fakty idú len z Netlify a živého webu (Fáza 0, zistenie 7).

### 2. Generovanie (LLM)

- Model: Claude cez API, štruktúrovaný výstup (tool use / JSON schema = `ProjectCopy`).
- Prompt obsahuje len `ProjectFacts` + inštrukcie k štýlu a jazyku.
- Výstup: `title`, `summary`, `description`, `role` ako `LocalizedText` vo všetkých jazykoch z configu, v jednom volaní ([ADR 0005](../adr/0005-bilingual-portfolio.md)); `tags` sú jazykovo neutrálne.

### 3. Grounding check

- Každý `tag` musí existovať vo faktoch (technológia z dependencies, jazykov alebo frameworku).
- `description` nesmie obsahovať čísla, ktoré nie sú vo faktoch (heuristika: regex na čísla + porovnanie).
- Kontroluje sa každý jazyk samostatne.
- Pri porušení: tvrdenie sa vyhodí, prípadne sa generuje znova (max 1 retry).

### 4. Ľudská kontrola

Všetky texty sú v editore editovateľné. Ručne upravené pole sa označí a pri ďalšej analýze sa neprepíše.

Do Fázy 3 (bez editora) sa ručné úpravy zapisujú do `japs.config.json` → `projects.<key>.copy` ([ADR 0004](../adr/0004-japs-config-json.md)). Override platí po jazykoch: upravená slovenčina neprepíše vygenerovanú angličtinu.

## Privátne repá a klienti

- Pri privátnych repách sa README/kód číta len pre extrakciu faktov, nikdy sa necituje doslovne.
- Pri `anonymize = true` sa do promptu neposiela názov klienta ani doména.

## Náklady

Odhad: 1 projekt ≈ 3–5k vstupných tokenov. Analýza beží len pre zmenené projekty (hash faktov).
