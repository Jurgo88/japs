import { isPublished } from "@japs/core";
import { JapsConfig, type JapsConfigInput, type Project, type ProjectAnalysis } from "@japs/schema";
import { computed, reactive, ref } from "vue";
import {
  BackendError,
  type BuildSummary,
  type EditorBackend,
  type EditorState,
  type GenerateSummary,
  LocalBackend,
} from "./backend.ts";

/** One reactive store: the loaded snapshot, the config draft, and save/build status. */
export const backend: EditorBackend = new LocalBackend();

export const state = ref<EditorState | null>(null);
export const draft = ref<JapsConfigInput>({ version: 1 });
const savedJson = ref("");

export const status = reactive<{
  loading: boolean;
  saving: boolean;
  building: boolean;
  error: string | null;
  issues: string[];
  build: BuildSummary | null;
  /** Project key whose texts are being generated. */
  generating: string | null;
  generated: (GenerateSummary & { key: string }) | null;
}>({ loading: true, saving: false, building: false, error: null, issues: [], build: null, generating: null, generated: null });

export const dirty = computed(() => JSON.stringify(draft.value) !== savedJson.value);

/** The draft with defaults applied, for logic that needs a complete config. */
export const parsedConfig = computed(() => {
  const parsed = JapsConfig.safeParse(draft.value);
  return parsed.success ? parsed.data : JapsConfig.parse({ version: 1 });
});

export const locales = computed(() => parsedConfig.value.locales);
export const defaultLocale = computed(() => parsedConfig.value.defaultLocale);

/** Analysis per project key, and keys analyzed anonymously. */
export const analysisByKey = computed(
  () => new Map<string, ProjectAnalysis>(state.value?.analysis?.projects.map((a) => [a.key, a]) ?? []),
);

export const published = (project: Project) => isPublished(project, parsedConfig.value);

/** Display name: generated title in the default locale, else the discovery title. */
export const projectTitle = (project: Project) =>
  draft.value.projects?.[project.key]?.copy?.title?.[defaultLocale.value] ??
  analysisByKey.value.get(project.key)?.copy.title[defaultLocale.value] ??
  project.title;

/** Same order as `japs build`: config order, then last activity. */
export function sortProjects(projects: Project[]): Project[] {
  const order = (p: Project) => draft.value.projects?.[p.key]?.order ?? Number.POSITIVE_INFINITY;
  return [...projects].sort(
    (a, b) => order(a) - order(b) || (Date.parse(b.lastActivityAt ?? "") || 0) - (Date.parse(a.lastActivityAt ?? "") || 0),
  );
}

function fail(err: unknown): void {
  status.error = err instanceof Error ? err.message : String(err);
  status.issues = err instanceof BackendError ? err.issues : [];
}

export async function load(): Promise<void> {
  status.loading = true;
  try {
    const loaded = await backend.load();
    state.value = loaded;
    draft.value = loaded.config;
    savedJson.value = loaded.configExists ? JSON.stringify(loaded.config) : "";
    status.error = null;
  } catch (err) {
    fail(err);
  } finally {
    status.loading = false;
  }
}

export async function save(): Promise<boolean> {
  status.saving = true;
  try {
    await backend.saveConfig(draft.value);
    savedJson.value = JSON.stringify(draft.value);
    if (state.value) state.value.configExists = true;
    status.error = null;
    status.issues = [];
    return true;
  } catch (err) {
    fail(err);
    return false;
  } finally {
    status.saving = false;
  }
}

/** Saves first, so the build always reflects what the editor shows. */
export async function saveAndBuild(): Promise<void> {
  if (dirty.value && !(await save())) return;
  status.building = true;
  try {
    status.build = await backend.build();
    if (state.value) state.value.built = true;
    status.error = null;
  } catch (err) {
    fail(err);
  } finally {
    status.building = false;
  }
}

export function update(edit: (config: JapsConfigInput) => JapsConfigInput): void {
  draft.value = edit(draft.value);
}

/**
 * Facts + texts for one project. Saves first: generation reads the config on disk
 * (anonymization decides what the LLM may see). Then reloads the analysis.
 */
export async function generate(key: string): Promise<void> {
  if (dirty.value && !(await save())) return;
  status.generating = key;
  try {
    const summary = await backend.generate(key);
    const loaded = await backend.load();
    if (state.value) {
      state.value.analysis = loaded.analysis;
      state.value.projects = loaded.projects;
    }
    status.generated = { ...summary, key };
    status.error = null;
  } catch (err) {
    fail(err);
  } finally {
    status.generating = null;
  }
}
