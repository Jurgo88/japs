import type { HiddenReason, Project, ProjectsFile, Repo, RepoId, Site } from "@japs/schema";
import { ProjectsFile as ProjectsFileSchema } from "@japs/schema";
import { isRandomNetlifyName, latest, normalizeDomain, repoIdFromGitHubUrl, slugify } from "./normalize.ts";
import type { PairingOptions, RepoInput, SiteInput } from "./types.ts";

const DEFAULT_STALE_MONTHS = 24;

export function toRepo(input: RepoInput): Repo {
  const id = repoIdFromGitHubUrl(input.url) ?? input.fullName.toLowerCase();
  return {
    id,
    provider: "github",
    fullName: input.fullName,
    url: input.url,
    private: input.private,
    fork: input.fork,
    archived: input.archived,
    homepage: input.homepage || null,
    language: input.language,
    topics: input.topics,
    description: input.description,
    pushedAt: input.pushedAt,
  };
}

/** Resolves the repo for a site, in priority order. See docs/spec/discovery.md, step 2. */
export function resolveSiteRepo(site: SiteInput): Pick<Site, "repoId" | "matchSource"> {
  const fromRepoUrl = repoIdFromGitHubUrl(site.repoUrl);
  if (fromRepoUrl) return { repoId: fromRepoUrl, matchSource: "repo_url" };

  const fromCommit = repoIdFromGitHubUrl(site.deploy?.commitUrl);
  if (fromCommit) return { repoId: fromCommit, matchSource: "commit_url" };

  const fromReview = repoIdFromGitHubUrl(site.deploy?.reviewUrl);
  if (fromReview) return { repoId: fromReview, matchSource: "review_url" };

  return { repoId: null, matchSource: "none" };
}

export function toSite(input: SiteInput): Site {
  const domain = normalizeDomain(input.customDomain) ?? normalizeDomain(input.url) ?? input.name;
  return {
    id: input.id,
    provider: "netlify",
    name: input.name,
    domain,
    url: input.customDomain ? `https://${domain}` : input.url,
    hasCustomDomain: Boolean(input.customDomain),
    framework: input.deploy?.framework ?? null,
    screenshotUrl: input.deploy?.screenshotUrl ?? null,
    lastDeployAt: input.deploy?.publishedAt ?? null,
    deployContext: input.deploy?.context ?? "unknown",
    ...resolveSiteRepo(input),
  };
}

/**
 * Step 4: a site with no repo link can still be matched from the other side,
 * when some repo's `homepage` points at the site's domain.
 */
function matchByHomepage(sites: Site[], repos: Repo[]): Site[] {
  const repoByDomain = new Map<string, RepoId>();
  for (const repo of repos) {
    const domain = normalizeDomain(repo.homepage);
    if (domain && !repoByDomain.has(domain)) repoByDomain.set(domain, repo.id);
  }
  return sites.map((site) => {
    if (site.repoId) return site;
    const repoId = repoByDomain.get(site.domain);
    return repoId ? { ...site, repoId, matchSource: "homepage" } : site;
  });
}

function monthsBetween(from: string, to: Date): number {
  const ms = to.getTime() - Date.parse(from);
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

function hiddenReasonsFor(
  repo: Repo | undefined,
  sites: Site[],
  lastActivityAt: string | null,
  options: Required<PairingOptions>,
): HiddenReason[] {
  const reasons: HiddenReason[] = [];
  if (repo?.fork) reasons.push("fork");
  if (repo?.archived) reasons.push("archived");

  if (sites.length > 0) {
    if (sites.every((s) => s.lastDeployAt === null)) reasons.push("no-deploy");
    else if (sites.every((s) => s.deployContext === "deploy-preview")) reasons.push("preview-only");

    if (!repo && sites.every((s) => isRandomNetlifyName(s.name) && !s.hasCustomDomain)) {
      reasons.push("random-name");
    }
  }

  if (lastActivityAt && monthsBetween(lastActivityAt, options.now) > options.staleAfterMonths) {
    reasons.push("stale");
  }
  return reasons;
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  taken.add(slug);
  return slug;
}

/**
 * Pure pairing: sites + repos -> projects. No network, no I/O.
 * Grouping rules (ADR 0003): one project per repo with all its sites;
 * sites without a repo and repos without a site become their own projects.
 */
export function buildProjects(
  siteInputs: SiteInput[],
  repoInputs: RepoInput[],
  opts: PairingOptions = {},
): ProjectsFile {
  const options: Required<PairingOptions> = {
    staleAfterMonths: opts.staleAfterMonths ?? DEFAULT_STALE_MONTHS,
    now: opts.now ?? new Date(),
  };

  const repos = repoInputs.map(toRepo);
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const sites = matchByHomepage(siteInputs.map(toSite), repos);

  // Group sites by repo, preserving first-seen order for stable output.
  const sitesByRepo = new Map<RepoId, Site[]>();
  const orphanSites: Site[] = [];
  for (const site of sites) {
    if (!site.repoId) {
      orphanSites.push(site);
      continue;
    }
    const group = sitesByRepo.get(site.repoId) ?? [];
    group.push(site);
    sitesByRepo.set(site.repoId, group);
  }

  const taken = new Set<string>();
  const projects: Project[] = [];

  const makeProject = (repoId: RepoId | null, projectSites: Site[]): Project => {
    const repo = repoId ? repoById.get(repoId) : undefined;
    const repoName = repo?.fullName.split("/")[1] ?? repoId?.split("/")[1];
    const title = repoName ?? projectSites[0]?.name ?? "project";
    const lastActivityAt = projectSites.reduce<string | null>(
      (acc, s) => latest(acc, s.lastDeployAt),
      repo?.pushedAt ?? null,
    );
    const hiddenReasons = hiddenReasonsFor(repo, projectSites, lastActivityAt, options);
    return {
      slug: uniqueSlug(slugify(title), taken),
      title,
      repoIds: repoId ? [repoId] : [],
      siteIds: projectSites.map((s) => s.id),
      lastActivityAt,
      // A repo we can't see (not in the repo list) is treated as private: never expose it.
      private: repoId ? (repo?.private ?? true) : false,
      hidden: hiddenReasons.length > 0,
      hiddenReasons,
    };
  };

  for (const [repoId, group] of sitesByRepo) projects.push(makeProject(repoId, group));
  for (const site of orphanSites) projects.push(makeProject(null, [site]));
  for (const repo of repos) {
    if (!sitesByRepo.has(repo.id)) projects.push(makeProject(repo.id, []));
  }

  projects.sort((a, b) => (Date.parse(b.lastActivityAt ?? "0") || 0) - (Date.parse(a.lastActivityAt ?? "0") || 0));

  const file: ProjectsFile = {
    version: 1,
    generatedAt: options.now.toISOString(),
    stats: {
      sites: sites.length,
      repos: repos.length,
      projects: projects.length,
      pairedSites: sites.filter((s) => s.repoId !== null).length,
      hiddenProjects: projects.filter((p) => p.hidden).length,
    },
    repos,
    sites,
    projects,
  };

  return ProjectsFileSchema.parse(file);
}
