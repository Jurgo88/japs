<script setup lang="ts">
import { editLocale, locales } from "../store.ts";

/**
 * Switches the language being edited (shared across the editor). Each tab can flag that the
 * language still misses text ("missing") or has hand-written text ("edited").
 */
const props = defineProps<{ status?: Record<string, "missing" | "edited" | null> }>();

const label = (locale: string) => locale.toUpperCase();
const title = (locale: string) => {
  const s = props.status?.[locale];
  return s === "missing" ? `${label(locale)}: some texts are missing` : s === "edited" ? `${label(locale)}: has your own edits` : label(locale);
};

function onKey(e: KeyboardEvent, index: number): void {
  const next = e.key === "ArrowRight" ? index + 1 : e.key === "ArrowLeft" ? index - 1 : null;
  if (next === null) return;
  const list = locales.value;
  const target = list[(next + list.length) % list.length]!;
  editLocale.value = target;
  ((e.currentTarget as HTMLElement).parentElement?.children[(next + list.length) % list.length] as HTMLElement | undefined)?.focus();
}
</script>

<template>
  <div v-if="locales.length > 1" class="tabs" role="tablist" aria-label="Language">
    <button
      v-for="(l, i) in locales"
      :key="l"
      type="button"
      role="tab"
      :aria-selected="editLocale === l"
      :tabindex="editLocale === l ? 0 : -1"
      :title="title(l)"
      :class="{ active: editLocale === l }"
      @click="editLocale = l"
      @keydown="onKey($event, i)"
    >
      {{ label(l) }}
      <span v-if="props.status?.[l] === 'missing'" class="dot missing" aria-hidden="true" />
      <span v-else-if="props.status?.[l] === 'edited'" class="dot edited" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
}
button {
  position: relative;
  border: 0;
  background: none;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--muted);
  cursor: pointer;
}
button.active { background: var(--panel); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08); }
.dot { position: absolute; top: 3px; right: 4px; width: 6px; height: 6px; border-radius: 50%; }
.dot.missing { background: var(--warn); }
.dot.edited { background: var(--accent); }
</style>
