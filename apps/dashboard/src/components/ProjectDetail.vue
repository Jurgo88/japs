<script setup lang="ts">
import { defaultPublished, primarySite, setClientLabel, setOverride, setPublished, setTags } from "@japs/core";
import type { Project } from "@japs/schema";
import { computed, reactive, watch } from "vue";
import { thumbnail } from "../thumbnail.ts";
import LocaleTabs from "./LocaleTabs.vue";
import LocalizedField from "./LocalizedField.vue";
import TagInput from "./TagInput.vue";
import ToggleSwitch from "./ToggleSwitch.vue";
import { analysisByKey, draft, editLocale, generate, job, locales, projectTitle, published, state, status, update } from "../store.ts";

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

const set = (field: "featured" | "isClient" | "anonymize" | "allowScreenshots", value: boolean) =>
  update((c) => setOverride(c, props.project.key, field, value));

const REASONS: Record<string, string> = {
  fork: "a fork",
  archived: "archived",
  "no-deploy": "never deployed",
  "preview-only": "only preview deploys",
  stale: "inactive for a long time",
  "random-name": "looks like a test site",
  empty: "an empty repository",
  private: "a private repository",
  client: "probably client work",
};
const SIGNALS: Record<string, string> = {
  "foreign-committer": "someone else committed the deployed code",
  "organization-repo": "the repository belongs to an organization",
  "foreign-repo-owner": "the repository belongs to another user",
};
const showHint = computed(() => {
  if (byDefault.value) return props.project.private ? "Private repository: its link is never published." : undefined;
  return `Hidden by default: ${props.project.hiddenReasons.map((r) => REASONS[r] ?? r).join(", ")}.`;
});
const clientHint = computed(() =>
  props.project.clientSignals.length && override.value.isClient === undefined
    ? `Suggested because ${props.project.clientSignals.map((s) => SIGNALS[s] ?? s).join(" and ")}.`
    : "Work for someone else; you can anonymize it below.",
);

// Client label: edited locally, committed on change; all-or-nothing per language (schema).
const label = reactive<Record<string, string>>({});
watch(
  () => override.value.clientLabel,
  (value) => {
    for (const l of locales.value) label[l] = value?.[l] ?? "";
  },
  { immediate: true },
);
const commitLabel = () => update((c) => setClientLabel(c, props.project.key, { ...label }));
const labelMissing = computed(() => {
  const saved = override.value.clientLabel;
  return saved ? locales.value.filter((l) => !saved[l]?.trim()) : [];
});

const tags = computed(() => override.value.copy?.tags ?? analysis.value?.copy.tags ?? []);
const setTagList = (list: string[]) => update((c) => setTags(c, props.project.key, list, analysis.value?.copy.tags));

const screenshotUrl = computed(() => override.value.screenshotUrl ?? "");
const setScreenshotUrl = (value: string) => update((c) => setOverride(c, props.project.key, "screenshotUrl", value.trim() || undefined));

const generatingThis = computed(() => status.generating === props.project.key);
const busy = computed(() => status.generating !== null || status.saving || status.building || job.value?.status === "running");
const result = computed(() => (status.generated?.key === props.project.key ? status.generated : null));

const desktop = computed(() => thumbnail(props.project, "desktop"));
const mobile = computed(() => thumbnail(props.project, "mobile"));

/** Per language: something still empty, or the user's own edits (for the language tabs). */
const FIELDS = ["title", "summary", "description", "role"] as const;
const localeStatus = computed(() => {
  const copy = override.value.copy;
  return Object.fromEntries(
    locales.value.map((l) => {
      const missing = FIELDS.some((f) => !(copy?.[f]?.[l] ?? analysis.value?.copy[f]?.[l])?.trim());
      const edited = FIELDS.some((f) => copy?.[f]?.[l] !== undefined);
      return [l, missing ? "missing" : edited ? "edited" : null] as const;
    }),
  );
});
</script>

