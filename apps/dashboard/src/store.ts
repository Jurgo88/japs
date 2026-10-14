import { publishedWith } from "@japs/core";
import { JapsConfig, type JapsConfigInput, type Project, type ProjectAnalysis } from "@japs/schema";
import { computed, reactive, ref } from "vue";
import {
  type Account,
  BackendError,
  type BuildSummary,
  type EditorBackend,
  type EditorState,
  type GenerateSummary,
  HttpBackend,
} from "./backend.ts";

/** One reactive store: the loaded snapshot, the config draft, and save/build status. */
export const backend: EditorBackend = new HttpBackend();

/** Hosted version (ADR 0009): the signed-in account; null locally or when signed out. */
export const account = ref<Account | null>(null);
/** Hosted version and nobody is signed in: show the sign-in screen. */
export const signedOut = ref(false);
export const isCloud = computed(() => state.value?.mode === "cloud");

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
  /** Progress of "generate for all shown projects". */
  batch: { done: number; total: number; failed: string[]; tokens: number } | null;
}>({
  loading: true,
  saving: false,
  building: false,
  error: null,
  issues: [],
  build: null,
  generating: null,
  generated: null,
  batch: null,
});

export const dirty = computed(() => JSON.stringify(draft.value) !== savedJson.value);

// Read straight from the draft (with the schema's defaults): the draft may be temporarily
// invalid while the user types, and the UI must not jump around when it is.
export const locales = computed(() => draft.value.locales ?? ["en"]);
export const defaultLocale = computed(() => draft.value.defaultLocale ?? "en");

/** Problems that would stop Save, shown while editing instead of only after clicking. */
export const draftIssues = computed(() => {
  const parsed = JapsConfig.safeParse(draft.value);
  return parsed.success ? [] : parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
});

export const analysisByKey = computed(
  () => new Map<string, ProjectAnalysis>(state.value?.analysis?.projects.map((a) => [a.key, a]) ?? []),
);

export const published = (project: Project) => publishedWith(project, draft.value.projects?.[project.key]);

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
  // A failed OAuth round trip comes back as ?auth_error=… — show it, then clean the URL.
  const authError = new URLSearchParams(location.search).get("auth_error");
  if (authError) history.replaceState(null, "", location.pathname);
  try {
    const loaded = await backend.load();
    if (loaded.mode === "cloud") account.value = await backend.account();
    state.value = loaded;
    draft.value = loaded.config;
    savedJson.value = loaded.configExists ? JSON.stringify(loaded.config) : "";
    status.error = authError;
  } catch (err) {
    if (err instanceof BackendError && err.status === 401) {
      signedOut.value = true;
      status.error = authError;
    } else {
      fail(err);
    }
  } finally {
    status.loading = false;
  }
}

export async function signOut(): Promise<void> {
  await backend.signOut();
  location.reload();
}

export async function save(): Promise<boolean> {
  // A link row that was added but left empty is nothing, not an invalid URL.
  const profile = draft.value.profile;
  const links = profile?.links?.filter((l) => l.label.trim() || l.url.trim());
  if (profile && links && links.length !== profile.links?.length) {
    draft.value = { ...draft.value, profile: { ...profile, links } };
  }
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

/**
 * Shown projects that `japs build` would skip for lack of texts: never analyzed, or analyzed
 * with names although now anonymized.
 */
export const missingTexts = computed(() =>
  (state.value?.projects?.projects ?? []).filter((p) => {
    if (!published(p)) return false;
    const analysis = analysisByKey.value.get(p.key);
    return !analysis || (draft.value.projects?.[p.key]?.anonymize === true && !analysis.anonymized);
  }),
);

/** Generates texts for every project in `missingTexts`, one at a time, then reloads once. */
export async function generateMissing(): Promise<void> {
  if (dirty.value && !(await save())) return;
  const keys = missingTexts.value.map((p) => p.key);
  status.batch = { done: 0, total: keys.length, failed: [], tokens: 0 };
  for (const key of keys) {
    status.generating = key;
    try {
      const summary = await backend.generate(key);
      status.batch.tokens += summary.usage.input + summary.usage.output;
      if (!summary.generated) status.batch.failed.push(`${key}: ${summary.warnings.at(-1) ?? "no text generated"}`);
    } catch (err) {
      status.batch.failed.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
    status.batch.done++;
  }
  status.generating = null;
  const loaded = await backend.load();
  if (state.value) {
    state.value.analysis = loaded.analysis;
    state.value.projects = loaded.projects;
  }
}
