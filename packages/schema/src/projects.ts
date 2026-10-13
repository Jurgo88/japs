import { z } from "zod";

/** How a site was linked to a repository. See docs/spec/discovery.md. */
export const MatchSource = z.enum([
  "repo_url",
  "commit_url",
  "review_url",
  "homepage",
  "manual",
  "none",
]);
export type MatchSource = z.infer<typeof MatchSource>;

export const DeployContext = z.enum(["production", "deploy-preview", "branch-deploy", "unknown"]);
export type DeployContext = z.infer<typeof DeployContext>;

/** Normalized repository identity, e.g. "jurgo88/japs" (lowercase). */
export const RepoId = z
  .string()
  .regex(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/, "expected lowercase owner/repo");
export type RepoId = z.infer<typeof RepoId>;

export const Repo = z.object({
  id: RepoId,
  provider: z.literal("github"),
  /** Original casing as returned by the provider, for display. */
  fullName: z.string(),
  url: z.string().url(),
  ownerType: z.enum(["user", "organization"]),
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
  /** No commits yet. */
  empty: z.boolean(),
  homepage: z.string().nullable(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
  description: z.string().nullable(),
  pushedAt: z.string().datetime().nullable(),
});
export type Repo = z.infer<typeof Repo>;

export const Site = z.object({
  id: z.string(),
  provider: z.literal("netlify"),
  name: z.string(),
  /** Primary host without protocol, "www." or trailing slash. */
  domain: z.string(),
  url: z.string().url(),
  hasCustomDomain: z.boolean(),
  framework: z.string().nullable(),
  screenshotUrl: z.string().url().nullable(),
  lastDeployAt: z.string().datetime().nullable(),
  /** Current published deploy; facts extraction reads its details. */
  deployId: z.string().nullable(),
  deployContext: DeployContext,
  /** Git login of whoever made the commit behind the current deploy. */
  committer: z.string().nullable(),
  repoId: RepoId.nullable(),
  matchSource: MatchSource,
});
export type Site = z.infer<typeof Site>;

export const HiddenReason = z.enum([
  "fork",
  "archived",
  "no-deploy",
  "preview-only",
  "stale",
  "random-name",
  /** Repo without commits and without a site. */
  "empty",
  /** Private repo: unpublished until the config sets hidden: false (ADR 0004). */
  "private",
  /** Looks like client work and the config hasn't said otherwise (isClient: false). */
  "client",
]);
export type HiddenReason = z.infer<typeof HiddenReason>;

/** Why a project looks like client work. A suggestion only; the user confirms with isClient. */
export const ClientSignal = z.enum([
  /** The current deploy was committed by someone other than the account owner. */
  "foreign-committer",
  /** The repo belongs to a GitHub organization. */
  "organization-repo",
  /** The repo belongs to another user (the account owner is a collaborator). */
  "foreign-repo-owner",
]);
export type ClientSignal = z.infer<typeof ClientSignal>;

export const Project = z.object({
  /** Stable reference used by japs.config.json: "repo:<owner>/<repo>" or "site:<netlify id>". */
  key: z.string(),
  slug: z.string(),
  title: z.string(),
  repoIds: z.array(RepoId),
  siteIds: z.array(z.string()),
  /** Max of repo pushedAt and site lastDeployAt. */
  lastActivityAt: z.string().datetime().nullable(),
  private: z.boolean(),
  /** Config override when set, otherwise hiddenReasons.length > 0. */
  hidden: z.boolean(),
  hiddenReasons: z.array(HiddenReason),
  /** Non-empty = suggested as client work. */
  clientSignals: z.array(ClientSignal),
});
export type Project = z.infer<typeof Project>;

export const ProjectsFile = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
  /** GitHub login of the token owner; null without a GitHub token. */
  account: z.object({ github: z.string().nullable() }),
  stats: z.object({
    sites: z.number().int(),
    repos: z.number().int(),
    projects: z.number().int(),
    pairedSites: z.number().int(),
    hiddenProjects: z.number().int(),
  }),
  repos: z.array(Repo),
  sites: z.array(Site),
  projects: z.array(Project),
  /** Config entries that matched nothing (renamed repo, deleted site, typo). */
  warnings: z.array(z.string()),
});
export type ProjectsFile = z.infer<typeof ProjectsFile>;
