<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AccountMenu from "./components/AccountMenu.vue";
import LanguagesEditor from "./components/LanguagesEditor.vue";
import ProfileEditor from "./components/ProfileEditor.vue";
import ProjectDetail from "./components/ProjectDetail.vue";
import ProjectList from "./components/ProjectList.vue";
import PublishTarget from "./components/PublishTarget.vue";
import SettingsPage, { type SettingsSection } from "./components/SettingsPage.vue";
import ThemePicker from "./components/ThemePicker.vue";
import {
  account,
  dirty,
  draft,
  draftIssues,
  isCloud,
  generateMissing,
  job,
  load,
  loadPublish,
  missingTexts,
  publish,
  published,
  publishing,
  publishRunning,
  save,
  saveAndBuild,
  signedOut,
  site,
  startImport,
  state,
  status,
  unreadableRepos,
} from "./store.ts";

const tab = ref<"projects" | "profile" | "design">("projects");

/** Settings live at #/settings/<section>, so reload and Back keep them. Locally without Account. */
const hash = ref(location.hash);
window.addEventListener("hashchange", () => (hash.value = location.hash));
const SECTIONS: SettingsSection[] = ["connections", "ai", "account"];
const settingsSection = computed<SettingsSection | null>(() => {
  const match = /^#\/settings(?:\/(\w+))?$/.exec(hash.value);
  if (!match) return null;
  const section = match[1] as SettingsSection;
  return SECTIONS.includes(section) && (isCloud.value || section !== "account") ? section : "connections";
});
const openSettings = (section: SettingsSection = "connections") => (location.hash = `#/settings/${section}`);
const closeSettings = () => {
  history.pushState(null, "", location.pathname + location.search);
  hash.value = "";
};
const showTab = (next: typeof tab.value) => {
  tab.value = next;
  if (settingsSection.value) closeSettings();
};
const selectedKey = ref<string | null>(null);

const projects = computed(() => state.value?.projects?.projects ?? []);
const selected = computed(() => projects.value.find((p) => p.key === selectedKey.value) ?? null);
const shownCount = computed(() => projects.value.filter(published).length);
const privateMissing = computed(() => missingTexts.value.filter((p) => p.private).length);
const connected = (provider: string) => account.value?.connections.some((c) => c.provider === provider) ?? false;
const hasNetlify = computed(() => connected("netlify"));
const hasCloudflare = computed(() => connected("cloudflare"));
/** Sites come from Netlify, Cloudflare Pages or both (ADR 0012). */
const hasHosting = computed(() => hasNetlify.value || hasCloudflare.value);
const target = computed(() => draft.value.publish?.target ?? "netlify");
/**
 * Publish needs the chosen target connected (ADR 0012). japs.app needs no account, only an
 * address: the user's, or the suggested GitHub login, which the first publish claims (ADR 0013).
 */
const canPublish = computed(() =>
  target.value === "japs"
    ? site.value?.available === true && Boolean(site.value.site ?? site.value.suggestion)
    : target.value === "cloudflare"
      ? hasCloudflare.value
      : hasNetlify.value,
);
const jobRunning = computed(() => job.value?.status === "running");
/** "Importing… 3/16" while it runs; the finished job's outcome afterwards. */
const jobLabel = computed(() => {
  const j = job.value;
  if (!j) return "";
  if (j.status === "running") {
    return j.total ? `${j.kind === "sync" ? "Importing" : "Generating"}: ${j.done + j.failed} of ${j.total} projects done…` : (j.message ?? "Working…");
  }
  if (j.status === "failed") return j.message ?? "The last import failed.";
  return j.total ? `Done: ${j.done} of ${j.total} projects${j.failed ? `, ${j.failed} with problems` : ""}.` : (j.message ?? "Done.");
});
/** Shown while a publish runs, and its outcome when it was started in this session. */
const publishedNow = ref(false);
const startPublish = () => {
  publishedNow.value = true;
  void publish();
};
const TARGET_NAMES = { netlify: "Netlify", cloudflare: "Cloudflare Pages", japs: "japs.app" } as const;
const targetName = computed(() => TARGET_NAMES[target.value]);
const publishTitle = computed(() =>
  isCloud.value && !canPublish.value
    ? target.value === "japs"
      ? "Choose your japs.app address in Design to publish there"
      : `Connect ${targetName.value === "Netlify" ? "Netlify" : "Cloudflare"} in Settings to publish there`
    : `Build the portfolio with your theme and put it on ${targetName.value}`,
);
/** Where a blocked Publish button leads: the address for japs.app, the connections otherwise. */
const fixPublish = () => (target.value === "japs" ? showTab("design") : openSettings("connections"));
const showPublish = computed(() => publishing.value !== null && (publishRunning.value || publishedNow.value));
const issuesTitle = computed(() => draftIssues.value.map((i) => `${i.path}: ${i.message}`).join("\n"));