<template>
  <section class="detail">
    <header class="card hero">
      <div class="shot">
        <img v-if="desktop" :src="desktop" alt="" />
        <span v-else class="muted">No screenshot yet</span>
      </div>
      <div class="intro">
        <h2>{{ projectTitle(project) }}</h2>
        <div class="pills">
          <span class="pill" :class="isPublished ? 'on' : 'off'">{{ isPublished ? "Shown" : "Hidden" }}</span>
          <span v-if="override.featured" class="pill star">★ Featured</span>
          <span v-if="project.private" class="pill">Private</span>
          <span v-if="anonymize" class="pill">Anonymized</span>
          <span v-if="!analysis" class="pill warn">No texts</span>
        </div>
        <a v-if="site && !anonymize" :href="site.url" target="_blank" rel="noopener" class="site">{{ site.domain }} ↗</a>
      </div>
    </header>

    <section class="card">
      <header class="card-head">
        <h3>Visibility</h3>
      </header>
      <ToggleSwitch
        :model-value="isPublished"
        label="Show on the portfolio"
        :hint="showHint"
        @update:model-value="(v) => update((c) => setPublished(c, project, v))"
      />
      <ToggleSwitch
        :model-value="override.featured === true"
        label="Featured"
        hint="Shown first and highlighted."
        :disabled="!isPublished"
        @update:model-value="(v) => set('featured', v)"
      />
      <ToggleSwitch :model-value="isClient" label="Client project" :hint="clientHint" @update:model-value="(v) => set('isClient', v)" />
      <ToggleSwitch
        :model-value="anonymize"
        label="Anonymize"
        hint="No name, no live link and no screenshots; a short label describes it instead."
        @update:model-value="(v) => set('anonymize', v)"
      >
        <template v-if="anonymize">
          <div class="client-label">
            <div class="row-head">
              <label :for="`${project.key}-label`">Label instead of the name</label>
              <LocaleTabs />
            </div>
            <input
              :id="`${project.key}-label`"
              v-model="label[editLocale]"
              type="text"
              placeholder="e.g. E-shop for a hospitality client"
              @change="commitLabel"
            />
            <span v-if="labelMissing.length" class="warn-text">Fill it in for every language ({{ labelMissing.join(", ").toUpperCase() }} missing) to save.</span>
          </div>
          <ToggleSwitch
            :model-value="override.allowScreenshots === true"
            label="Show screenshots anyway"
            @update:model-value="(v) => set('allowScreenshots', v)"
          />
        </template>
      </ToggleSwitch>
      <div v-if="needsReanalysis" class="notice action">
        <span>These texts mention the project's name. Until they are regenerated anonymously, the project is left out.</span>
        <button class="btn primary" :disabled="busy" @click="generate(project.key)">
          {{ generatingThis ? "Generating…" : "Regenerate anonymously" }}
        </button>
      </div>
    </section>

    <section class="card texts">
      <header class="texts-head">
        <h3>Texts</h3>
        <LocaleTabs :status="localeStatus" />
        <button v-if="!analysis" class="btn primary" :disabled="busy" @click="generate(project.key)">
          {{ generatingThis ? "Generating…" : "Generate texts" }}
        </button>
      </header>
      <p v-if="!analysis" class="muted intro-text">
        JAPS writes these from the project's facts (about a cent with the default model). You can also write them yourself.
      </p>
      <p v-if="result" class="muted result">
        Generated with {{ result.model }} · {{ result.usage.input }} + {{ result.usage.output }} tokens.
        <template v-if="result.dropped.length">The grounding check removed {{ result.dropped.length }} sentence(s) with numbers not in the facts.</template>
        <template v-for="w in result.warnings" :key="w"><br />⚠ {{ w }}</template>
      </p>
      <LocalizedField :project-key="project.key" field="title" label="Title" :generated="analysis?.copy.title" />
      <LocalizedField :project-key="project.key" field="summary" label="Summary" :generated="analysis?.copy.summary" :max-length="200" hint="One or two sentences on the project card." />
      <LocalizedField :project-key="project.key" field="description" label="Description" :generated="analysis?.copy.description" multiline hint="Markdown, on the project's own page." />
      <LocalizedField :project-key="project.key" field="role" label="Your role" :generated="analysis?.copy.role" />
      <div class="field">
        <span class="field-label">Tags</span>
        <TagInput :model-value="tags" placeholder="Add a technology and press Enter" @update:model-value="setTagList" />
      </div>
    </section>

    <section v-if="desktop || mobile" class="card">
      <header class="card-head"><h3>Screenshots</h3></header>
      <div class="shots">
        <img v-if="desktop" :src="desktop" alt="Desktop screenshot" class="desktop" />
        <img v-if="mobile" :src="mobile" alt="Mobile screenshot" class="mobile" />
      </div>
    </section>

    <details class="card advanced">
      <summary>Advanced</summary>
      <label class="field">
        <span class="field-label">Screenshot page</span>
        <input
          type="url"
          :value="screenshotUrl"
          :placeholder="site?.url ?? 'https://…'"
          @change="setScreenshotUrl(($event.target as HTMLInputElement).value)"
        />
        <span class="muted hint">Take screenshots of another page, e.g. a demo, instead of the site's home page.</span>
      </label>
      <div class="field">
        <span class="field-label">Project key</span>
        <code class="key">{{ project.key }}</code>
        <span class="muted hint">How japs.config.json refers to this project.</span>
      </div>
    </details>
  </section>
