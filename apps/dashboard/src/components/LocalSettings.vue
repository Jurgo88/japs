<script setup lang="ts">
import { onMounted, ref } from "vue";
import { backend } from "../store.ts";
import type { LocalEnvironment } from "../backend.ts";

/**
 * Settings for `japs edit` (local): the same sections as the hosted ones, read from .env.
 * Tokens can't be entered here: they belong in .env, never in a browser.
 */

const props = defineProps<{ section: "connections" | "ai" }>();
const env = ref<LocalEnvironment | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    env.value = await backend.environment();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  }
});

const providers = [
  { id: "github" as const, name: "GitHub", short: "GH", variable: "GITHUB_TOKEN", role: "Repositories (read-only). Without it, repos are inferred from site deploys." },
  { id: "netlify" as const, name: "Netlify", short: "Ne", variable: "NETLIFY_TOKEN", role: "Sites to import, and publishing to Netlify." },
  { id: "cloudflare" as const, name: "Cloudflare", short: "Cl", variable: "CLOUDFLARE_API_TOKEN", role: "Pages projects and Workers to import, and publishing to Pages." },
];
</script>

<template>
  <section v-if="props.section === 'connections'" class="card">
    <header class="card-head">
      <h2>Connections</h2>
      <p class="muted">Locally, JAPS uses the tokens in <code>.env</code> in the repository root. Edit that file, then restart <code>pnpm editor</code>.</p>
    </header>
    <ul v-if="env" class="list">
      <li v-for="p in providers" :key="p.id" class="row">
        <span class="logo" :class="p.id" aria-hidden="true">{{ p.short }}</span>
        <span class="info">
          <strong>{{ p.name }}</strong>
          <span class="muted">{{ p.role }}</span>
        </span>
        <span v-if="env.tokens[p.id]" class="state ok">● {{ p.variable }} set</span>
        <span v-else class="state muted">{{ p.variable }} not set</span>
      </li>
    </ul>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p class="muted small">See <code>.env.example</code> for where to create each token and which permissions it needs.</p>
  </section>

  <section v-else class="card">
    <header class="card-head">
      <h2>AI texts</h2>
      <p class="muted">Project texts are written by the model configured in <code>.env</code>; you pay the provider directly.</p>
    </header>
    <dl v-if="env" class="facts">
      <dt>Provider</dt>
      <dd>{{ env.llm.provider }}</dd>
      <dt>Model</dt>
      <dd>{{ env.llm.model ?? "—" }}</dd>
      <dt>Status</dt>
      <dd :class="env.llm.ready ? 'ok' : 'err'">{{ env.llm.ready ? "Ready" : env.llm.problem }}</dd>
    </dl>
    <p v-else-if="error" class="err">{{ error }}</p>
    <p class="muted small">
      Set <code>JAPS_LLM_PROVIDER</code> (openai, gemini, groq, openrouter, ollama), <code>JAPS_LLM_MODEL</code> and the
      provider's key, e.g. <code>OPENAI_API_KEY</code>.
    </p>
  </section>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; }
.row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-top: 1px solid var(--border);
}
.row:first-child { border-top: 0; }
.logo {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: #24292f;
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
}
.logo.netlify { background: #00ad9f; }
.logo.cloudflare { background: #f38020; }
.info { display: grid; min-width: 0; }
.info .muted { font-size: 13px; }
.state { font-size: 13px; white-space: nowrap; }
.state.ok, .ok { color: var(--ok); }
.err { color: var(--danger); }
.small { font-size: 12px; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; font-weight: 600; }
@media (max-width: 640px) {
  .row { grid-template-columns: 36px minmax(0, 1fr); }
  .state { grid-column: 2; }
}
</style>
