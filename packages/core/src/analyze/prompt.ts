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

/** What the prompt asks for. Validation allows up to SUMMARY_LIMIT, the portfolio.json maximum. */
export const SUMMARY_MAX = 160;
export const SUMMARY_LIMIT = 200;

export function systemPrompt(locales: string[]): string {
  const languages = locales.map((l) => `"${l}" (${languageName(l)})`).join(", ");
  return [
    "You write the project texts of a freelance web developer's portfolio. The readers are potential clients: they want to know what was built, for whom, and how well.",
    "",
    "Use only the facts in the user message. They were extracted from the project's repository, its Netlify deploy and the live site.",
    "Do not invent features, users, clients, results, numbers or dates. If the facts are thin, write less rather than more.",
    "",
    "Content:",
    "- Lead with what the product does and for whom. Technology comes second, by its common name (Supabase, not @supabase/supabase-js).",
    "- Write about the product, not the repository: no sentences starting with what the repository contains.",
    "- Leave out implementation trivia: package names, version numbers of anything (write Vue, not Vue 3), config files, dev dependencies, tests and tooling, migrations and seed scripts, repository layout, the language of the website, domains and URLs (links are shown separately).",
    "- The README is a source of facts about the product, not of development notes: skip TODOs, setup steps and remarks about the development environment.",
    "- Mention the size of the work (commits, pull requests) only when it is substantial, in one short clause.",
    "- Serverless or scheduled functions: describe what they do in plain words, not their identifiers.",
    "- Numbers only as they appear in the facts (commits, pull requests, Lighthouse scores). Do not compute new ones such as durations or totals. Dates at most as month and year; the period is shown separately, so usually skip it.",
    "- Describe the project, not the developer: no first person, no sentences about the developer as a person.",
    "- Plain, concrete sentences. No marketing superlatives (cutting-edge, seamless, revolutionary, robust, powerful).",
    "",
    `Write every text field in each of these languages: ${languages}. Each version must read as if written natively in that language, not translated word for word; the facts stay the same.`,
    "",
    "Fields:",
    "- title: the product's name, short (from the README or site title rather than a repository slug). A name, not a sentence.",
    `- summary: one sentence, at most ${SUMMARY_MAX} characters: what it is and for whom.`,
    "- description: 2 short Markdown paragraphs, no headings, about 90 words in total: first what it does and for whom; then how it is built and anything notable (automation through functions, Lighthouse scores, the size of the work).",
    '- role: the scope of the work as a short noun phrase that names no person, so it needs no grammatical gender (e.g. "Design and full-stack development", "Frontend development in a team"). Without facts saying otherwise, the whole project was built by one developer; if other people committed, it was teamwork.',
    "- tags: 3 to 8 technologies from the allowed list, most important first.",
    "",
    "README text from private repositories is context only: paraphrase, never quote it.",
  ].join("\n");
}

/** Month precision is all the copy may use, and it keeps day-level noise out of the text. */
const month = (date: string | null) => date?.slice(0, 7) ?? null;

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
        commits: r.commits
          ? { count: r.commits.count, firstMonth: month(r.commits.first), lastMonth: month(r.commits.last) }
          : undefined,
        pullRequests: r.pullRequests || undefined,
        readme: anonymize || !r.readme ? undefined : { private: r.private || undefined, ...r.readme },
        // Raw dependency lists invite package-name jargon; `technologies` carries what they mean.
      })),
    sites: facts.sites.map((s) => {
      const handWritten = s.deploy?.functions.filter((f) => !f.generator) ?? [];
      return {
        framework: s.framework ?? undefined,
        // Identifiers hint at features ("send-order-confirmation"); anonymized, only the count.
        functions: handWritten.length ? (anonymize ? handWritten.length : handWritten.map((f) => f.name)) : undefined,
        scheduledFunctions: s.deploy?.scheduledFunctions.length || undefined,
        edgeFunctions: s.deploy?.edgeFunctions || undefined,
        lighthouse: s.deploy?.lighthouse ?? undefined,
        siteTitle: anonymize ? undefined : (s.live?.title ?? s.live?.og.title ?? undefined),
        siteDescription: anonymize ? undefined : (s.live?.description ?? s.live?.og.description ?? undefined),
      };
    }),
    technologies: facts.tech.map((t) => `${t.name} (${t.category})`),
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