onMounted(async () => {
  await load();
  if (!signedOut.value) void loadPublish();
  selectedKey.value = projects.value.find(published)?.key ?? projects.value[0]?.key ?? null;
});

// Leaving with unsaved changes asks first.
window.addEventListener("beforeunload", (e) => {
  if (dirty.value) e.preventDefault();
});
const accountDeleted = new URLSearchParams(location.search).has("deleted");
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
    <p v-if="accountDeleted" class="banner ok">Your account and all its data were deleted.</p>
    <a class="btn primary big" href="/auth/github/login">Sign in with GitHub</a>
    <p class="muted legal">By signing in you agree to the <a href="/terms">terms</a>. <a href="/privacy">Privacy</a></p>
  </main>

  <template v-else>
  <header class="top">
    <div class="brand">JAPS <span class="muted">editor</span></div>
    <nav class="tabs" aria-label="Editor">
      <button :class="{ active: !settingsSection && tab === 'projects' }" @click="showTab('projects')">
        Projects <span class="count">{{ shownCount }}/{{ projects.length }}</span>
      </button>
      <button :class="{ active: !settingsSection && tab === 'profile' }" @click="showTab('profile')">Profile</button>
      <button :class="{ active: !settingsSection && tab === 'design' }" @click="showTab('design')">Design</button>
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
      <button v-if="!isCloud" class="btn" :disabled="status.building || status.saving" @click="saveAndBuild()">
        {{ status.building ? "Building…" : "Save & build" }}
      </button>
      <button v-if="isCloud && hasHosting && state?.projects" class="btn" :disabled="jobRunning" @click="startImport()">
        {{ jobRunning ? "Importing…" : "Import again" }}
      </button>
      <button
        v-if="!isCloud || hasHosting"
        class="btn primary"
        :disabled="publishRunning || status.saving || draftIssues.length > 0"
        :title="publishTitle"
        @click="isCloud && !canPublish ? fixPublish() : startPublish()"
      >
        {{ publishRunning ? "Publishing…" : "Publish" }}
      </button>
      <AccountMenu v-if="account" @settings="openSettings()" />
      <button
        v-else-if="!isCloud"
        class="gear"
        type="button"
        title="Settings"
        aria-label="Settings"
        :aria-pressed="Boolean(settingsSection)"
        @click="settingsSection ? closeSettings() : openSettings()"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z"
          />
        </svg>
      </button>
    </div>
  </header>

  <SettingsPage v-if="settingsSection" :section="settingsSection" @navigate="openSettings" @close="closeSettings" />

  <template v-else>
  <div v-if="status.error" class="banner error">
    <strong>{{ status.error }}</strong>
    <ul v-if="status.issues.length">
      <li v-for="issue in status.issues" :key="issue">{{ issue }}</li>
    </ul>
  </div>
  <div v-else-if="status.build" class="banner ok">
    Built {{ status.build.projects }} projects with {{ status.build.screenshots }} screenshots into
    <code>out/</code>. Preview with <code>pnpm dev</code> (the theme from the Design tab) → <a href="http://localhost:4321" target="_blank">localhost:4321</a>.
    <ul v-if="status.build.warnings.length" class="muted">
      <li v-for="w in status.build.warnings" :key="w">{{ w }}</li>
    </ul>
  </div>

  <div v-if="showPublish && publishing" class="banner" :class="{ ok: publishing.status === 'live', error: publishing.status === 'failed' }">
    <template v-if="publishing.status === 'building'">
      <strong>Building your site…</strong> <span class="muted">This takes a minute or two.</span>
    </template>
    <template v-else-if="publishing.status === 'deploying'">
      <strong>Uploading to {{ TARGET_NAMES[publishing.target ?? "netlify"] }}…</strong>
    </template>
    <template v-else-if="publishing.status === 'live' && publishing.draft">
      Draft preview: <a :href="publishing.url ?? publishing.siteUrl" target="_blank" rel="noopener">{{ publishing.url ?? publishing.siteUrl }}</a>
      <span class="muted"> (the live site is unchanged)</span>
    </template>
    <template v-else-if="publishing.status === 'live'">
      Your portfolio is live: <a :href="publishing.url ?? publishing.siteUrl" target="_blank" rel="noopener">{{ publishing.url ?? publishing.siteUrl }}</a>
    </template>
    <template v-else>
      <strong>Publishing failed.</strong> {{ publishing.message }}
    </template>
  </div>

  <div v-if="isCloud && job && (jobRunning || job.status === 'failed' || job.problems.length)" class="banner" :class="{ error: job.status === 'failed' }">
    <strong>{{ jobLabel }}</strong>
    <span v-if="jobRunning" class="muted"> Texts appear as projects finish; you can keep editing.</span>
    <ul v-if="job.problems.length">
      <li v-for="p in job.problems" :key="p">{{ p }}</li>
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
  <div v-else-if="missingTexts.length && tab === 'projects' && !jobRunning" class="banner warn">
    <span v-if="isCloud">
      {{ missingTexts.length }} {{ missingTexts.length === 1 ? "project is" : "projects are" }} selected for your portfolio
      without texts yet: {{ missingTexts.map((p) => p.title).join(", ") }}. Untick the ones you don't want, then generate
      texts only for these.
    </span>
    <span v-else>
      {{ missingTexts.length }} shown {{ missingTexts.length === 1 ? "project has" : "projects have" }} no texts yet and
      will be left out of the build: {{ missingTexts.map((p) => p.title).join(", ") }}.
    </span>
    <span v-if="privateMissing" class="private-note">
      For private repositories, README excerpts are sent to the LLM — anonymize a project first if that's not OK.
    </span>
    <button class="btn primary" :disabled="status.generating !== null || status.saving || jobRunning" @click="generateMissing()">
      Generate texts ({{ missingTexts.length }})
    </button>
  </div>

  <div v-if="unreadableRepos.length && account?.githubAppInstallUrl && tab === 'projects'" class="banner info">
    <span>
      {{ unreadableRepos.length }} {{ unreadableRepos.length === 1 ? "project uses a repository" : "projects use repositories" }}
      JAPS can't read yet (private). Without access, their texts are based on the live site only.
    </span>
    <a class="btn" :href="account.githubAppInstallUrl">Grant access on GitHub</a>
  </div>

  <main v-if="status.loading" class="empty muted">Loading…</main>

  <main v-else-if="tab === 'projects' && !state?.projects && isCloud" class="empty">
    <h2>{{ jobRunning ? "Importing your projects…" : "No projects yet" }}</h2>
    <p v-if="jobRunning" class="muted">{{ jobLabel }} This takes a minute or two.</p>
    <p v-else-if="!hasHosting" class="muted">
      Connect Netlify{{ account?.cloudflareAvailable ? " or Cloudflare (Pages)" : "" }}, then import: JAPS lists your
      sites and pairs them with their GitHub repositories. You pick what goes into the portfolio, and only those get
      texts. Nothing is published until you say so.
    </p>
    <p v-else class="muted">
      Import lists your {{ hasNetlify && hasCloudflare ? "Netlify and Cloudflare Pages" : hasNetlify ? "Netlify" : "Cloudflare Pages" }}
      sites and GitHub repositories in a few seconds. Then you pick what goes into the
      portfolio, and JAPS writes texts only for those. Nothing is published until you say so.
    </p>
    <p>
      <template v-if="!hasHosting">
        <a class="btn primary" href="/auth/netlify/connect">Connect Netlify</a>
        <a v-if="account?.cloudflareAvailable" class="btn primary" href="/auth/cloudflare/connect">Connect Cloudflare</a>
      </template>
      <button v-else class="btn primary" :disabled="jobRunning" @click="startImport()">
        {{ jobRunning ? "Importing…" : "Import projects" }}
      </button>
      <button class="btn" @click="showTab('profile')">Edit profile</button>
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

  <main v-else-if="tab === 'design'" class="single">
    <ThemePicker />
    <PublishTarget />
  </main>

  <main v-else class="single">
    <LanguagesEditor />
    <ProfileEditor />
  </main>
  </template>
  </template>