</template>

<style scoped>
.detail { display: grid; gap: 14px; }
h3 { margin: 0; font-size: 15px; }
.hero { grid-template-columns: 220px minmax(0, 1fr); align-items: center; gap: 18px; }
.shot {
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 12px;
}
.shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; }
.intro { display: grid; gap: 8px; align-content: center; min-width: 0; }
.intro h2 { margin: 0; font-size: 24px; line-height: 1.2; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; }
.pill {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--muted);
}
.pill.on { background: color-mix(in srgb, var(--ok) 14%, transparent); border-color: transparent; color: var(--ok); }
.pill.star { color: #b7791f; background: color-mix(in srgb, #e3a008 16%, transparent); border-color: transparent; }
.pill.warn { color: var(--warn); background: var(--warn-soft); border-color: transparent; }
.site { font-size: 13px; text-decoration: none; width: fit-content; }
.site:hover { text-decoration: underline; }
.client-label { display: grid; gap: 6px; }
.row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.row-head label { font-size: 13px; font-weight: 600; }
.warn-text { color: var(--warn); font-size: 13px; }
.notice.action { display: flex; gap: 12px; align-items: center; justify-content: space-between; }
.notice.action .btn { flex-shrink: 0; }
.texts { gap: 18px; }
.texts-head { display: flex; align-items: center; gap: 12px; }
.texts-head .btn { margin-left: auto; }
.intro-text { margin: -8px 0 0; font-size: 13px; }
.result { margin: -8px 0 0; font-size: 12px; }
.field { display: grid; gap: 6px; }
.field-label { font-weight: 600; }
.hint { font-size: 12px; }
.shots { display: grid; grid-template-columns: minmax(0, 420px) 96px; gap: 12px; align-items: start; }
.shots img { width: 100%; border: 1px solid var(--border); border-radius: 8px; display: block; }
.shots .desktop:only-child { grid-column: 1 / -1; max-width: 420px; }
.advanced summary { cursor: pointer; font-weight: 600; color: var(--muted); }
.advanced[open] summary { margin-bottom: 4px; }
.key { font-size: 12px; padding: 4px 8px; background: var(--bg); border-radius: 6px; width: fit-content; }
@media (max-width: 640px) {
  .hero { grid-template-columns: 1fr; }
  .texts-head { flex-wrap: wrap; }
}
</style>
