import type {
  ClientSignal,
  HiddenReason,
  ManualLink,
  Project,
  ProjectKey,
  ProjectMerge,
  ProjectsFile,
  Repo,
  RepoId,
  Site,
} from "@japs/schema";
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
    ownerType: input.ownerType,
    private: input.private,
    fork: input.fork,
    archived: input.archived,
    empty: input.empty,
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
    provider: input.provider ?? "netlify",
    name: input.name,
    domain,
    url: input.customDomain ? `https://${domain}` : input.url,
    hasCustomDomain: Boolean(input.customDomain),
    framework: input.deploy?.framework ?? null,
    screenshotUrl: input.deploy?.screenshotUrl ?? null,
    lastDeployAt: input.deploy?.publishedAt ?? null,
    deployId: input.deploy?.id ?? null,
    deployContext: input.deploy?.context ?? "unknown",
    committer: input.deploy?.committer ?? null,
    ...resolveSiteRepo(input),
  };
}

/** Stable key used by japs.config.json (ADR 0004): the repo when there is one, else the site. */
export function projectKey(repoId: RepoId | null, siteId: string | undefined): ProjectKey {
  if (repoId) return `repo:${repoId}`;
  if (siteId) return `site:${siteId}`;
  throw new Error("A project needs a repo or a site");
}

/** Manual links from the config win over everything discovered (matchSource "manual"). */
function applyManualLinks(sites: Site[], links: ManualLink[], warnings: string[]): Site[] {
  const linkBySite = new Map(links.map((l) => [l.site, l]));
  for (const id of linkBySite.keys()) {
    if (!sites.some((s) => s.id === id)) warnings.push(`links: site "${id}" not found on Netlify or Cloudflare`);
  }
  return sites.map((site) => {
    const link = linkBySite.get(site.id);
    return link ? { ...site, repoId: link.repo, matchSource: "manual" } : site;
  });
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
    // A manual detach (repo: null) is a decision, not a gap to fill.
    if (site.repoId || site.matchSource === "manual") return site;
    const repoId = repoByDomain.get(site.domain);
    return repoId ? { ...site, repoId, matchSource: "homepage" } : site;
  });
}

function monthsBetween(from: string, to: Date): number {
  const ms = to.getTime() - Date.parse(from);
  return ms / (1000 * 60 * 60 * 24 * 30.4375);
}

interface Group {
  key: ProjectKey;
  /** First one is the primary repo (title, slug). */
  repoIds: RepoId[];
  sites: Site[];
}

function hiddenReasonsFor(
  repos: Repo[],
  group: Group,
  isPrivate: boolean,
  lastActivityAt: string | null,
  options: { staleAfterMonths: number; now: Date },
): HiddenReason[] {
  const reasons: HiddenReason[] = [];
  // With merged projects, one non-fork repo is enough to keep it.
  if (repos.length > 0 && repos.every((r) => r.fork)) reasons.push("fork");
  if (repos.length > 0 && repos.every((r) => r.archived)) reasons.push("archived");

  const { sites } = group;
  if (sites.length === 0 && repos.length > 0 && repos.every((r) => r.empty)) reasons.push("empty");
  if (sites.length > 0) {
    if (sites.every((s) => s.lastDeployAt === null)) reasons.push("no-deploy");
    else if (sites.every((s) => s.deployContext === "deploy-preview")) reasons.push("preview-only");

    if (group.repoIds.length === 0 && sites.every((s) => s.provider === "netlify" && isRandomNetlifyName(s.name) && !s.hasCustomDomain)) {
      reasons.push("random-name");
    }
  }

  if (lastActivityAt && monthsBetween(lastActivityAt, options.now) > options.staleAfterMonths) {
    reasons.push("stale");
  }
  if (isPrivate) reasons.push("private");
  return reasons;
}

/**
 * Suggests client work (kickoff, Phase 0 finding 6). Committer and owner signals need
 * the account login; without a GitHub token only organization repos are detected.
 */
function clientSignalsFor(group: Group, repoById: Map<RepoId, Repo>, accountLogin: string | null): ClientSignal[] {
  const me = accountLogin?.toLowerCase() ?? null;
  const signals: ClientSignal[] = [];
  if (me && group.sites.some((s) => s.committer && s.committer.toLowerCase() !== me)) {
    signals.push("foreign-committer");
  }
  if (group.repoIds.some((id) => repoById.get(id)?.ownerType === "organization")) {
    signals.push("organization-repo");
  }
  // A repo we can't see is checked by its owner too: its type is unknown, the owner isn't.
  const isForeignUserRepo = (id: RepoId) => repoById.get(id)?.ownerType !== "organization" && id.split("/")[0] !== me;
  if (me && group.repoIds.some(isForeignUserRepo)) signals.push("foreign-repo-owner");
  return signals;
}

