<script setup lang="ts">
import { HANDLE_MAX, handleProblem } from "@japs/schema";
import { computed, ref, watch } from "vue";
import type { HandleCheck } from "../backend.ts";
import { backend, saveHandle, site } from "../store.ts";

/**
 * The portfolio's address on japs.app (ADR 0013). The GitHub login is suggested; any free name
 * can be picked. The form is checked here, availability by the server as the user types.
 */

const current = computed(() => site.value?.site?.handle ?? null);
const input = ref(current.value ?? site.value?.suggestion ?? "");
watch(
  () => current.value ?? site.value?.suggestion ?? null,
  (handle) => {
    if (handle) input.value = handle;
  },
);
const handle = computed(() => input.value.trim().toLowerCase());
const locked = computed(() => site.value?.site?.nextChangeAt ?? null);
const formProblem = computed(() => (handle.value ? handleProblem(handle.value) : null));

const check = ref<HandleCheck | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  handle,
  (next) => {
    check.value = null;
    clearTimeout(timer);
    if (!next || next === current.value || handleProblem(next)) return;
    timer = setTimeout(async () => {
      try {
        const result = await backend.checkHandle(next);
        if (result.handle === handle.value) check.value = result;
      } catch {
        // Saving reports any problem.
      }
    }, 300);
  },
  { immediate: true },
);

const saving = ref(false);
const error = ref<string | null>(null);
const canSave = computed(
  () => !saving.value && !locked.value && handle.value !== "" && handle.value !== current.value && !formProblem.value && check.value?.available !== false,
);
const problem = computed(() => error.value ?? formProblem.value ?? (check.value?.available === false ? check.value.problem : null));

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    await saveHandle(handle.value);
    check.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div v-if="site?.available" class="address">
    <label for="site-handle"><strong>Address</strong></label>
    <form class="field" @submit.prevent="save()">
      <span class="muted">https://</span>
      <input
        id="site-handle"
        v-model="input"
        type="text"
        :disabled="Boolean(locked)"
        :maxlength="HANDLE_MAX"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        aria-describedby="site-handle-help"
      />
      <span class="muted">.{{ site.domain }}</span>
      <button class="btn" type="submit" :disabled="!canSave">{{ saving ? "Saving…" : current ? "Change" : "Use this address" }}</button>
    </form>
    <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
    <p v-else-if="check?.available && handle !== current" class="ok">Available.</p>
    <p id="site-handle-help" class="muted small">
      <template v-if="locked">You can change the address again on {{ locked.slice(0, 10) }}.</template>
      <template v-else-if="current">
        You can change it now. After a change, the next one waits 30 days, and the old address keeps redirecting to the new
        one for 60 days.
      </template>
      <template v-else-if="site.suggestion">Suggested from your GitHub username. The first publish uses it unless you pick another.</template>
      <template v-else>Your GitHub username can't be an address here. Pick one before the first publish.</template>
    </p>
    <p v-if="site.site?.live" class="small">
      <a :href="site.site.url" target="_blank" rel="noopener">{{ site.site.url }} ↗</a>
    </p>
  </div>
</template>

<style scoped>
.address { display: grid; gap: 6px; margin-top: 12px; }
.field { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.field input { flex: 1 1 10ch; min-width: 8ch; width: auto; }
.field .btn { margin-left: 8px; }
.problem { color: var(--danger); margin: 0; }
.ok { color: var(--ok); margin: 0; }
.small { font-size: 12px; margin: 0; }
</style>
