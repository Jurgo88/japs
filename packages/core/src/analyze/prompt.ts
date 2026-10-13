import type { ProjectFacts } from "@japs/schema";

/** Per-project decisions from japs.config.json that shape the prompt. */
export interface PromptContext {
  /** Client work: role and wording reflect it. */
  isClient: boolean;
  /** No names, domains, URLs, README or package names are sent (ADR 0004, ai-pipeline spec). */
  anonymize: boolean;
  /** Someone other than the account owner committed the deployed code. */
  hasOtherCommitters: boolean;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  sk: "Slovak",
  cs: "Czech",
  de: "German",
  pl: "Polish",
  hu: "Hungarian",
  fr: "French",
  es: "Spanish",
  it: "Italian",
};
const languageName = (locale: string) => LANGUAGE_NAMES[locale.split("-")[0] ?? locale] ?? locale;

export const SUMMARY_MAX = 160;

export function systemPrompt(locales: string[]): string {
  const languages = locales.map((l) => `"${l}" (${languageName(l)})`).join(", ");
  return [
    "You write portfolio copy for a freelance web developer's projects.",
    "",
    "Use only the facts in the user message. They were extracted from the project's repository, its Netlify deploy and the live site.",
    "Do not invent features, users, clients, results, numbers or dates. If the facts are thin, write less rather than more.",
    "Write plainly and concretely, like a developer describing their own work. No marketing superlatives (cutting-edge, seamless, revolutionary, robust).",
    "",
    `Write every text field in each of these languages: ${languages}. Each language version must read as if written natively in that language, not translated word for word; the facts stay the same.`,
    "",
    "Fields:",
    "- title: a short human-readable project name. Prefer the product name from the README or site title over a repository slug.",
    `- summary: one sentence, at most ${SUMMARY_MAX} characters, what the project is and for whom.`,
    "- description: 2 to 4 short Markdown paragraphs, no headings: what it does, how it is built (main technologies), and anything notable in the facts (serverless or scheduled functions, Lighthouse scores, size of the work such as commits and pull requests).",
    "- role: the developer's role in a few words. Without facts saying otherwise, they built it alone. If other people committed to it, say they worked in a team.",
    "- tags: 3 to 8 technologies from the allowed list, most important first.",
    "",
    "README text from private repositories is context only: paraphrase, never quote it.",
  ].join("\n");
}

const iso = (date: string | null) => date?.slice(0, 10) ?? null;

/** The facts as the model sees them: compact, and stripped of identifying details when anonymized. */
export function promptFacts(facts: ProjectFacts, context: PromptContext): Record<string, unknown> {
  const { anonymize } = context;
  return {
    project: anonymize ? undefined : facts.title,
    clientWork: context.isClient,
    anonymized: anonymize || undefined,
    otherPeopleCommitted: context.hasOtherCommitters,
    repositories: facts.repos
      .filter((r) => r.accessible)
      .map((r) => ({
        description: anonymize ? undefined : r.description,
        topics: r.topics.length ? r.topics : undefined,
        languagesPercent: r.languages,
        commits: r.commits ? { count: r.commits.count, first: iso(r.commits.first), last: iso(r.commits.last) } : undefined,
        pullRequests: r.pullRequests ?? undefined,
        readme: anonymize || !r.readme ? undefined : { private: r.private || undefined, ...r.readme },
        packages: r.packages.map((p) => ({
          name: anonymize ? undefined : (p.name ?? undefined),
          dependencies: p.dependencies,
          devDependencies: p.devDependencies,
        })),
      })),
    sites: facts.sites.map((s) => {
      const handWritten = s.deploy?.functions.filter((f) => !f.generator) ?? [];
      return {
        domain: anonymize ? undefined : s.domain,
        framework: s.framework ?? undefined,
        lastDeploy: iso(s.lastDeployAt),
        functions: handWritten.length ? (anonymize ? handWritten.length : handWritten.map((f) => f.name)) : undefined,
        scheduledFunctions: s.deploy?.scheduledFunctions.length || undefined,
        edgeFunctions: s.deploy?.edgeFunctions || undefined,
        lighthouse: s.deploy?.lighthouse ?? undefined,
        siteTitle: anonymize ? undefined : (s.live?.title ?? s.live?.og.title ?? undefined),
        siteDescription: anonymize ? undefined : (s.live?.description ?? s.live?.og.description ?? undefined),
        siteLanguage: s.live?.lang ?? undefined,
      };
    }),
    technologies: facts.tech.map((t) => t.name),
  };
}

export function userPrompt(facts: ProjectFacts, context: PromptContext): string {
  // JSON.stringify drops undefined fields, which keeps the prompt short.
  return `Project facts:\n${JSON.stringify(promptFacts(facts, context), null, 1)}`;
}

/** Strict JSON Schema for ProjectCopy in the given locales; tags limited to known technologies. */
export function copyJsonSchema(locales: string[], techNames: string[]): Record<string, unknown> {
  const localized = (description: string) => ({
    type: "object",
    description,
    properties: Object.fromEntries(locales.map((l) => [l, { type: "string" }])),
    required: locales,
    additionalProperties: false,
  });
  return {
    type: "object",
    properties: {
      title: localized("Short project name"),
      summary: localized(`One sentence, max ${SUMMARY_MAX} characters`),
      description: localized("2-4 short Markdown paragraphs"),
      role: localized("Developer's role"),
      tags: {
        type: "array",
        description: "3-8 technologies, most important first",
        items: techNames.length ? { type: "string", enum: techNames } : { type: "string" },
      },
    },
    required: ["title", "summary", "description", "role", "tags"],
    additionalProperties: false,
  };
}
