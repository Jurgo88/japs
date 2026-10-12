# Spec: AI pipeline

**Status:** Návrh (Fáza 1–2)

## Princíp

LLM **nič nevymýšľa**. Generuje text výhradne z faktov, ktoré deterministicky vytiahneme zo zdrojov. Každé tvrdenie vo výstupe musí mať oporu vo faktoch.

## Kroky

### 1. Extrakcia faktov (bez LLM)

| Zdroj | Fakty |
|---|---|
| Netlify deploy | framework, funkcie (počet, názvy), cron joby, edge funkcie, Lighthouse skóre, posledný deploy, commit správa |
| GitHub repo | description, topics, primárny jazyk, jazyky (%), počet commitov, prvý/posledný commit, počet PR |
| `README.md` | prvých N znakov, nadpisy |
| `package.json` | dependencies → mapovanie na technológie (napr. `@supabase/supabase-js` → Supabase) |
| Živý web | `<title>`, meta description, `og:*`, `lang` |

Výstup: `ProjectFacts` (typ v `@japs/schema`). Uložený v `project_analysis.facts`.

### 2. Generovanie (LLM)

- Model: Claude cez API, štruktúrovaný výstup (tool use / JSON schema = `ProjectCopy`).
- Prompt obsahuje len `ProjectFacts` + inštrukcie k štýlu a jazyku.
- Výstup: `title`, `summary`, `description`, `role`, `tags`.

### 3. Grounding check

- Každý `tag` musí existovať vo faktoch (technológia z dependencies, jazykov alebo frameworku).
- `description` nesmie obsahovať čísla, ktoré nie sú vo faktoch (heuristika: regex na čísla + porovnanie).
- Pri porušení: tvrdenie sa vyhodí, prípadne sa generuje znova (max 1 retry).

### 4. Ľudská kontrola

Všetky texty sú v editore editovateľné. Ručne upravené pole sa označí a pri ďalšej analýze sa neprepíše.

## Privátne repá a klienti

- Pri privátnych repách sa README/kód číta len pre extrakciu faktov, nikdy sa necituje doslovne.
- Pri `anonymize = true` sa do promptu neposiela názov klienta ani doména.

## Náklady

Odhad: 1 projekt ≈ 3–5k vstupných tokenov. Analýza beží len pre zmenené projekty (hash faktov).
