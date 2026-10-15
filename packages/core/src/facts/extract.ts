import type { FactsFile, JapsConfig, Project, ProjectFacts, ProjectsFile, RepoFacts, SiteFacts } from "@japs/schema";
import { FactsFile as FactsFileSchema } from "@japs/schema";
import { isPublished } from "../build/portfolio.ts";
import type { GitHubClient } from "../discovery/github.ts";
import type { NetlifyClient } from "../discovery/netlify.ts";
import { fetchRepoFacts, inaccessibleRepoFacts } from "./github.ts";
import { fetchLiveSite } from "./live.ts";
import { fetchDeployFacts } from "./netlify.ts";
import { deriveTech } from "./tech.ts";
import { errorMessage, mapLimit, sha256Hex } from "./util.ts";

export interface ExtractFactsOptions {
  /** Netlify deploy details; without it (Cloudflare only), sites get live-site facts only. */
  netlify?: NetlifyClient | null;
  /** Without it, repo facts are limited to identity (Netlify and the live site still work). */
  github?: GitHubClient | null;
  /** Used for live sites. Default: global fetch. */
  fetch?: typeof fetch;
  /** Previous facts.json: repo facts are reused while the repo's pushedAt is unchanged. */
  previous?: FactsFile | null;
  /** Include hidden projects too. Default: only visible ones. */
  all?: boolean;
  /**
   * Current config: visibility is decided by it (as in `japs build`), so a project shown in
   * the editor gets facts without re-running discovery. Without it, projects.json decides.
   */
  config?: JapsConfig | null;
  /** Only these project keys (overrides `all`). */
  keys?: string[];
  now?: Date;
  /** Parallel projects. Each one runs several requests itself. Default 4. */
  concurrency?: number;
  onProgress?: (done: number, total: number, project: Project) => void;
}

export interface ExtractFactsResult {
  file: FactsFile;
  /** Repos whose facts came from `previous` instead of GitHub. */
  reusedRepos: number;
}

/** Hash over everything but the hash itself, so unchanged facts skip the LLM step. */
async function hashFacts(facts: Omit<ProjectFacts, "hash">): Promise<string> {
  return sha256Hex(JSON.stringify(facts));
}

/**
 * Step 1 of docs/spec/ai-pipeline.md: deterministic facts for each project in projects.json.
 * Network only through the passed clients; no file I/O (the CLI reads and writes files).
 */
export async function extractFacts(projectsFile: ProjectsFile, options: ExtractFactsOptions): Promise<ExtractFactsResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  const repoById = new Map(projectsFile.repos.map((r) => [r.id, r]));
  const siteById = new Map(projectsFile.sites.map((s) => [s.id, s]));
  const previousRepos = new Map(options.previous?.projects.flatMap((p) => p.repos.map((r) => [r.id, r])) ?? []);

  const visible = (p: Project) => (options.config ? isPublished(p, options.config) : !p.hidden);
  const projects = projectsFile.projects.filter((p) =>
    options.keys ? options.keys.includes(p.key) : options.all || visible(p),
  );
  if (options.keys) {
    for (const key of options.keys) if (!projects.some((p) => p.key === key)) warn(`project "${key}" not found`);
  }

  let reusedRepos = 0;
  // A repo shared by several projects (after merges) is fetched once.
  const repoFactsCache = new Map<string, Promise<RepoFacts>>();
  const repoFacts = (id: string): Promise<RepoFacts> => {
    const cached = repoFactsCache.get(id);
    if (cached) return cached;
    const repo = repoById.get(id);
    const previous = previousRepos.get(id);
    let result: Promise<RepoFacts>;
    if (!repo || !options.github) {
      result = Promise.resolve(inaccessibleRepoFacts(id));
    } else if (previous?.accessible && previous.pushedAt !== null && previous.pushedAt === repo.pushedAt) {
      reusedRepos++;
      // Metadata comes from discovery, which is always fresh.
      result = Promise.resolve({
        ...previous,
        private: repo.private,
        description: repo.description,
        topics: repo.topics,
        primaryLanguage: repo.language,
      });
    } else {
      result = fetchRepoFacts(options.github, repo, warn);
    }
    repoFactsCache.set(id, result);
    return result;
  };

  const siteFacts = async (id: string): Promise<SiteFacts | null> => {
    const site = siteById.get(id);
    if (!site) return null;
    const [deploy, live] = await Promise.all([
      site.deployId && site.provider === "netlify" && options.netlify
        ? fetchDeployFacts(options.netlify, site.deployId).catch((err: unknown) => {
            warn(`${site.domain}: deploy: ${errorMessage(err)}`);
            return null;
          })
        : null,
      site.lastDeployAt
        ? fetchLiveSite(site.url, fetchImpl).catch((err: unknown) => {
            warn(`${site.domain}: live site: ${errorMessage(err)}`);
            return null;
          })
        : null,
    ]);
    return {
      id: site.id,
      // Only non-Netlify sites carry it, so existing facts keep their hash (no new texts).
      ...(site.provider === "netlify" ? {} : { provider: site.provider }),
      domain: site.domain,
      url: site.url,
      framework: site.framework,
      lastDeployAt: site.lastDeployAt,
      deploy,
      live,
    };
  };

  let done = 0;
  const results = await mapLimit(projects, options.concurrency ?? 4, async (project): Promise<ProjectFacts> => {
    const [repos, sites] = await Promise.all([
      Promise.all(project.repoIds.map(repoFacts)),
      Promise.all(project.siteIds.map(siteFacts)).then((s) => s.filter((x): x is SiteFacts => x !== null)),
    ]);
    const facts = {
      key: project.key,
      title: project.title,
      private: project.private,
      repos,
      sites,
      tech: deriveTech(repos, sites),
    };
    options.onProgress?.(++done, projects.length, project);
    return { ...facts, hash: await hashFacts(facts) };
  });

  // Facts of projects not extracted this run are kept (as long as the project still exists),
  // so `--project x` refreshes one project instead of dropping all others.
  const fresh = new Map(results.map((r) => [r.key, r]));
  const previousByKey = new Map(options.previous?.projects.map((p) => [p.key, p]) ?? []);
  const file: FactsFile = {
    version: 1,
    generatedAt: (options.now ?? new Date()).toISOString(),
    projects: projectsFile.projects.flatMap((p) => fresh.get(p.key) ?? previousByKey.get(p.key) ?? []),
    warnings,
  };
  return { file: FactsFileSchema.parse(file), reusedRepos };
}
