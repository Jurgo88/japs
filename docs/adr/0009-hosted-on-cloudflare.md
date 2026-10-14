# ADR 0009: Hostovaná verzia pre viacerých používateľov na Cloudflare

**Status:** Prijaté · 2026-10-14
**Issue:** #28
**Mení:** kickoff, sekcia 5 (Backend: Supabase); [data-model.md](../spec/data-model.md) pre hostovaný režim

## Kontext

JAPS má slúžiť aj iným používateľom: prihlásia sa, pripoja svoj Netlify a GitHub, vyberú projekty v editore a portfólio sa nasadí na ich Netlify. Generovanie textov platí vlastník služby (s limitom), nad limit si používateľ zadá vlastný kľúč. Všetko má bežať na bezplatných plánoch.

Požiadavky, ktoré rozhodujú:

- dlhé úlohy (discovery + fakty + LLM pre desiatky projektov trvajú minúty),
- screenshoty potrebujú prehliadač (Playwright v serverless nebeží),
- tokeny používateľov (GitHub, Netlify, LLM kľúč) musia ostať na serveri a šifrované,
- `@japs/core` je písaný len s `fetch` a Web Crypto (ADR 0002), aby bežal aj mimo Node.

## Rozhodnutie

### Platforma: Cloudflare

| Potreba | Služba |
|---|---|
| API, OAuth, servovanie dashboardu | **Workers** (+ static assets) |
| Dáta | **D1** (SQLite) |
| Screenshoty | **R2** |
| Dlhé úlohy | **Workflows** (prípadne Queues) |
| Prehliadač pre screenshoty | **Browser Rendering**, záloha Netlify screenshot |

Bez platobnej karty, bez uspávania, core beží bez zmien.

### Prihlásenie a pripojenia

- **Prihlásenie cez GitHub App** (nie OAuth App). OAuth App má na privátne repá len rozsah `repo`, ktorý dáva aj zápis; GitHub App dostane len **Metadata: read** a **Contents: read**. Používateľský token GitHub App expiruje (8 h) a obnovuje sa refresh tokenom. Privátne repá vidí aplikácia až po jej inštalácii na ne; bez inštalácie JAPS pracuje s verejnými repami a s tým, čo dá Netlify (Fáza 0, zistenie 7).
- **Netlify cez OAuth2 aplikáciu** („Connect Netlify“), ako Netlify vyžaduje pre verejné integrácie. Personal access tokeny sa v hostovanej verzii nepoužívajú.
- **Relácia:** náhodný 256-bitový token v cookie `HttpOnly; Secure; SameSite=Lax`; v D1 je len jeho SHA-256, takže únik databázy neprezradí prihlásenia. Platnosť 30 dní, odhlásenie ju zmaže.
- **OAuth `state`** v krátkodobej podpísanej cookie (ochrana proti CSRF pri návrate z OAuth).

### Tajomstvá

- Tokeny poskytovateľov a vlastné LLM kľúče používateľov sú v D1 **šifrované AES-GCM** (256-bit kľúč v Worker secret `ENCRYPTION_KEY`), formát `v1:<iv+ciphertext>` kvôli budúcej rotácii kľúča.
- Do prehliadača nejde nikdy žiadny token ani kľúč; dashboard vidí len „pripojené ako <login>“.

### Dáta: pracovný priestor ako dokumenty

D1 drží pre každého používateľa tie isté dokumenty, ktoré CLI drží v súboroch: `config`, `projects`, `facts`, `analysis`, `screenshots`, `publish` (JSON validovaný schémami z `@japs/schema`). Core funkcie (`buildProjects`, `extractFacts`, `analyzeProjects`, `buildPortfolio`, `deploySite`) tak bežia bez zmien a lokálny aj hostovaný režim zdieľajú logiku. Normalizované tabuľky z data-model.md sa zavedú, až keď bude treba dotazovať naprieč projektmi (napr. štatistiky).

### Izolácia používateľov bez RLS

D1 nemá Row Level Security. Všetok prístup k dátam ide cez jednu vrstvu (`apps/api/src/db.ts`), ktorej každá funkcia berie `userId` a vkladá ho do `WHERE`. Inde v kóde sa SQL nepíše. Izoláciu pokrývajú testy (dvaja používatelia, žiadny nevidí dáta druhého).

### LLM náklady

Mesačný bezplatný limit generovaní na používateľa na kľúč vlastníka (tabuľka `usage`), nad limit vlastný kľúč používateľa (šifrovaný). Podrobnosti v #35.

## Alternatívy

- **Supabase:** auth, Postgres s RLS a storage hotové, vlastník ho pozná. Bezplatné projekty sú obsadené, projekt sa po týždni nečinnosti uspí, Edge Functions majú krátky časový limit a screenshoty by aj tak potrebovali ďalšiu službu.
- **Firebase:** na bezplatnom pláne Spark nie sú Cloud Functions ani (od 2/2026) Cloud Storage; Blaze vyžaduje kartu a nemá strop nákladov. Firestore je dokumentový, náš model relačný.
- **Neon + Netlify Functions:** Postgres zadarmo, ale bez auth, úložiska, dlhých úloh aj prehliadača; databáza sa uspáva.

## Dôsledky

- Nový balík `apps/api` (Cloudflare Worker, Hono). Lokálny režim (CLI, `pnpm editor`) ostáva a zdieľa core.
- Prihlásenie a izoláciu si udržiavame sami; každá nová cesta API musí ísť cez dátovú vrstvu a mať test izolácie.
- Bezplatné limity Cloudflare (subrequesty na volanie, CPU na krok, čas prehliadača) určujú tvar úloh: jeden projekt na krok workflow.
- Vlastník musí zaregistrovať GitHub App a Netlify OAuth aplikáciu a nastaviť Worker secrets (návod v `apps/api/README.md`).
