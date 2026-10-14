import type { JapsConfigInput, LocalizedText, Project, ProjectOverride } from "@japs/schema";
import { publishedWith } from "../build/portfolio.ts";

/**
 * Pure edits of japs.config.json for the editor (ADR 0007). Each returns a new config and
 * keeps it minimal: an override is stored only where it differs from the default.
 */

type Config = JapsConfigInput;
type Projects = NonNullable<Config["projects"]>;
type CopyField = "title" | "summary" | "description" | "role";

/**
 * JSON round-trip, not structuredClone: the editor passes Vue reactive proxies, which
 * structuredClone rejects (DataCloneError). The config is plain JSON anyway.
 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Removes empty objects left behind by edits, so the file stays readable. */
function prune(config: Config): Config {
  const projects: Projects = {};
  for (const [key, override] of Object.entries(config.projects ?? {})) {
    const copy = override.copy ? Object.fromEntries(Object.entries(override.copy).filter(([, v]) => v && Object.keys(v).length)) : undefined;
    const cleaned: ProjectOverride = { ...override, copy: copy && Object.keys(copy).length ? copy : undefined };
    for (const k of Object.keys(cleaned) as (keyof ProjectOverride)[]) {
      if (cleaned[k] === undefined) delete cleaned[k];
    }
    if (Object.keys(cleaned).length) projects[key] = cleaned;
  }
  return { ...config, projects };
}

function withOverride(config: Config, key: string, edit: (override: ProjectOverride) => void): Config {
  const next = clone(config);
  next.projects ??= {};
  const override = next.projects[key] ?? {};
  edit(override);
  next.projects[key] = override;
  return prune(next);
}

/** Visibility the filters give a project, ignoring any `hidden` override. */
export function defaultPublished(project: Project, config: Config): boolean {
  return publishedWith(project, { isClient: config.projects?.[project.key]?.isClient });
}

/** Shows or hides a project; stores `hidden` only when it differs from the filters. */
export function setPublished(config: Config, project: Project, publish: boolean): Config {
  const matchesDefault = defaultPublished(project, config) === publish;
  return withOverride(config, project.key, (o) => {
    o.hidden = matchesDefault ? undefined : !publish;
  });
}

/** Sets a simple override field; `undefined` (or false for flags) removes it. */
export function setOverride<K extends "isClient" | "anonymize" | "allowScreenshots" | "featured" | "screenshotUrl">(
  config: Config,
  key: string,
  field: K,
  value: ProjectOverride[K] | undefined,
): Config {
  return withOverride(config, key, (o) => {
    o[field] = value === false && field !== "isClient" ? undefined : value;
  });
}

/** Client label per locale; empty texts are dropped, an all-empty label is removed. */
export function setClientLabel(config: Config, key: string, label: LocalizedText): Config {
  const filled = Object.fromEntries(Object.entries(label).filter(([, v]) => v.trim()));
  return withOverride(config, key, (o) => {
    o.clientLabel = Object.keys(filled).length ? filled : undefined;
  });
}

/**
 * Overrides one generated text in one locale. Typing the generated text back (or clearing
 * the field) removes the override, so the next analysis can update it again.
 */
export function setCopyText(
  config: Config,
  key: string,
  field: CopyField,
  locale: string,
  value: string,
  generated: LocalizedText | undefined,
): Config {
  const trimmed = value.trim();
  const isGenerated = trimmed === "" || trimmed === (generated?.[locale] ?? "").trim();
  return withOverride(config, key, (o) => {
    const copy = { ...o.copy };
    const text = { ...copy[field] };
    if (isGenerated) delete text[locale];
    else text[locale] = trimmed;
    copy[field] = text;
    o.copy = copy;
  });
}

/** Overrides the tag list; the generated list (same order) removes the override. */
export function setTags(config: Config, key: string, tags: string[], generated: string[] | undefined): Config {
  const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
  const same = generated !== undefined && cleaned.join("\n") === generated.join("\n");
  return withOverride(config, key, (o) => {
    o.copy = { ...o.copy, tags: same ? undefined : cleaned };
  });
}

/** Stores the given order as 1..n; projects not listed lose their `order`. */
export function setOrder(config: Config, orderedKeys: string[]): Config {
  let next = clone(config);
  for (const key of Object.keys(next.projects ?? {})) {
    if (!orderedKeys.includes(key)) next = withOverride(next, key, (o) => (o.order = undefined));
  }
  orderedKeys.forEach((key, i) => {
    next = withOverride(next, key, (o) => (o.order = i + 1));
  });
  return next;
}
