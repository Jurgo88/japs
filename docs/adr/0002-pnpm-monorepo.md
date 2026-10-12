# ADR 0002: pnpm monorepo s oddeleným jadrom

**Status:** Prijaté · 2026-10-12

## Kontext

To isté jadro (discovery, párovanie, analýza) má poháňať CLI, webový dashboard a neskôr aj Netlify extension. Šablóny musia byť nezávislé od jadra.

## Rozhodnutie

pnpm workspaces s balíkmi:

| Balík | Zodpovednosť | Závisí od |
|---|---|---|
| `@japs/schema` | Zod typy a validácia (`ProjectsFile`, `Portfolio`, `ProjectFacts`) | nič |
| `@japs/core` | discovery, párovanie, filtre, analýza; čisté TS bez UI a bez Node-only API tam, kde sa dá | `schema` |
| `@japs/cli` | `japs discover`, neskôr `japs analyze`, `japs build` | `core`, `schema` |
| `apps/dashboard` | Vue 3 editor (Fáza 3) | `core`, `schema` |
| `apps/theme-default` | Astro téma (Fáza 2) | `schema` |

## Dôvody

- Jedno miesto pre typy, žiadne rozchádzanie medzi CLI a dashboardom.
- `core` používa len `fetch` (Node 20+ aj Edge runtime), takže pôjde aj do Netlify/Supabase Functions.
- pnpm: rýchly, striktné závislosti, natívne workspaces.

## Dôsledky

- Balíky sa zatiaľ nepublikujú na npm; CLI sa spúšťa cez `pnpm japs`. Publikovanie rieši Fáza 4.
- TypeScript project references nie sú nutné; balíky sa konzumujú zo zdrojov (`"exports"` na `src/index.ts`) cez `tsx` a Vitest.
