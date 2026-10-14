<script setup lang="ts">
import { setCopyText } from "@japs/core";
import type { LocalizedText } from "@japs/schema";
import { computed, reactive, watch } from "vue";
import { draft, locales, update } from "../store.ts";

type Field = "title" | "summary" | "description" | "role";

const props = defineProps<{
  projectKey: string;
  field: Field;
  label: string;
  generated: LocalizedText | undefined;
  multiline?: boolean;
  maxLength?: number;
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

function commit(locale: string): void {
  update((c) => setCopyText(c, props.projectKey, props.field, locale, text[locale] ?? "", props.generated));
}

function reset(locale: string): void {
  text[locale] = props.generated?.[locale] ?? "";
  commit(locale);
}
</script>

<template>
  <div class="field">
    <div class="label">{{ label }}</div>
    <div v-for="l in locales" :key="l" class="row">
      <span class="locale">{{ l.toUpperCase() }}</span>
      <textarea
        v-if="multiline"
        v-model="text[l]"
        :rows="6"
        :placeholder="generated?.[l] ? '' : 'No generated text — run japs analyze, or write your own'"
        @change="commit(l)"
      />
      <input
        v-else
        v-model="text[l]"
        type="text"
        :placeholder="generated?.[l] ? '' : 'No generated text'"
        @change="commit(l)"
      />
      <div class="side">
        <span v-if="override[l] !== undefined" class="badge accent" title="Your text; analysis won't overwrite it">edited</span>
        <button v-if="override[l] !== undefined && generated?.[l]" class="btn small" @click="reset(l)">Reset</button>
        <span v-if="maxLength && (text[l]?.length ?? 0) > maxLength" class="badge warn">{{ text[l]?.length }}/{{ maxLength }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field { display: grid; gap: 6px; }
.label { font-weight: 600; }
.row { display: grid; grid-template-columns: 28px minmax(0, 1fr) 90px; gap: 8px; align-items: start; }
.locale { font-size: 11px; font-weight: 700; color: var(--muted); padding-top: 8px; }
.side { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; padding-top: 4px; }
</style>
