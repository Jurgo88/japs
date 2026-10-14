<script setup lang="ts">
import { defaultPublished, primarySite, setClientLabel, setOverride, setPublished, setTags } from "@japs/core";
import type { Project } from "@japs/schema";
import { computed, reactive, ref, watch } from "vue";
import { thumbnail } from "../thumbnail.ts";
import LocalizedField from "./LocalizedField.vue";
import { analysisByKey, draft, generate, isCloud, locales, projectTitle, published, state, status, update } from "../store.ts";

const props = defineProps<{ project: Project }>();

const override = computed(() => draft.value.projects?.[props.project.key] ?? {});
const analysis = computed(() => analysisByKey.value.get(props.project.key));
const site = computed(() => primarySite(props.project, new Map(state.value?.projects?.sites.map((s) => [s.id, s]) ?? [])));

const isPublished = computed(() => published(props.project));
const byDefault = computed(() => defaultPublished(props.project, draft.value));
const isClient = computed(() => override.value.isClient ?? props.project.clientSignals.length > 0);
const anonymize = computed(() => override.value.anonymize === true);
/** Texts were generated with names, but the project is now anonymized: they must be regenerated. */
const needsReanalysis = computed(() => anonymize.value && analysis.value !== undefined && !analysis.value.anonymized);

const SIGNALS: Record<string, string> = {
  "foreign-committer": "someone else committed the deployed code",
  "organization-repo": "the repository belongs to an organization",
  "foreign-repo-owner": "the repository belongs to another user",
};

// Client label: edited locally, committed on change.
const label = reactive<Record<string, string>>({});
watch(
  () => override.value.clientLabel,
  (value) => {
    for (const l of locales.value) label[l] = value?.[l] ?? "";
  },
  { immediate: true },
);
const commitLabel = () => update((c) => setClientLabel(c, props.project.key, { ...label }));
/** A label is all-or-nothing per locale (schema); flag the gap before Save does. */
const labelMissing = computed(() => {
  const saved = override.value.clientLabel;
  return saved ? locales.value.filter((l) => !saved[l]?.trim()) : [];
});

const tags = ref("");
watch(
  () => override.value.copy?.tags ?? analysis.value?.copy.tags ?? [],
  (value) => (tags.value = value.join(", ")),
  { immediate: true },
);
const commitTags = () =>
  update((c) => setTags(c, props.project.key, tags.value.split(","), analysis.value?.copy.tags));

const screenshotUrl = ref(override.value.screenshotUrl ?? "");
const commitScreenshotUrl = () =>
  update((c) => setOverride(c, props.project.key, "screenshotUrl", screenshotUrl.value.trim() || undefined));

const generatingThis = computed(() => status.generating === props.project.key);
const busy = computed(() => status.generating !== null || status.saving || status.building);
const result = computed(() => (status.generated?.key === props.project.key ? status.generated : null));

const desktop = computed(() => thumbnail(props.project, "desktop"));
const mobile = computed(() => thumbnail(props.project, "mobile"));
</script>