/** Folds `from` groups into `into` groups, in config order. */
function applyMerges(groups: Map<ProjectKey, Group>, merges: ProjectMerge[], warnings: string[]): void {
  for (const merge of merges) {
    const target = groups.get(merge.into);
    if (!target) {
      warnings.push(`merge: project "${merge.into}" not found`);
      continue;
    }
    for (const key of merge.from) {
      const source = groups.get(key);
      if (!source) {
        warnings.push(`merge: project "${key}" not found`);
        continue;
      }
      target.repoIds.push(...source.repoIds);
      target.sites.push(...source.sites);
      groups.delete(key);
    }
  }
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
 * Config decisions (ADR 0004) are applied on top: manual links, merges, visibility.
 */
export function buildProjects(
  siteInputs: SiteInput[],
  repoInputs: RepoInput[],
  opts: PairingOptions = {},
): ProjectsFile {
  const options = {
    staleAfterMonths: opts.staleAfterMonths ?? DEFAULT_STALE_MONTHS,
    now: opts.now ?? new Date(),
  };
  const overrides = opts.projects ?? {};
  const accountLogin = opts.accountLogin ?? null;
  const warnings: string[] = [];

  const repos = repoInputs.map(toRepo);
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const own = new Set(opts.portfolioSiteIds ?? []);
  const sites = matchByHomepage(
    applyManualLinks(
      siteInputs.filter((s) => !own.has(s.id)).map(toSite),
      opts.links ?? [],
      warnings,
    ),
    repos,
  );

  // Group sites by repo, preserving first-seen order for stable output.
  const groups = new Map<ProjectKey, Group>();
  for (const site of sites) {
    const key = projectKey(site.repoId, site.id);
    const group = groups.get(key) ?? { key, repoIds: site.repoId ? [site.repoId] : [], sites: [] };
    group.sites.push(site);
    groups.set(key, group);
  }
  for (const repo of repos) {
    const key = projectKey(repo.id, undefined);
    if (!groups.has(key)) groups.set(key, { key, repoIds: [repo.id], sites: [] });
  }
  applyMerges(groups, opts.merge ?? [], warnings);

  const taken = new Set<string>();
  const makeProject = (group: Group): Project => {
    const knownRepos = group.repoIds.flatMap((id) => repoById.get(id) ?? []);
    const primaryId = group.repoIds[0];
    const primary = primaryId ? repoById.get(primaryId) : undefined;
    const title = primary?.fullName.split("/")[1] ?? primaryId?.split("/")[1] ?? group.sites[0]?.name ?? "project";
    const lastActivityAt = [
      ...knownRepos.map((r) => r.pushedAt),
      ...group.sites.map((s) => s.lastDeployAt),
    ].reduce<string | null>(latest, null);
    // A repo we can't see (not in the repo list) is treated as private: never expose it.
    const isPrivate = group.repoIds.some((id) => repoById.get(id)?.private ?? true);
    const hiddenReasons = hiddenReasonsFor(knownRepos, group, isPrivate, lastActivityAt, options);
    const clientSignals = clientSignalsFor(group, repoById, accountLogin);
    // Client work stays unpublished until hidden: false (ADR 0004); isClient: false dismisses the suggestion.
    const isClient = overrides[group.key]?.isClient ?? clientSignals.length > 0;
    if (isClient) hiddenReasons.push("client");
    return {
      key: group.key,
      slug: uniqueSlug(slugify(title), taken),
      title,
      repoIds: group.repoIds,
      siteIds: group.sites.map((s) => s.id),
      lastActivityAt,
      private: isPrivate,
      hidden: overrides[group.key]?.hidden ?? hiddenReasons.length > 0,
      hiddenReasons,
      clientSignals,
    };
  };
  const projects = [...groups.values()].map(makeProject);

  const mergedAway = new Set((opts.merge ?? []).flatMap((m) => m.from));
  for (const key of Object.keys(overrides)) {
    if (groups.has(key)) continue;
    warnings.push(
      mergedAway.has(key)
        ? `projects: "${key}" was merged into another project; move its settings to the "into" key`
        : `projects: "${key}" not found`,
    );
  }

  projects.sort((a, b) => (Date.parse(b.lastActivityAt ?? "0") || 0) - (Date.parse(a.lastActivityAt ?? "0") || 0));

  const file: ProjectsFile = {
    version: 1,
    generatedAt: options.now.toISOString(),
    account: { github: accountLogin },
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
    warnings,
  };

  return ProjectsFileSchema.parse(file);
}
