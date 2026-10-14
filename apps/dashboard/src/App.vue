<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import ProfileEditor from "./components/ProfileEditor.vue";
import ProjectDetail from "./components/ProjectDetail.vue";
import ProjectList from "./components/ProjectList.vue";
import {
  account,
  dirty,
  draftIssues,
  isCloud,
  generateMissing,
  load,
  missingTexts,
  published,
  save,
  saveAndBuild,
  signedOut,
  signOut,
  state,
  status,
} from "./store.ts";

const tab = ref<"projects" | "profile">("projects");
const selectedKey = ref<string | null>(null);

const projects = computed(() => state.value?.projects?.projects ?? []);
const selected = computed(() => projects.value.find((p) => p.key === selectedKey.value) ?? null);
const shownCount = computed(() => projects.value.filter(published).length);
const privateMissing = computed(() => missingTexts.value.filter((p) => p.private).length);
const hasNetlify = computed(() => account.value?.connections.some((c) => c.provider === "netlify") ?? false);
const accountTitle = computed(
  () => account.value?.connections.map((c) => `${c.provider}: ${c.accountLogin ?? "connected"}`).join("\n") ?? "",
);
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
  <main v-if="signedOut" class="signin">
    <h1>JAPS</h1>
    <p class="lead">Your portfolio, minus the part where you build your portfolio.</p>
    <p class="muted">
      Sign in with GitHub, connect Netlify, pick the projects to show — JAPS writes the texts and publishes the
      site to your own Netlify. GitHub access is read-only.
    </p>
    <p v-if="status.error" class="banner error">{{ status.error }}</p>
    <a class="btn primary big" href="/auth/github/login">Sign in with GitHub</a>
  </main>

  <template v-else>
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
      <button v-if="!isCloud" class="btn primary" :disabled="status.building || status.saving" @click="saveAndBuild()">
        {{ status.building ? "Building…" : "Save & build" }}
      </button>
      <template v-if="account">
        <a v-if="!hasNetlify" class="btn" href="/auth/netlify/connect">Connect Netlify</a>
        <span class="who" :title="accountTitle">
          <img v-if="account.user.avatarUrl" :src="account.user.avatarUrl" alt="" />
          {{ account.user.login }}
        </span>
        <button class="btn" @click="signOut()">Sign out</button>
      </template>
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

  <div v-if="status.batch && status.generating" class="banner">
    Generating texts {{ status.batch.done + 1 }}/{{ status.batch.total }}: <code>{{ status.generating }}</code>…
  </div>
  <div v-else-if="status.batch" class="banner" :class="status.batch.failed.length ? 'error' : 'ok'">
    Generated texts for {{ status.batch.total - status.batch.failed.length }} of {{ status.batch.total }} projects
    ({{ status.batch.tokens }} tokens). Press <strong>Save &amp; build</strong> to update the portfolio.
    <ul v-if="status.batch.failed.length">
      <li v-for="f in status.batch.failed" :key="f">{{ f }}</li>
    </ul>
  </div>
  <div v-else-if="missingTexts.length && tab === 'projects' && !isCloud" class="banner warn">
    <span>
      {{ missingTexts.length }} shown {{ missingTexts.length === 1 ? "project has" : "projects have" }} no texts yet and
      will be left out of the build: {{ missingTexts.map((p) => p.title).join(", ") }}.
      <template v-if="privateMissing">
        For private repositories, README excerpts are sent to the LLM — anonymize a project first if that's not OK.
      </template>
    </span>
    <button class="btn primary" :disabled="status.generating !== null || status.saving" @click="generateMissing()">
      Generate texts ({{ missingTexts.length }})
    </button>
  </div>

  <main v-if="status.loading" class="empty muted">Loading…</main>

  <main v-else-if="tab === 'projects' && !state?.projects && isCloud" class="empty">
    <h2>No projects yet</h2>
    <p class="muted">
      Importing your sites from Netlify and repositories from GitHub is coming to the hosted version next.
      <template v-if="!hasNetlify">Connect Netlify now so it's ready.</template>
      Meanwhile, set up your profile.
    </p>
    <p>
      <a v-if="!hasNetlify" class="btn primary" href="/auth/netlify/connect">Connect Netlify</a>
      <button class="btn" @click="tab = 'profile'">Edit profile</button>
    </p>
  </main>

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
.who { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.who img { width: 24px; height: 24px; border-radius: 50%; }
.signin { max-width: 520px; margin: 12vh auto 0; padding: 0 20px; text-align: center; }
.signin h1 { font-size: 40px; margin: 0 0 8px; }
.signin .lead { font-size: 18px; margin: 0 0 16px; }
.signin .banner { margin: 16px 0; text-align: left; }
.btn.big { display: inline-block; margin-top: 16px; padding: 10px 20px; font-size: 16px; text-decoration: none; }
a.btn { text-decoration: none; color: inherit; }
a.btn.primary { color: #fff; }
.banner { margin: 12px 20px 0; padding: 10px 14px; border-radius: 8px; }
.banner ul { margin: 6px 0 0; padding-left: 18px; }
.banner.error { background: #fde8e7; color: var(--danger); }
.banner.ok { background: var(--accent-soft); }
.banner.warn {
  background: var(--warn-soft);
  color: var(--warn);
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}
.banner.warn .btn { flex-shrink: 0; }
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
