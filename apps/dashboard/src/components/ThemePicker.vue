<script setup lang="ts">
import { THEMES, type ThemeId } from "@japs/schema";
import { computed } from "vue";
import { draft, isCloud, update } from "../store.ts";

const current = computed<ThemeId>(() => draft.value.theme ?? "default");

function choose(id: ThemeId): void {
  update((c) => {
    // The config stores only differences from the defaults (ADR 0007).
    const { theme: _, ...rest } = c;
    return id === "default" ? rest : { ...rest, theme: id };
  });
}
</script>

<template>
  <section class="card">
    <header class="card-head">
      <h2>Theme</h2>
      <p class="muted">How the published portfolio looks. Texts, projects and languages stay the same in every theme.</p>
    </header>

    <div class="grid" role="radiogroup" aria-label="Theme">
      <button
        v-for="theme in THEMES"
        :key="theme.id"
        class="theme"
        role="radio"
        :aria-checked="current === theme.id"
        :class="{ active: current === theme.id }"
        @click="choose(theme.id)"
      >
        <img :src="['fieldnotes', 'riot', 'orbit'].includes(theme.id) ? `/themes/${theme.id}.svg` : `/themes/${theme.id}.jpg`" :alt="`${theme.label} theme preview`" width="640" height="400" loading="lazy" />
        <span class="name">
          {{ theme.label }}
          <span v-if="current === theme.id" class="badge">Selected</span>
        </span>
        <span class="muted desc">{{ theme.description }}</span>
      </button>
    </div>

    <p v-if="!isCloud" class="muted hint">
      Save, then preview with <code>pnpm dev</code> (restart a running one), or right away without saving:
      <code>pnpm dev --theme {{ current }}</code>.
    </p>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 14px;
}
.theme {
  display: grid;
  gap: 6px;
  padding: 8px 8px 12px;
  text-align: left;
  border: 2px solid var(--border);
  border-radius: var(--radius);
  background: none;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.theme:hover { transform: translateY(-2px); }
.theme.active { border-color: var(--accent); }
.theme img {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.name { display: flex; align-items: center; gap: 8px; font-weight: 700; padding: 0 4px; }
.desc { font-size: 13px; padding: 0 4px; }
.badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
}
.hint { margin: 0; font-size: 13px; }
</style>
