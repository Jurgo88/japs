# Kickoff: JAPS — Just Another Portfolio Site

**Dátum:** 12. 10. 2026
**Vlastník:** Juraj Paluš
**Status:** Fáza 0 hotová → Fáza 1

---

## 1. Cieľ

Odstrániť ručnú tvorbu portfólia. Aplikácia sa pripojí na Netlify a GitHub, nájde nasadené weby a repozitáre, spáruje ich, analyzuje, spraví screenshoty a vygeneruje statické portfólio, ktoré sa dá upraviť a publikovať na Netlify.

**Primárne:** nástroj pre vlastné použitie.
**Sekundárne:** open-source projekt s potenciálom pre freelancerov a malé agentúry (open-core).

---

## 2. Prieskum trhu: čo už existuje

| Produkt | Čo robí | Chýba |
|---|---|---|
| devb.io (OSS) | GitHub profil → AI portfólio, bio, auto-update | Netlify, screenshoty, privátna práca |
| FolioForge | Repá → portfólio, AI zhrnutia, cover art, SEO | Reálne screenshoty, živé weby |
| Jobr AI Portfolio Builder | Výber repozitárov → AI case studies | Netlify, self-hosting |
| GitHired | GitHub aktivita → profil pre recruiterov | Nefunguje pri privátnej/firemnej práci |
| gitprofile (OSS) | Šablóna z GitHub username, bez AI | AI, discovery, editor |
| DevTunechi/devportfolio (OSS) | GitHub OAuth → AI → preview → ZIP/hosting | Netlify, screenshoty |

**Záver:** „GitHub → AI portfólio“ je komodita. Diferenciácia:

1. **Netlify discovery a párovanie** site ↔ repo (`build_settings.repo_url`)
2. **Reálne screenshoty** živých webov (desktop + mobile)
3. **Klientska a privátna práca:** opt-in publikovanie a anonymizácia klienta
4. **Self-hosted výstup:** statický web na vlastnom Netlify a doméne

---

## 3. Cieľová skupina

- **Teraz:** ja (freelance dev, Vue/Supabase/Netlify, klientske projekty)
- **Neskôr:** freelanceri a malé agentúry s prácou na Netlify a privátnymi repami, ktorým portfólio nosí zákazky
- **Nie:** študenti a juniori hľadajúci prácu (preplnený trh, nízka ochota platiť)

---

## 4. MVP rozsah

### V rozsahu
- **Pripojenie zdrojov:** GitHub + Netlify cez Personal Access Token (OAuth neskôr)
- **Discovery:** zoznam Netlify sites + GitHub repos, automatické párovanie, manuálna oprava párov
- **Analýza projektu:** README, `package.json` (stack), jazyky, commit história, live URL → LLM vygeneruje názov, krátky a dlhý popis, rolu, tech tagy
- **Screenshoty:** desktop + mobile, uložené v Supabase Storage
- **Kurátorstvo:** zapnúť/vypnúť projekt, editovať texty, poradie, príznak „klientsky / anonymizovať“
- **Výstup:** `portfolio.json` → Astro šablóna (1–2 témy) → deploy cez Netlify API

### Mimo MVP
- Multi-user UI, registrácia, platby
- Automatický re-sync (cron)
- Viac tém, AI redesign
- Analytika návštev
- Vercel / GitLab ako zdroje

---

## 5. Architektúra

```
┌────────────────────────────────────────────────────┐
│  core (TS balík, bez UI)                           │
│  discovery → matching → analysis → screenshots     │
│                     ↓                              │
│               portfolio.json                       │
└───────┬───────────────┬───────────────┬────────────┘
        │               │               │
     CLI (npx)    Dashboard (Vue 3)   Netlify extension
                        │               (neskôr)
                        ↓
              Astro šablóna → Netlify deploy
```

| Vrstva | Technológia |
|---|---|
| Core | TypeScript, Node.js (samostatný balík) |
| Dashboard / editor | Vue 3 + TS |
| Backend | Supabase (auth, Postgres, Storage), Supabase Edge Functions / Netlify Functions |
| Screenshot worker | Playwright mimo Edge Functions: GitHub Action alebo Browserless |
| AI | Claude API, štruktúrovaný výstup (JSON schema per projekt) |
| Generovaný web | **Astro** (statický výstup, témy) |
| Hosting | Netlify |

**Princípy:**
- Core oddelený od UI, aby rovnaké jadro poháňalo CLI, web aj extension
- Dátový model multi-user ready (Supabase RLS od začiatku), UI zatiaľ pre jedného
- `portfolio.json` ako jediný kontrakt medzi analýzou a šablónou

---

## 6. Dátový model (náčrt)

