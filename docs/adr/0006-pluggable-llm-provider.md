# ADR 0006: Vymeniteľný LLM poskytovateľ

**Status:** Prijaté · 2026-10-13
**Issue:** #10
**Mení:** kickoff, sekcia 5 (AI: Claude API)

## Kontext

Kickoff počítal s Claude API. Pri implementácii generovania textov (#10) sa ukázalo:

- vlastník má momentálne len OpenAI kľúč,
- open-source používatelia budú mať rôznych poskytovateľov, niektorí chcú bezplatné tiery (Gemini, Groq) alebo lokálny model (Ollama),
- náklady sú pri každom rozumnom modeli nízke (centy až jednotky dolárov za celé portfólio), takže výber modelu je skôr otázka kvality slovenčiny a súkromia než ceny.

## Rozhodnutie

1. **Rozhranie v core:** `LlmClient` s jedinou metódou „vráť JSON podľa schémy“ (`generateJson`). Analýza (`analyze.ts`) pozná len toto rozhranie, nie konkrétneho poskytovateľa.
2. **Prvý adaptér: OpenAI-kompatibilné Chat Completions API** cez `fetch` (bez SDK, core ostáva bez závislostí). Jeden adaptér pokrýva OpenAI, Google Gemini (OpenAI-kompatibilný endpoint), Groq, OpenRouter a Ollamu; líšia sa len `baseUrl`, kľúčom a modelom.
3. **Štruktúrovaný výstup:** `response_format: json_schema` (strict). Odpoveď sa aj tak validuje Zodom; pri neplatnom výstupe 1 opakovanie.
4. **Konfigurácia cez `.env`** (tajomstvá a voľba poskytovateľa nepatria do `japs.config.json`):

   | Premenná | Význam | Default |
   |---|---|---|
   | `JAPS_LLM_PROVIDER` | predvoľba `openai` / `gemini` / `groq` / `openrouter` / `ollama` | `openai` |
   | `JAPS_LLM_MODEL` | model | podľa predvoľby (`openai` → `gpt-5-mini`) |
   | `JAPS_LLM_BASE_URL` | vlastný endpoint (prebije predvoľbu) | podľa predvoľby |
   | `JAPS_LLM_API_KEY` | kľúč (prebije kľúč predvoľby) | `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY` |

5. **Anthropic adaptér** príde, keď bude kľúč; použije oficiálne `@anthropic-ai/sdk` (nie OpenAI-kompatibilnú vrstvu), aby fungovali štruktúrované výstupy a cache.

## Alternatívy

- **Len Claude API:** pôvodný plán; blokuje vlastníka aj používateľov bez Anthropic kľúča.
- **Len OpenAI napevno:** najmenej kódu, ale pri prvej zmene poskytovateľa prerábka a zamknutie open-source používateľov.
- **Knižnica typu Vercel AI SDK / LangChain:** pohodlné, ale ťažká závislosť v core, ktoré má bežať aj v Edge Functions; potrebujeme jedno volanie.

## Dôsledky

- Kvalita textov závisí od modelu, najmä slovenčina pri malých a bezplatných modeloch. Grounding check (#11) chráni pred vymyslenými faktami, nie pred gramatikou.
- **Súkromie:** do modelu idú fakty vrátane úryvkov README z privátnych rep. Pri `anonymize: true` sa posielajú bez názvov, domén a URL. Výber poskytovateľa (a jeho podmienok spracovania dát) je na používateľovi; README to uvádza.
- `analysis.json` zaznamenáva poskytovateľa a model pri každom projekte, aby bolo jasné, čo text vygenerovalo.
