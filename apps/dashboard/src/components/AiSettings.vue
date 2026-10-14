<script setup lang="ts">
import { computed, ref } from "vue";
import { account, backend, refreshAccount } from "../store.ts";

/** Hosted only (#35): free monthly generations, then an own key. The key never comes back. */

const PROVIDERS = [
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5-mini" },
  { id: "gemini", label: "Google Gemini", defaultModel: "" },
  { id: "groq", label: "Groq", defaultModel: "" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "" },
];

const quota = computed(() => account.value?.quota ?? null);
const provider = ref("openai");
const model = ref("");
const apiKey = ref("");
const busy = ref(false);
const message = ref<{ ok: boolean; text: string } | null>(null);

const needsModel = computed(() => !PROVIDERS.find((p) => p.id === provider.value)?.defaultModel);

async function save(): Promise<void> {
  busy.value = true;
  message.value = null;
  try {
    await backend.saveAiKey(provider.value, model.value.trim(), apiKey.value.trim());
    apiKey.value = "";
    await refreshAccount();
    message.value = { ok: true, text: "Saved. Your key is used for all new texts." };
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) };
  } finally {
    busy.value = false;
  }
}

async function remove(): Promise<void> {
  busy.value = true;
  try {
    await backend.removeAiKey();
    await refreshAccount();
    message.value = { ok: true, text: "Removed. Texts use the free monthly generations again." };
  } catch (err) {
    message.value = { ok: false, text: err instanceof Error ? err.message : String(err) };
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section v-if="quota" class="card">
    <h2>AI texts</h2>
    <template v-if="quota.ownKey">
      <p>
        Texts are generated with <strong>your own key</strong> ({{ quota.ownKey.provider }} · {{ quota.ownKey.model }}), so
        there's no monthly limit. The key is stored encrypted and never shown again.
      </p>
      <p><button class="btn" :disabled="busy" @click="remove()">Remove my key</button></p>
    </template>
    <template v-else>
      <p v-if="quota.shared">
        Free this month: <strong>{{ quota.remaining }}</strong> of {{ quota.limit }} generations left
        <span class="muted">(one per project whose texts are written or rewritten).</span>
      </p>
      <p v-else>This server has no shared AI key: add your own to generate texts.</p>
      <div class="meter" v-if="quota.shared"><span :style="{ width: `${Math.min(100, (quota.used / Math.max(1, quota.limit)) * 100)}%` }" /></div>

      <details :open="!quota.shared || quota.remaining === 0">
        <summary>Use my own AI key</summary>
        <div class="form">
          <label>
            Provider
            <select v-model="provider">
              <option v-for="p in PROVIDERS" :key="p.id" :value="p.id">{{ p.label }}</option>
            </select>
          </label>
          <label>
            Model <span class="muted">{{ needsModel ? "(required)" : "(optional, default gpt-5-mini)" }}</span>
            <input v-model="model" type="text" :placeholder="needsModel ? 'e.g. gemini-flash' : 'gpt-5-mini'" />
          </label>
          <label>
            API key
            <input v-model="apiKey" type="password" autocomplete="off" placeholder="Paste your key" />
          </label>
          <p class="muted small">Stored encrypted on the server, used only for your texts, never shown again.</p>
          <p><button class="btn primary" :disabled="busy || !apiKey.trim() || (needsModel && !model.trim())" @click="save()">Save key</button></p>
        </div>
      </details>
    </template>
    <p v-if="message" :class="message.ok ? 'ok' : 'err'">{{ message.text }}</p>
  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
  display: grid;
  gap: 12px;
}
h2 { margin: 0; font-size: 18px; }
p { margin: 0; }
.meter { height: 6px; border-radius: 999px; background: var(--bg); overflow: hidden; }
.meter span { display: block; height: 100%; background: var(--accent); }
summary { cursor: pointer; font-weight: 600; }
.form { display: grid; gap: 10px; margin-top: 10px; }
.form label { display: grid; gap: 4px; font-weight: 600; }
select { padding: 7px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel); }
.small { font-size: 12px; }
.ok { color: var(--ok); }
.err { color: var(--danger); }
</style>
