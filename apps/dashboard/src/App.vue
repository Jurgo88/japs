<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ProfileEditor from "./components/ProfileEditor.vue";
import ProjectDetail from "./components/ProjectDetail.vue";
import ProjectList from "./components/ProjectList.vue";
import { dirty, draftIssues, load, published, save, saveAndBuild, state, status } from "./store.ts";

const tab = ref<"projects" | "profile">("projects");
const selectedKey = ref<string | null>(null);

const projects = computed(() => state.value?.projects?.projects ?? []);
const selected = computed(() => projects.value.find((p) => p.key === selectedKey.value) ?? null);
const shownCount = computed(() => projects.value.filter(published).length);
const issuesTitle = computed(() => draftIssues.value.map((i) => `${i.path}: ${i.message}`).join("\n"));

onMounted(async () => {
  await load();
  selectedKey.value = projects.value.find(published)?.key ?? projects.value[0]?.key ?? null;
});

// Leaving with unsaved changes asks first.
window.addEventListener("beforeunload", (e) => {
  if (dirty.value) e.preventDefault();
});
</script>

<template>
  <header class="top">
    <div class="brand">JAPS <span class="muted">editor</span></div>
    <nav class="tabs">
      <button :class="{ active: tab === 'projects' }" @click="tab = 'projects'">
        Projects <span class="muted">{{ shownCount }}/{{ projects.length }}</span>
      </button>
      <button :class="{ active: tab === 'profile' }" @click="tab = 'profile'">Profile</button>
    </nav>
    <div class="actions">
      <span
        v-if="draftIssues.length"
        class="issues"
        :title="issuesTitle"
      >
        {{ draftIssues.length }} {{ draftIssues.length === 1 ? "problem" : "problems" }} to fix before saving
      </span>
      <span v-else-if="dirty" class="muted">Unsaved changes</span>
      <button class="btn" :disabled="!dirty || status.saving" @click="save()">
        {{ status.saving ? "Saving…" : "Save" }}
      </button>
      <button class="btn primary" :disabled="status.building || status.saving" @click="saveAndBuild()">
        {{ status.building ? "Building…" : "Save & build" }}
      </button>
    </div>
  </header>

  <div v-if="status.error" class="banner error">
    <strong>{{ status.error }}</strong>
    <ul v-if="status.issues.length">
      <li v-for="issue in status.issues" :key="issue">{{ issue }}</li>
    </ul>
  </div>
  <div v-else-if="status.build" class="banner ok">
    Built {{ status.build.projects }} projects with {{ status.build.screenshots }} screenshots into
    <code>out/</code>. Preview with <code>pnpm dev</code> → <a href="http://localhost:4321" target="_blank">localhost:4321</a>.
    <ul v-if="status.build.warnings.length" class="muted">
      <li v-for="w in status.build.warnings" :key="w">{{ w }}</li>
    </ul>
  </div>

  <main v-if="status.loading" class="empty muted">Loading…</main>

  <main v-else-if="tab === 'projects' && !state?.projects" class="empty">
    <h2>No projects yet</h2>
    <p class="muted">Run the pipeline first, then reload this page:</p>
    <pre>pnpm japs discover
pnpm japs facts
pnpm japs analyze</pre>
  </main>

  <main v-else-if="tab === 'projects'" class="split">
    <ProjectList :projects="projects" :selected-key="selectedKey" @select="selectedKey = $event" />
    <ProjectDetail v-if="selected" :key="selected.key" :project="selected" />
  </main>

  <main v-else class="single">
    <ProfileEditor />
  </main>
</template>

<style scoped>
.top {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.brand { font-weight: 700; font-size: 16px; }
.tabs { display: flex; gap: 4px; }
.tabs button {
  border: 0;
  background: none;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
}
.tabs button.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.actions { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.issues { color: var(--warn); font-size: 13px; cursor: help; }
.banner { margin: 12px 20px 0; padding: 10px 14px; border-radius: 8px; }
.banner ul { margin: 6px 0 0; padding-left: 18px; }
.banner.error { background: #fde8e7; color: var(--danger); }
.banner.ok { background: var(--accent-soft); }
@media (prefers-color-scheme: dark) { .banner.error { background: #3a1513; } }
.split {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px 20px;
  align-items: start;
}
.single { padding: 16px 20px; max-width: 820px; }
.empty { padding: 48px 20px; text-align: center; }
.empty pre { display: inline-block; text-align: left; background: var(--panel); padding: 12px 16px; border-radius: 8px; }
@media (max-width: 860px) {
  .top { flex-wrap: wrap; }
  .actions { width: 100%; }
  .split { grid-template-columns: 1fr; }
}
</style>
