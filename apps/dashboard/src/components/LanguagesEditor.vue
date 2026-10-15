<script setup lang="ts">
import type { JapsConfigInput } from "@japs/schema";
import { computed } from "vue";
import { defaultLocale, locales, update } from "../store.ts";

/** Languages the default theme has UI strings for (apps/theme-default/src/lib/i18n.ts). */
const SUPPORTED = ["en", "sk", "cs", "de"];

const name = (locale: string) => {
  const native = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  return native.charAt(0).toLocaleUpperCase(locale) + native.slice(1);
};

const selected = computed(() => new Set(locales.value));

/**
 * Turns a language on or off. Profile texts get an empty entry for a new language so the config
 * stays valid; the default language moves if it was switched off. Project texts for a new
 * language come from "Generate texts".
 */
function toggle(locale: string, on: boolean): void {
  update((c) => {
    const next: JapsConfigInput = JSON.parse(JSON.stringify(c));
    const current = next.locales ?? ["en"];
    const list = on ? [...current, locale] : current.filter((l) => l !== locale);
    if (!list.length) return c; // at least one language
    next.locales = SUPPORTED.filter((l) => list.includes(l)).concat(list.filter((l) => !SUPPORTED.includes(l)));
    if (!next.locales.includes(next.defaultLocale ?? "en")) next.defaultLocale = next.locales[0];
    if (next.profile) {
      for (const field of ["headline", "bio"] as const) {
        const text = { ...next.profile[field] };
        for (const l of next.locales) text[l] ??= "";
        for (const l of Object.keys(text)) if (!next.locales.includes(l)) delete text[l];
        next.profile[field] = text;
      }
    }
    return next;
  });
}

function setDefault(locale: string): void {
  update((c) => ({ ...c, defaultLocale: locale }));
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <h2>Languages</h2>
      <p class="muted">The portfolio is published in these languages; the default one is at the root of the site.</p>
    </header>
    <div class="langs">
      <div v-for="l in SUPPORTED" :key="l" class="lang">
        <label class="name">
          <input
            type="checkbox"
            :checked="selected.has(l)"
            :disabled="selected.has(l) && selected.size === 1"
            @change="toggle(l, ($event.target as HTMLInputElement).checked)"
          />
          {{ name(l) }}
        </label>
        <label v-if="selected.has(l)" class="default" :title="`Use ${name(l)} as the default language`">
          <input type="radio" name="default-locale" :checked="defaultLocale === l" @change="setDefault(l)" />
          default
        </label>
      </div>
    </div>
    <p class="muted hint">After adding a language, generate texts again so every project has it.</p>
  </section>
</template>

<style scoped>
.langs { display: grid; gap: 8px; }
.lang { display: flex; align-items: center; gap: 8px; }
.name { display: flex; align-items: center; gap: 8px; }
.default { margin-left: auto; display: flex; align-items: center; gap: 4px; font-size: 13px; color: var(--muted); }
.hint { font-size: 13px; }
</style>
