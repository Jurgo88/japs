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
  private: z.boolean(),
  fork: z.boolean(),
  archived: z.boolean(),
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
  deployContext: DeployContext,
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
]);
export type HiddenReason = z.infer<typeof HiddenReason>;

export const Project = z.object({
  slug: z.string(),
  title: z.string(),
  repoIds: z.array(RepoId),
  siteIds: z.array(z.string()),
  /** Max of repo pushedAt and site lastDeployAt. */
  lastActivityAt: z.string().datetime().nullable(),
  private: z.boolean(),
  hidden: z.boolean(),
  hiddenReasons: z.array(HiddenReason),
});
export type Project = z.infer<typeof Project>;

export const ProjectsFile = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime(),
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
});
export type ProjectsFile = z.infer<typeof ProjectsFile>;
