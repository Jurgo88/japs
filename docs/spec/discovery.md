# Spec: Discovery a párovanie

**Status:** Návrh (Fáza 1)
**Implementácia:** `packages/core/src/discovery/`

## Cieľ

Z Netlify a GitHub účtu používateľa zostaviť zoznam **projektov**. Projekt je logická jednotka, ktorá môže mať 0..N repozitárov a 0..N webov.

## Vstupy

| Zdroj | Endpoint | Čo z neho berieme |
|---|---|---|
| Netlify | `GET /api/v1/sites` | `id`, `name`, `url`, `ssl_url`, `custom_domain`, `build_settings.repo_url`, `build_settings.repo_branch`, `published_deploy` |
| Netlify | `GET /api/v1/deploys/{id}` | `committer`, `commit_url`, `review_url`, `framework`, `screenshot_url`, `context`, `published_at`, `committer`, `available_functions`, `function_schedules`, `lighthouse` |
| GitHub | `GET /user` | `login` (vlastník účtu, pre signály klienta) |
| GitHub | `GET /user/repos?affiliation=owner,collaborator` (+ `organization_member`, ak `discovery.includeOrgRepos`) | `full_name`, `owner.type`, `private`, `fork`, `archived`, `homepage`, `language`, `topics`, `pushed_at`, `description` |

Autentifikácia: Personal Access Token (Netlify PAT, GitHub fine-grained PAT s read-only prístupom na metadata a contents).

## Algoritmus

1. **Načítaj weby** cez `GET /sites` (stránkovanie).
2. **Urči repo pre každý web** (prvý úspešný zdroj vyhráva):
   1. `build_settings.repo_url`
   2. aktuálny produkčný deploy → `commit_url` (`https://github.com/{owner}/{repo}/commit/{sha}`)
   3. aktuálny deploy → `review_url` (`https://github.com/{owner}/{repo}/pull/{n}`)
   4. inak web nemá repo (`matchSource: "none"`)
3. **Načítaj repá** cez `GET /user/repos` (stránkovanie).
4. **Aplikuj ručné väzby z configu** (`links` v `japs.config.json`): pripojenie alebo odpojenie webu má prednosť pred všetkým, `matchSource: "manual"`. Odpojený web sa už nepáruje cez `homepage`.
5. **Doplň párovanie z opačnej strany:** repo, ktorého `homepage` sa zhoduje s doménou webu, ktorý ešte nemá repo → `matchSource: "homepage"`.
6. **Zoskup do projektov:** jeden projekt na repo. Všetky weby s rovnakým repom patria do neho (1 repo : N webov). Web bez repa je samostatný projekt. Repo bez webu je samostatný projekt. Každý projekt dostane stabilný kľúč `repo:<owner>/<repo>` alebo `site:<netlify id>`.
7. **Zlúč projekty** podľa `merge` z configu (napr. frontend + API repo). Prvé repo cieľového projektu ostáva primárne.
8. **Aplikuj default filtre** (projekt sa nezmaže, len dostane `hidden: true` a dôvod):
   - repo je `fork` alebo `archived`
   - web nemá žiadny deploy
   - jediný deploy webu je `deploy-preview`
   - posledná aktivita (max z `pushed_at` a `published_at`) je staršia ako `staleAfterMonths` (default 24)
   - názov webu je Netlify náhodný slug (`adjective-noun-xxxxxx`) a nemá vlastnú doménu
   - projekt má privátne repo (aj repo, ktoré GitHub token nevidí)
   - projekt vyzerá ako klientsky (pozri nižšie) a config nemá `isClient: false`
9. **Aplikuj viditeľnosť z configu:** `projects.<key>.hidden` prebije filtre v oboch smeroch; `hiddenReasons` ostávajú pre informáciu.
10. **Výstup:** `projects.json` validovaný schémou `ProjectsFile` z `@japs/schema`. Položky configu, ktoré na nič nesedia (premenované repo, zmazaný web, preklep), sú vo `warnings`.

## Návrh klientskeho projektu

Discovery len **navrhuje** (`Project.clientSignals`); potvrdenie je v configu (`isClient: true`), zamietnutie `isClient: false`. Klientsky projekt ostáva skrytý, kým config nenastaví `hidden: false`.

| Signál | Kedy | Potrebuje GitHub login |
|---|---|---|
| `foreign-committer` | commit aktuálneho deployu urobil niekto iný než vlastník účtu | áno |
| `organization-repo` | repo patrí GitHub organizácii | nie |
| `foreign-repo-owner` | repo patrí inému používateľovi (aj repo, ktoré token nevidí) | áno |

Login sa porovnáva bez ohľadu na veľkosť písmen. Spolupracovníci repa (`/collaborators`) sa zatiaľ nečítajú (extra volanie na repo).

## Normalizácia

- Repo identita: `owner/repo` v lowercase (GitHub je case-insensitive; Netlify vracia `Jurgo88/HermanTool`, API `jurgo88/hermantool`).
- Doména webu: preferuj `custom_domain`, inak `ssl_url`, inak `url`; bez `www.` a koncového `/`.
- Dátumy: ISO 8601 UTC.

## Zdroj párovania (`matchSource`)

| Hodnota | Spoľahlivosť |
|---|---|
| `repo_url` | istá |
| `commit_url` | istá |
| `review_url` | vysoká (repo, z ktorého prišiel PR) |
| `homepage` | stredná (používateľ by mal potvrdiť) |
| `manual` | istá (nastavil používateľ) |
| `none` | bez repa |

## Výsledky Fázy 0 (overenie hypotézy)

Na reálnom účte (25 webov): 19 spárovaných cez deploy, 4 ďalšie dorieši `repo_url`, 1 ručný upload, 1 bez deployu. Detaily v [kickoff.md](../kickoff.md#13-výsledky-fázy-0-12-10-2026).

## Mimo rozsahu

- GitLab, Bitbucket, Vercel (adaptéry neskôr cez rovnaké rozhranie `SiteSource` / `RepoSource`).
- Netlify: viac tímov — v MVP všetky tímy, kde je používateľ členom (`filter=all`). GitHub organizácie sú voliteľné cez `discovery.includeOrgRepos` (default vypnuté).
