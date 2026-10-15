<script setup lang="ts">
import { setOrder, setOverride, setPublished } from "@japs/core";
import type { Project } from "@japs/schema";
import { computed, nextTick, ref } from "vue";
import { thumbnail } from "../thumbnail.ts";
import { analysisByKey, draft, projectTitle, published, sortProjects, update } from "../store.ts";

const props = defineProps<{ projects: Project[]; selectedKey: string | null }>();
const emit = defineEmits<{ select: [key: string] }>();

const filter = ref<"shown" | "hidden" | "all">("all");
const query = ref("");

const shown = computed(() => sortProjects(props.projects.filter(published)));
const hidden = computed(() => sortProjects(props.projects.filter((p) => !published(p))));
const matches = (p: Project) => {
  const q = query.value.trim().toLowerCase();
  // Shown title, discovered name, slug and key: whatever the user remembers.
  return !q || [projectTitle(p), p.title, p.slug, p.key].some((s) => s.toLowerCase().includes(q));
};
const visible = computed(() =>
  (filter.value === "shown" ? shown.value : filter.value === "hidden" ? hidden.value : [...shown.value, ...hidden.value]).filter(matches),
);
/** Reordering only makes sense on the full list of shown projects. */
const canReorder = computed(() => filter.value !== "hidden" && !query.value.trim());

const featured = (p: Project) => draft.value.projects?.[p.key]?.featured === true;
const period = (p: Project) => p.lastActivityAt?.slice(0, 7) ?? "";

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

/** Puts a shown project at another position; the order is stored as 1..n. */
function moveTo(key: string, to: number): void {
  const keys = shown.value.map((p) => p.key);
  const from = keys.indexOf(key);
  if (from < 0 || to < 0 || to >= keys.length || from === to) return;
  keys.splice(to, 0, ...keys.splice(from, 1));
  update((c) => setOrder(c, keys));
}

// Drag and drop between shown projects.
const dragging = ref<string | null>(null);
const over = ref<string | null>(null);
function onDragStart(e: DragEvent, p: Project): void {
  dragging.value = p.key;
  e.dataTransfer?.setData("text/plain", p.key);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
}
function onDragOver(e: DragEvent, p: Project): void {
  if (!dragging.value || !published(p)) return;
  e.preventDefault();
  over.value = p.key;
}
function onDrop(p: Project): void {
  if (dragging.value) moveTo(dragging.value, shown.value.findIndex((s) => s.key === p.key));
  dragging.value = over.value = null;
}

// Keyboard: arrow keys on the handle move the project and keep the focus on it.
async function onHandleKey(e: KeyboardEvent, p: Project): Promise<void> {
  if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  e.preventDefault();
  const from = shown.value.findIndex((s) => s.key === p.key);
  moveTo(p.key, from + (e.key === "ArrowUp" ? -1 : 1));
  await nextTick();
  document.querySelector<HTMLElement>(`[data-handle="${CSS.escape(p.key)}"]`)?.focus();
}
</script>

