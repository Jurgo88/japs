<script setup lang="ts">
import { THEMES, type ThemeId } from "@japs/schema";
import { computed } from "vue";
import { draft, isCloud, update } from "../store.ts";

const current = computed<ThemeId>(() => draft.value.theme ?? "default");
const currentLabel = computed(() => THEMES.find((t) => t.id === current.value)?.label ?? current.value);

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
    <header class="head">
      <div class="card-head">
        <h2>Theme</h2>
        <p class="muted">How the published portfolio looks. Texts, projects and languages stay the same in every theme.</p>
      </div>
      <span class="badge accent">{{ currentLabel }}</span>
    </header>

    <div class="grid" role="radiogroup" aria-label="Theme">
      <button
        v-for="theme in THEMES"
        :key="theme.id"
        type="button"
        class="theme"
        role="radio"
        :aria-checked="current === theme.id"
        :class="{ active: current === theme.id }"
        @click="choose(theme.id)"
      >
        <span class="shot">
          <img :src="['fieldnotes', 'riot', 'orbit', 'reel', 'swiss', 'retro', 'blueprint', 'metro', 'arena', 'bento', 'newspaper', 'vinyl', 'museum', 'terminal', 'canvas', 'tunnel', 'posters'].includes(theme.id) ? `/themes/${theme.id}.svg` : `/themes/${theme.id}.jpg`" :alt="`${theme.label} theme preview`" width="640" height="400" loading="lazy" />
          <span v-if="current === theme.id" class="check" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
        </span>
        <span class="name">{{ theme.label }}</span>
        <span class="muted desc">{{ theme.description }}</span>
      </button>
    </div>

    <div v-if="!isCloud" class="tip">
      <strong>Preview locally</strong>
      <span class="muted">Save, then run <code>pnpm dev</code> (restart a running one), or try it right away without saving:</span>
      <code class="cmd">pnpm dev --theme {{ current }}</code>
    </div>
  </section>
</template>

<style scoped>
.card { padding: 22px 24px; gap: 18px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr));
  gap: 18px;
}
.theme {
  display: grid;
  align-content: start;
  gap: 4px;
  padding: 0 0 12px;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--panel);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.2s, transform 0.2s;
}
.theme:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -12px rgb(0 0 0 / 0.25); }
.theme.active { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.shot { position: relative; display: block; margin-bottom: 8px; border-bottom: 1px solid var(--border); overflow: hidden; }
.theme img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  transition: transform 0.4s;
}
.theme:hover img { transform: scale(1.03); }
.check {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--on-accent);
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
}
.name { font-weight: 700; padding: 0 14px; }
.desc { font-size: 13px; padding: 0 14px; }
.tip {
  display: grid;
  gap: 6px;
  justify-items: start;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-size: 13px;
}
.cmd { padding: 4px 8px; border-radius: 6px; background: var(--panel); border: 1px solid var(--border); }
@media (prefers-reduced-motion: reduce) {
  .theme, .theme img { transition: none; }
  .theme:hover, .theme:hover img { transform: none; }
}
</style>
