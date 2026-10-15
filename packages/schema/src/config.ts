import { z } from "zod";
import { Link, Locale, LocalizedText } from "./portfolio.ts";
import { RepoId } from "./projects.ts";
import { PublishTarget } from "./publish.ts";
import { ThemeId } from "./themes.ts";

/**
 * japs.config.json — user decisions, written only by the user. See ADR 0004.
 * Objects are strict: a typo in a hand-edited key is an error, not a silent no-op.
 */

/** Stable project reference: "repo:<owner>/<repo>" or "site:<netlify site id>". Never a slug. */
export const ProjectKey = z
  .string()
  .regex(/^(repo:[a-z0-9_.-]+\/[a-z0-9_.-]+|site:[^\s]+)$/, 'expected "repo:<owner>/<repo>" (lowercase) or "site:<netlify id>"');
export type ProjectKey = z.infer<typeof ProjectKey>;

/** Text overrides may cover some locales only; the rest keeps the generated text. */
export const CopyOverride = z
  .object({
    title: LocalizedText,
    summary: LocalizedText,
    description: LocalizedText,
    role: LocalizedText,
    tags: z.array(z.string()),
  })
  .partial()
  .strict();
export type CopyOverride = z.infer<typeof CopyOverride>;

export const ProjectOverride = z
  .object({
    /** Explicit visibility. Unset = default filters decide (private repos stay hidden). */
    hidden: z.boolean(),
    isClient: z.boolean(),
    anonymize: z.boolean(),
    clientLabel: LocalizedText,
    /** Show screenshots of an anonymized project anyway. */
    allowScreenshots: z.boolean(),
    featured: z.boolean(),
    order: z.number().int(),
    /** Page to screenshot instead of the site root (e.g. a demo account). */
    screenshotUrl: z.string().url(),
    copy: CopyOverride,
  })
  .partial()
  .strict();
export type ProjectOverride = z.infer<typeof ProjectOverride>;

/** Attach a site to a repo, or detach a wrong pair with `repo: null`. */
export const ManualLink = z
  .object({
    site: z.string().min(1),
    repo: RepoId.nullable(),
  })
  .strict();
export type ManualLink = z.infer<typeof ManualLink>;

/** Fold projects `from` into project `into` (e.g. frontend + API repo). */
export const ProjectMerge = z
  .object({
    into: ProjectKey,
    from: z.array(ProjectKey).min(1),
  })
  .strict();
export type ProjectMerge = z.infer<typeof ProjectMerge>;

export const Profile = z
  .object({
    name: z.string(),
    headline: LocalizedText,
    bio: LocalizedText,
    location: z.string().nullable().default(null),
    links: z.array(Link).default([]),
    /** Contact address for the theme's call to action. */
    email: z.string().email().optional(),
    /** Shows an "available for projects" badge (true) or "not taking projects" (false). Unset = no badge. */
    available: z.boolean().optional(),
  })
  .strict();
export type Profile = z.infer<typeof Profile>;

export const JapsConfig = z
  .object({
    /** Editor hint only. */
    $schema: z.string().optional(),
    version: z.literal(1),
    locales: z.array(Locale).min(1).default(["en"]),
    defaultLocale: Locale.default("en"),
    /** Theme the portfolio is built with (ADR 0010). */
    theme: ThemeId.default("default"),
    /** Where `japs publish` and Publish in the editor put the site (ADR 0012). */
    publish: z
      .object({ target: PublishTarget.default("netlify") })
      .strict()
      .default({}),
    /** Required by `japs build`; discovery works without it. */
    profile: Profile.optional(),
    discovery: z
      .object({
        staleAfterMonths: z.number().int().positive().default(24),
        /** Also list repos of GitHub organizations the user belongs to. */
        includeOrgRepos: z.boolean().default(false),
      })
      .strict()
      .default({}),
    links: z.array(ManualLink).default([]),
    merge: z.array(ProjectMerge).default([]),
    projects: z.record(ProjectKey, ProjectOverride).default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    const { locales } = config;
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (!locales.includes(config.defaultLocale)) {
      issue(["defaultLocale"], `defaultLocale "${config.defaultLocale}" is not in locales`);
    }

    /** Full texts must cover every locale; overrides may cover a subset but nothing undeclared. */
    const check = (text: LocalizedText | undefined, path: (string | number)[], partial: boolean): void => {
      if (!text) return;
      const extra = Object.keys(text).filter((l) => !locales.includes(l));
      if (extra.length) issue(path, `locales: undeclared ${extra.join(", ")}`);
      const missing = partial ? [] : locales.filter((l) => !(l in text));
      if (missing.length) issue(path, `locales: missing ${missing.join(", ")}`);
    };

    if (config.profile) {
      check(config.profile.headline, ["profile", "headline"], false);
      check(config.profile.bio, ["profile", "bio"], false);
    }
    for (const [key, override] of Object.entries(config.projects)) {
      const at = ["projects", key];
      check(override.clientLabel, [...at, "clientLabel"], false);
      for (const field of ["title", "summary", "description", "role"] as const) {
        check(override.copy?.[field], [...at, "copy", field], true);
      }
    }

    const linkedSites = new Set<string>();
    config.links.forEach((link, i) => {
      if (linkedSites.has(link.site)) issue(["links", i, "site"], `site "${link.site}" is linked more than once`);
      linkedSites.add(link.site);
    });

    // A key may take part in at most one merge, and never on both sides.
    const merged = new Set<string>();
    config.merge.forEach((m, i) => {
      [m.into, ...m.from].forEach((key, j) => {
        const path = j === 0 ? ["merge", i, "into"] : ["merge", i, "from", j - 1];
        if (merged.has(key)) issue(path, `"${key}" appears in more than one merge`);
        merged.add(key);
      });
    });
  });
export type JapsConfig = z.infer<typeof JapsConfig>;
/** Shape before defaults are applied, i.e. what a user may write. */
export type JapsConfigInput = z.input<typeof JapsConfig>;