<template>
  <section class="detail">
    <header>
      <div>
        <h2>{{ projectTitle(project) }}</h2>
        <div class="muted key">{{ project.key }}</div>
      </div>
      <a v-if="site" :href="site.url" target="_blank" rel="noopener" class="btn small">Open site ↗</a>
    </header>

    <div v-if="desktop || mobile" class="shots">
      <img v-if="desktop" :src="desktop" alt="Desktop screenshot" class="desktop" />
      <img v-if="mobile" :src="mobile" alt="Mobile screenshot" class="mobile" />
    </div>

    <div class="card">
      <label class="check">
        <input type="checkbox" :checked="isPublished" @change="update((c) => setPublished(c, project, ($event.target as HTMLInputElement).checked))" />
        <strong>Show on the portfolio</strong>
      </label>
      <p v-if="!byDefault" class="muted hint">
        Hidden by default ({{ project.hiddenReasons.join(", ") }}).
        <template v-if="project.private">Private repository: its link is never published, even when the project is shown.</template>
      </p>
      <label class="check">
        <input type="checkbox" :checked="override.featured === true" @change="update((c) => setOverride(c, project.key, 'featured', ($event.target as HTMLInputElement).checked))" />
        Featured (shown first, highlighted)
      </label>
    </div>

    <div class="card">
      <label class="check">
        <input type="checkbox" :checked="isClient" @change="update((c) => setOverride(c, project.key, 'isClient', ($event.target as HTMLInputElement).checked))" />
        <strong>Client project</strong>
      </label>
      <p v-if="project.clientSignals.length && override.isClient === undefined" class="muted hint">
        Suggested because {{ project.clientSignals.map((s) => SIGNALS[s] ?? s).join(" and ") }}. Tick or untick to decide.
      </p>
      <label class="check">
        <input type="checkbox" :checked="anonymize" @change="update((c) => setOverride(c, project.key, 'anonymize', ($event.target as HTMLInputElement).checked))" />
        Anonymize (no name, no live link, no screenshots)
      </label>
      <template v-if="anonymize">
        <div class="label-grid">
          <div class="muted">Client label shown instead of the name</div>
          <div v-for="l in locales" :key="l" class="row">
            <span class="locale">{{ l.toUpperCase() }}</span>
            <input v-model="label[l]" type="text" placeholder="e.g. E-shop for a client in hospitality" @change="commitLabel" />
          </div>
          <div v-if="labelMissing.length" class="warn-text">
            Fill in the label in every language ({{ labelMissing.join(", ").toUpperCase() }} missing) — otherwise it can't be saved.
          </div>
        </div>
        <label class="check">
          <input type="checkbox" :checked="override.allowScreenshots === true" @change="update((c) => setOverride(c, project.key, 'allowScreenshots', ($event.target as HTMLInputElement).checked))" />
          Show screenshots anyway
        </label>
      </template>
      <div v-if="needsReanalysis" class="notice action">
        <span>These texts were generated with the project's name; until they are regenerated anonymously, the project is left out of the build.</span>
        <button v-if="!isCloud" class="btn primary" :disabled="busy" @click="generate(project.key)">
          {{ generatingThis ? "Generating…" : "Regenerate anonymously" }}
        </button>
      </div>
    </div>

    <div class="card texts">
      <div v-if="!analysis" class="notice action">
        <span>No generated texts yet. Generate them from the project's facts (about a cent with the default model), or write your own below.</span>
        <button v-if="!isCloud" class="btn primary" :disabled="busy" @click="generate(project.key)">
          {{ generatingThis ? "Generating…" : "Generate texts" }}
        </button>
      </div>
      <p v-if="result" class="muted result">
        Generated with {{ result.model }} · {{ result.usage.input }} + {{ result.usage.output }} tokens.
        <template v-if="result.dropped.length">The grounding check removed {{ result.dropped.length }} sentence(s) with numbers not in the facts.</template>
        <template v-for="w in result.warnings" :key="w"><br />⚠ {{ w }}</template>
      </p>
      <LocalizedField :project-key="project.key" field="title" label="Title" :generated="analysis?.copy.title" />
      <LocalizedField :project-key="project.key" field="summary" label="Summary" :generated="analysis?.copy.summary" :max-length="200" />
      <LocalizedField :project-key="project.key" field="description" label="Description (Markdown)" :generated="analysis?.copy.description" multiline />
      <LocalizedField :project-key="project.key" field="role" label="Role" :generated="analysis?.copy.role" />
      <div class="field">
        <div class="label">Tags <span class="muted">(comma separated)</span></div>
        <input v-model="tags" type="text" @change="commitTags" />
      </div>
      <div class="field">
        <div class="label">Screenshot page <span class="muted">(optional, e.g. a demo URL)</span></div>
        <input v-model="screenshotUrl" type="url" :placeholder="site?.url ?? 'https://…'" @change="commitScreenshotUrl" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.detail { display: grid; gap: 12px; }
header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
h2 { margin: 0; font-size: 22px; }
.key { font-family: ui-monospace, monospace; font-size: 12px; }
.shots { display: grid; grid-template-columns: minmax(0, 1fr) 110px; gap: 10px; align-items: start; }
.shots img { width: 100%; border: 1px solid var(--border); border-radius: 8px; display: block; }
.shots .desktop:only-child { grid-column: 1 / -1; max-width: 560px; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: grid;
  gap: 10px;
}
.texts { gap: 16px; }
.hint { margin: -4px 0 0 26px; font-size: 13px; }
.label-grid { display: grid; gap: 6px; margin-left: 26px; }
.row { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 8px; align-items: center; }
.locale { font-size: 11px; font-weight: 700; color: var(--muted); }
.field { display: grid; gap: 6px; }
.field .label { font-weight: 600; }
</style>

<style scoped>
.notice.action { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.notice.action .btn { flex-shrink: 0; }
.result { margin: -8px 0 0; font-size: 12px; }
</style>

<style scoped>
.warn-text { color: var(--warn); font-size: 13px; }
</style>