</template>

<style scoped>
.legal { font-size: 13px; }
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
.gear {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: 50%;
  background: var(--panel);
  color: var(--muted);
  cursor: pointer;
}
.gear:hover, .gear[aria-pressed="true"] { color: var(--accent); border-color: var(--accent); }
.tabs .count { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.tabs button.active .count { color: inherit; opacity: 0.8; }
.signin { max-width: 520px; margin: 12vh auto 0; padding: 0 20px; text-align: center; }
.signin h1 { font-size: 40px; margin: 0 0 8px; }
.signin .lead { font-size: 18px; margin: 0 0 16px; }
.signin .banner { margin: 16px 0; text-align: left; }
.btn.big { display: inline-block; margin-top: 16px; padding: 10px 20px; font-size: 16px; text-decoration: none; }
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
.banner.info { background: var(--accent-soft); display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.banner.info .btn { flex-shrink: 0; }
.banner.warn { flex-wrap: wrap; }
.private-note { flex-basis: 100%; order: 3; font-size: 13px; }
@media (prefers-color-scheme: dark) { .banner.error { background: #3a1513; } }
.split {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 16px;
  padding: 16px 20px;
  align-items: start;
}
.single { padding: 16px 20px; max-width: 820px; display: grid; gap: 16px; }
.empty { padding: 48px 20px; text-align: center; }
.empty pre { display: inline-block; text-align: left; background: var(--panel); padding: 12px 16px; border-radius: 8px; }
@media (max-width: 860px) {
  .top { flex-wrap: wrap; }
  .actions { width: 100%; }
  .split { grid-template-columns: 1fr; }
}
</style>