| Tabuľka | Obsah |
|---|---|
| `sources` | typ (github/netlify), token (šifrovaný), user_id |
| `repos` | provider, full_name, visibility, language, pushed_at |
| `sites` | netlify site_id, názov, primárna doména, framework, posledný produkčný deploy, kontext (production/preview) |
| `projects` | logický projekt; viditeľnosť, anonymizácia, klientsky príznak, poradie |
| `project_repos` | project_id ↔ repo_id (1:N) |
| `project_sites` | project_id ↔ site_id (1:N), zdroj párovania (commit_url / repo_url / review_url / manuálne) |
| `project_analysis` | AI výstup (JSON), zdrojové fakty, verzia, timestamp |
| `screenshots` | project_id, viewport, zdroj (netlify / playwright / upload), storage_path, timestamp |
| `portfolios` | nastavenia, téma, profil (bio, kontakty), posledný deploy |

**Prečo 1:N:** Fáza 0 ukázala, že jedno repo môže poháňať viac webov (`portfolio-v2` → palus.netlify.app aj jurgo.sk). Projekt je teda samostatná entita nad repami aj webmi.

---

## 7. AI pipeline

1. **Extrakcia faktov** (bez LLM): README, dependencies, jazyky, počet commitov, obdobie aktivity, live URL, meta tagy webu
2. **Generovanie** (LLM): len z extrahovaných faktov, výstup validovaný JSON schémou
3. **Grounding:** každé tvrdenie musí mať oporu vo faktoch, inak sa nevypíše
4. **Ľudská kontrola:** všetko editovateľné pred publikovaním

---

## 8. Riziká

| Riziko | Mitigácia |
|---|---|
| AI halucinácie | Generovanie len z faktov, schéma, editor |
| Únik privátnych/klientskych dát | Default „skryté“, explicitný opt-in, anonymizácia |
| Screenshoty webov za loginom / cookie bannery | Manuálny upload, skrývanie bannerov, vlastná URL pre screenshot |
| Rate limity GitHub API | Cache, inkrementálny sync |
| Playwright v serverless | Externý worker |
| Malý záujem trhu | Validácia pred investíciou do multi-user |

---

## 9. Fázy

| Fáza | Výstup |
|---|---|
| **0: Overenie** | Skript: Netlify sites + GitHub repos → spárovaný zoznam na mojich dátach |
| **1: Core** | Analýza + screenshoty → `portfolio.json` |
| **2: Šablóna** | Astro téma z `portfolio.json`, deploy na Netlify → **moje portfólio = demo** |
| **3: Editor** | Vue dashboard: kurátorstvo, úpravy, publish |
| **4: Launch** | README s GIF, open-source (MIT), Show HN, Reddit, dev.to, LinkedIn |
| **5: Podľa signálov** | Netlify extension, Product Hunt, multi-user, platená verzia |

---

## 10. Distribúcia a validácia

**Kanály:** GitHub README s demom → Show HN, r/webdev, r/SideProject, dev.to, LinkedIn (príbeh „ako som si postavil agenta na portfólio“) → Netlify extensions marketplace → Product Hunt.

**Rozhodovacie kritériá (2–3 týždne po launchi):**
- < 100 hviezd, nikto to nepoužíva → ostáva osobný nástroj a referencia
- stovky hviezd, issues, feature requesty → multi-user + hosting
- niekto sa sám spýta na platenie → platená verzia pre freelancerov

**Model:** open-core. Jadro + CLI + šablóna pod MIT, hosting, auto-sync, prémiové témy a vlastná doména platené.

---

## 11. Rozhodnutia

- [x] Primárne pre vlastné použitie, open-source
- [x] Generovaný web: **Astro**
- [x] Stack: Vue 3, TS, Supabase, Netlify, Claude API
- [x] Core oddelený od UI, multi-user ready dátový model

## 12. Otvorené otázky

- [ ] Screenshot worker: GitHub Action vs. Browserless (Fáza 1: lokálny Playwright v CLI, `japs screenshots`; worker sa rieši s dashboardom vo Fáze 3)
- [x] Názov projektu: **JAPS** (Just Another Portfolio Site)
- [x] Monorepo: pnpm workspaces (`packages/schema`, `packages/core`, `packages/cli`, `apps/*`)
- [ ] Šifrovanie tokenov: Supabase Vault vs. vlastné

## 13. Výsledky Fázy 0 (12. 10. 2026)

**Hypotéza:** Netlify weby sa dajú automaticky spárovať s GitHub repami. **Potvrdená.**

**Metóda:** Netlify MCP konektor: zoznam webov → aktuálny deploy každého webu → `commit_url` / `review_url`.

### Čísla

| Metrika | Hodnota |
|---|---|
| Netlify weby | 25 |
| Automaticky spárované (cez deploy) | **19 (76 %)** |
| Napojené na Git, ale deploy bez commitu | 4 (dorieši `build_settings.repo_url` z REST API) |
| Ručný upload bez Gitu | 1 |
| Bez deployu | 1 |
| **Realistický strop s priamym Netlify API** | **23 z 25 (92 %)** |
| Weby s Netlify screenshotom | 22 z 25 |
| Privátne repá | 4 |

