<script setup lang="ts">
import { setOrder, setOverride, setPublished } from "@japs/core";
import type { Project } from "@japs/schema";
import { computed, ref } from "vue";
import { thumbnail } from "../thumbnail.ts";
import { analysisByKey, draft, projectTitle, published, sortProjects, update } from "../store.ts";

const props = defineProps<{ projects: Project[]; selectedKey: string | null }>();
const emit = defineEmits<{ select: [key: string] }>();

const filter = ref<"shown" | "hidden" | "all">("all");

const shown = computed(() => sortProjects(props.projects.filter(published)));
const hidden = computed(() => sortProjects(props.projects.filter((p) => !published(p))));
const visible = computed(() =>
  filter.value === "shown" ? shown.value : filter.value === "hidden" ? hidden.value : [...shown.value, ...hidden.value],
);

const featured = (p: Project) => draft.value.projects?.[p.key]?.featured === true;
const period = (p: Project) => p.lastActivityAt?.slice(0, 7) ?? "";

/** Moves a shown project up or down; the new order is stored as 1..n. */
function move(project: Project, delta: number): void {
  const keys = shown.value.map((p) => p.key);
  const from = keys.indexOf(project.key);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= keys.length) return;
  keys.splice(to, 0, ...keys.splice(from, 1));
  update((c) => setOrder(c, keys));
}

const REASONS: Record<string, string> = {
  fork: "fork",
  archived: "archived",
  "no-deploy": "never deployed",
  "preview-only": "preview only",
  stale: "inactive",
  "random-name": "test site",
  empty: "empty repo",
  private: "private",
  client: "client work?",
};
</script>

<template>
  <section class="list">
    <div class="filters">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All {{ projects.length }}</button>
      <button :class="{ active: filter === 'shown' }" @click="filter = 'shown'">Shown {{ shown.length }}</button>
      <button :class="{ active: filter === 'hidden' }" @click="filter = 'hidden'">Hidden {{ hidden.length }}</button>
    </div>

    <ul>
      <li
        v-for="p in visible"
        :key="p.key"
        :class="{ selected: p.key === selectedKey, off: !published(p) }"
        @click="emit('select', p.key)"
      >
        <input
          type="checkbox"
          :checked="published(p)"
          :title="published(p) ? 'Shown on the portfolio' : 'Hidden'"
          @click.stop
          @change="update((c) => setPublished(c, p, ($event.target as HTMLInputElement).checked))"
        />
        <div class="thumb">
          <img v-if="thumbnail(p)" :src="thumbnail(p)!" alt="" loading="lazy" />
        </div>
        <div class="info">
          <div class="title">{{ projectTitle(p) }}</div>
          <div class="meta">
            <span class="muted">{{ period(p) }}</span>
            <span v-if="!analysisByKey.has(p.key)" class="badge warn">no texts</span>
            <template v-if="!published(p)">
              <span v-for="r in p.hiddenReasons" :key="r" class="badge">{{ REASONS[r] ?? r }}</span>
            </template>
            <span v-else-if="p.private" class="badge accent">private</span>
          </div>
        </div>
        <button
          class="star"
          :class="{ on: featured(p) }"
          :title="featured(p) ? 'Featured' : 'Mark as featured'"
          @click.stop="update((c) => setOverride(c, p.key, 'featured', !featured(p)))"
        >
          ★
        </button>
        <div v-if="published(p)" class="order" @click.stop>
          <button class="btn small" title="Move up" @click="move(p, -1)">↑</button>
          <button class="btn small" title="Move down" @click="move(p, 1)">↓</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.list {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  position: sticky;
  top: 70px;
  max-height: calc(100vh - 90px);
  display: flex;
  flex-direction: column;
}
.filters { display: flex; gap: 4px; padding: 10px; border-bottom: 1px solid var(--border); }
.filters button {
  border: 1px solid var(--border);
  background: none;
  border-radius: 999px;
  padding: 2px 12px;
  cursor: pointer;
  font-size: 13px;
}
.filters button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
li {
  display: grid;
  grid-template-columns: auto 64px minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
li:hover { background: var(--bg); }
li.selected { background: var(--accent-soft); }
li.off .thumb, li.off .title { opacity: 0.55; }
.thumb { width: 64px; height: 40px; border-radius: 6px; background: var(--bg); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; }
.star { border: 0; background: none; font-size: 18px; cursor: pointer; color: var(--border); padding: 0 2px; }
.star.on { color: #e3a008; }
.order { display: flex; flex-direction: column; gap: 2px; }
@media (max-width: 860px) { .list { position: static; max-height: none; } }
</style>
