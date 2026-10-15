<script setup lang="ts">
import { setCopyText } from "@japs/core";
import type { LocalizedText } from "@japs/schema";
import { computed, reactive, watch } from "vue";
import { draft, editLocale, locales, update } from "../store.ts";

/** One project text in the language being edited (LocaleTabs); edits are stored as overrides. */

type Field = "title" | "summary" | "description" | "role";

const props = defineProps<{
  projectKey: string;
  field: Field;
  label: string;
  generated: LocalizedText | undefined;
  multiline?: boolean;
  maxLength?: number;
  hint?: string;
}>();

const override = computed(() => draft.value.projects?.[props.projectKey]?.copy?.[props.field] ?? {});
const current = (locale: string) => override.value[locale] ?? props.generated?.[locale] ?? "";

// Local text while typing; committed on change so trimming never fights the cursor.
const text = reactive<Record<string, string>>({});
watch(
  [override, () => props.generated, locales],
  () => {
    for (const l of locales.value) text[l] = current(l);
  },
  { immediate: true },
);

const l = computed(() => editLocale.value);
const edited = computed(() => override.value[l.value] !== undefined);
const length = computed(() => text[l.value]?.length ?? 0);
const id = computed(() => `${props.projectKey}-${props.field}`);

function commit(): void {
  update((c) => setCopyText(c, props.projectKey, props.field, l.value, text[l.value] ?? "", props.generated));
}
function reset(): void {
  text[l.value] = props.generated?.[l.value] ?? "";
  commit();
}
</script>

<template>
  <div class="field">
    <div class="head">
      <label :for="id">{{ props.label }}</label>
      <span v-if="edited" class="badge accent" title="Your text; generating again won't overwrite it">edited</span>
      <button v-if="edited && props.generated?.[l]" type="button" class="link" title="Back to the generated text" @click="reset()">Reset</button>
      <span v-if="props.maxLength" class="count" :class="{ over: length > props.maxLength }">{{ length }}/{{ props.maxLength }}</span>
    </div>
    <textarea
      v-if="props.multiline"
      :id="id"
      v-model="text[l]"
      rows="7"
      :placeholder="props.generated?.[l] ? '' : 'Not written yet. Generate texts, or write your own.'"
      @change="commit()"
    />
    <input
      v-else
      :id="id"
      v-model="text[l]"
      type="text"
      :placeholder="props.generated?.[l] ? '' : 'Not written yet'"
      @change="commit()"
    />
    <span v-if="props.hint" class="hint muted">{{ props.hint }}</span>
  </div>
</template>

<style scoped>
.field { display: grid; gap: 6px; }
.head { display: flex; align-items: center; gap: 8px; }
.head label { font-weight: 600; }
.link { border: 0; background: none; padding: 0; color: var(--accent); font-size: 12px; cursor: pointer; }
.link:hover { text-decoration: underline; }
.count { margin-left: auto; font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.count.over { color: var(--warn); font-weight: 700; }
.hint { font-size: 12px; }
textarea { line-height: 1.55; }
</style>