### Spárované weby

| Web | Doména | Repo | Framework | Verejné | Posledný deploy |
|---|---|---|---|---|---|
| hermantool | hermantool.netlify.app | HermanTool | Nuxt | áno | 10/2026 |
| chasthub | chasthub.com | ChastHub | Nuxt | áno | 10/2026 |
| loqsy | loqsy.app | loqsy | Nuxt | nie | 09/2026 |
| projentiq | projentiq.com | projentiq | Nuxt | áno | 09/2026 |
| svadobnyfotograf | peterzigo.sk | fotograf | Vite | áno | 08/2026 |
| palus | palus.netlify.app | portfolio-v2 | Nuxt | áno | 05/2026 |
| jurgo | jurgo.sk | portfolio-v2 | Nuxt | áno | 05/2026 |
| her-man | greenstar.sk | herman | Vite | áno | 04/2026 |
| ekonomko | ekonomko.netlify.app | Ekonomko | Vite | áno | 04/2026 |
| pristupio | pristupio.com | pristupio | Vite | nie | 04/2026 |
| ptrzgo | ptrzgo.netlify.app | Ptrzgo | Vite | áno | 07/2025 |
| kokotko | kokotko.netlify.app | Maser | Vite | áno | 04/2025 |
| kajco | sigmatech.site | Kajco | Vite | nie | 03/2025 |
| astonitm | astonitm.netlify.app | AstonITM | Vite | áno | 01/2025 |
| intervue-app | intervue-app.netlify.app | cfg | Vite | áno | 12/2024 |
| jurgocz | jurgo.cz | jurgo.cz | Vite | áno | 11/2024 |
| xpecko | xpecko.fun | xp | Vue | áno | 02/2024 |
| epassport | epassport.netlify.app | ePassport | Vite | nie | 10/2023 |
| shopmaster | shopmaster.netlify.app | shopmaster (cez PR) | Vue | áno | 06/2023 |

### Nespárované

| Web | Dôvod |
|---|---|
| parking-kvi, ehm, foxentry, beamish-zabaione | Napojené na Git (vetva `main`), deploy bez commitu → treba `repo_url` zo site objektu |
| bylinky-spod-tatier | Ručný upload cez API, bez Gitu |
| superlative-wisp-00ec87 | Bez deployu |

### Zistenia, ktoré menia návrh

1. **Netlify deploy je bohatý zdroj faktov:** framework, screenshot, posledný commit a dátum, funkcie, cron joby, Lighthouse skóre. Časť analýzy netreba robiť z repa.
2. **Netlify screenshoty ako fallback:** sú dostupné zadarmo, ale často staré (2023–2025). Aktuálne zábery cez Playwright, Netlify ako záloha.
3. **Párovanie podľa mena nefunguje** (kokotko → Maser, intervue-app → cfg, xpecko → xp). Spoľahlivý je len odkaz na repo z Netlify.
4. **Vzťah 1 repo : N webov** → dátový model upravený (sekcia 6).
5. **Default filtre sú nutné:** testovacie a mŕtve weby (náhodné názvy, PR preview, bez deployu). Filter: produkčný kontext + aktivita.
6. **Spolupracovníci:** iný committer (napr. `ptrzgo` pri fotograf) je signál pre príznak „klientsky projekt“.
7. **Privátne repá:** analýza musí fungovať aj len z dát Netlify a živého webu, ak README nie je dostupné.

### Obmedzenia testu

- GitHub nebol z testovacieho prostredia dostupný (sandbox povoľuje len vopred pripojené repá), takže **repá bez Netlify webu neboli zmapované**. Overiť vo Fáze 1 s vlastným GitHub PAT (`GET /user/repos`).
- Netlify MCP konektor nevracia `build_settings.repo_url`. Aplikácia bude volať Netlify REST API priamo.

### Discovery algoritmus (výstup z Fázy 0)

1. `GET /sites` → pre každý web `build_settings.repo_url` (primárny zdroj)
2. Ak chýba: aktuálny deploy → `commit_url`, potom `review_url`
3. Ak chýba: web označiť ako „bez repa“ (stále sa dá zobraziť ako live projekt)
4. `GET /user/repos` → repá bez webu ako samostatné kandidátne projekty
5. Zoskupiť do projektov (1 repo : N webov), aplikovať default filtre

---

## 14. Ďalší krok

**Fáza 1:** skript v `core`, ktorý s Netlify a GitHub PAT vykoná discovery algoritmus vyššie a vypíše `projects.json`. Overiť doplnenie 4 nespárovaných webov a zmapovať repá bez webu.