<template>
  <section class="list">
    <div class="top">
      <label class="search">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" fill="none" stroke="currentColor" stroke-width="2" /></svg>
        <input v-model="query" type="search" placeholder="Search projects" aria-label="Search projects" />
      </label>
      <div class="filters" role="tablist" aria-label="Filter">
        <button role="tab" :aria-selected="filter === 'all'" :class="{ active: filter === 'all' }" @click="filter = 'all'">
          All <span>{{ projects.length }}</span>
        </button>
        <button role="tab" :aria-selected="filter === 'shown'" :class="{ active: filter === 'shown' }" @click="filter = 'shown'">
          Shown <span>{{ shown.length }}</span>
        </button>
        <button role="tab" :aria-selected="filter === 'hidden'" :class="{ active: filter === 'hidden' }" @click="filter = 'hidden'">
          Hidden <span>{{ hidden.length }}</span>
        </button>
      </div>
    </div>

    <ul>
      <li
        v-for="p in visible"
        :key="p.key"
        :class="{ selected: p.key === selectedKey, off: !published(p), dragging: dragging === p.key, over: over === p.key && dragging !== p.key }"
        @click="emit('select', p.key)"
        @dragover="onDragOver($event, p)"
        @dragleave="over = over === p.key ? null : over"
        @drop.prevent="onDrop(p)"
      >
        <span
          v-if="canReorder && published(p)"
          class="handle"
          draggable="true"
          tabindex="0"
          role="button"
          :data-handle="p.key"
          :aria-label="`Reorder ${projectTitle(p)} (arrow keys)`"
          title="Drag to reorder, or use the arrow keys"
          @dragstart="onDragStart($event, p)"
          @dragend="dragging = over = null"
          @keydown="onHandleKey($event, p)"
          @click.stop
        >⠿</span>
        <span v-else class="handle placeholder" aria-hidden="true" />
        <div class="thumb">
          <img v-if="thumbnail(p)" :src="thumbnail(p)!" alt="" loading="lazy" />
        </div>
        <div class="info">
          <div class="title">{{ projectTitle(p) }}</div>
          <div class="meta">
            <span>{{ period(p) }}</span>
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
          :aria-pressed="featured(p)"
          :aria-label="featured(p) ? `Unfeature ${projectTitle(p)}` : `Feature ${projectTitle(p)}`"
          :title="featured(p) ? 'Featured' : 'Mark as featured'"
          @click.stop="update((c) => setOverride(c, p.key, 'featured', !featured(p)))"
        >★</button>
        <button
          class="switch"
          role="switch"
          :class="{ on: published(p) }"
          :aria-checked="published(p)"
          :aria-label="`Show ${projectTitle(p)} on the portfolio`"
          :title="published(p) ? 'Shown on the portfolio' : 'Hidden'"
          @click.stop="update((c) => setPublished(c, p, !published(p)))"
        ><span class="knob" /></button>
      </li>
      <li v-if="!visible.length" class="empty muted">No projects match.</li>
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
.top { display: grid; gap: 8px; padding: 10px; border-bottom: 1px solid var(--border); }
.search { position: relative; display: block; }
.search svg { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); }
.search input { padding-left: 32px; border-radius: 999px; background: var(--bg); }
.filters { display: flex; gap: 4px; }
.filters button {
  border: 1px solid var(--border);
  background: none;
  border-radius: 999px;
  padding: 2px 12px;
  cursor: pointer;
  font-size: 13px;
}
.filters button span { color: var(--muted); font-variant-numeric: tabular-nums; }
.filters button.active { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.filters button.active span { color: inherit; opacity: 0.85; }
ul { list-style: none; margin: 0; padding: 0; overflow: auto; }
li {
  display: grid;
  grid-template-columns: 16px 64px minmax(0, 1fr) auto auto;
  gap: 10px;
  align-items: center;
  padding: 9px 12px 9px 6px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
li:hover { background: var(--bg); }
li.selected { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
li.off .thumb, li.off .title { opacity: 0.5; }
li.dragging { opacity: 0.4; }
li.over { box-shadow: inset 0 2px 0 var(--accent); }
li.empty { display: block; padding: 24px; text-align: center; cursor: default; }
.handle { color: var(--muted); cursor: grab; font-size: 14px; line-height: 1; text-align: center; border-radius: 4px; user-select: none; }
.handle:hover { color: var(--text); }
.handle.placeholder { cursor: default; }
.thumb { width: 64px; height: 40px; border-radius: 6px; background: var(--bg); border: 1px solid var(--border); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; font-size: 12px; color: var(--muted); }
.star { border: 0; background: none; font-size: 17px; cursor: pointer; color: var(--border); padding: 0 2px; border-radius: 4px; }
.star:hover { color: #e3a008; }
.star.on { color: #e3a008; }
.switch {
  position: relative;
  width: 32px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  background: var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.switch.on { background: var(--accent); }
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: transform 0.15s;
}
.switch.on .knob { transform: translateX(14px); }
@media (prefers-reduced-motion: reduce) { .switch, .knob { transition: none; } }
@media (max-width: 860px) { .list { position: static; max-height: none; } }
</style>
