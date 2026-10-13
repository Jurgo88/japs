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

- Model: vymeniteľný poskytovateľ ([ADR 0006](../adr/0006-pluggable-llm-provider.md)), OpenAI-kompatibilné API, default `gpt-5-mini`. Štruktúrovaný výstup `response_format: json_schema` (strict) = `ProjectCopy`; `tags` sú v schéme obmedzené na `enum` z `ProjectFacts.tech`.
- Prompt obsahuje len `ProjectFacts` (kompaktne, bez funkcií vygenerovaných frameworkom) + inštrukcie k štýlu a jazyku (`packages/core/src/analyze/prompt.ts`).
- Výstup sa validuje Zodom (všetky jazyky, `summary` ≤ 160 znakov); pri chybe 1 opakovanie s popisom chyby, potom varovanie a ostáva predošlý text.
- Príkaz `japs analyze` → `analysis.json`. Projekt sa preskočí, ak sa nezmenil hash faktov, model, jazyky ani anonymizácia (`--force` prebije).
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
- Pri `anonymize = true` sa do promptu neposiela názov projektu, popis repa, README, názvy balíkov a funkcií, domény, URL ani titulky webu; ostávajú technológie, jazyky, počty a skóre.

## Náklady

Odhad: 1 projekt ≈ 3–5k vstupných a 1,5–2k výstupných tokenov (2 jazyky). Pre ~20 projektov: `gpt-5-mini` ≈ $0,10, Claude Sonnet 5.5 ≈ $0,50–1, bezplatné tiery (Gemini, Groq) $0. Analýza beží len pre zmenené projekty (hash faktov).
