import {
  analyzeProjects,
  discover,
  extractFacts,
  GitHubClient,
  isPublished,
  NetlifyClient,
  type LlmClient,
} from "@japs/core";
import {
  type AnalysisFile,
  type FactsFile,
  JapsConfig,
  type ProjectAnalysis,
  type ProjectFacts,
  type ProjectsFile,
} from "@japs/schema";
import type { UserStore } from "./db.ts";
import type { Env } from "./env.ts";
import { llmFor, monthOf, quotaFor } from "./llm.ts";
import { cloudflareToken, ConnectionError, githubToken, optionalNetlifyToken } from "./tokens.ts";

export const QUOTA_REACHED = (limit: number) =>
  `Free monthly limit of ${limit} AI generations reached. Add your own AI key in your profile, or wait for next month.`;

/**
 * The CLI pipeline for one user in the hosted version (#32): the same core functions, with
 * tokens from the user's connections and data in D1 instead of files. Split into a discovery
 * step and a per-project step, each well within the free plan's 50 subrequests (ADR 0009).
 */

export interface PipelineDeps {
  env: Env;
  fetch: typeof fetch;
  now?: () => Date;
}

async function loadConfig(user: UserStore): Promise<JapsConfig> {
  return JapsConfig.parse((await user.getDocument("config")) ?? { version: 1 });
}

export interface DiscoveryResult {
  /** All projects found. */
  projects: number;
  /**
   * Projects to refresh: shown in the portfolio and already with texts. New projects are not
   * processed here — the user picks them first, so no facts or LLM calls go to projects they
   * don't want (cost, quota, and private READMEs never leave unless chosen).
   */
  refresh: string[];
}

/** Discovery: Netlify sites + GitHub repos -> projects document. */
export async function runDiscovery(user: UserStore, deps: PipelineDeps): Promise<DiscoveryResult> {
  const now = deps.now?.() ?? new Date();
  const config = await loadConfig(user);
  const netlify = await optionalNetlifyToken(user, deps.env);
  const cloudflare = await cloudflareToken(user, deps.env, deps.fetch, now);
  if (!netlify && !cloudflare) throw new ConnectionError("Connect Netlify or Cloudflare first.");
  const file = await discover({
    netlifyToken: netlify ?? undefined,
    cloudflareToken: cloudflare ?? undefined,
    githubToken: await githubToken(user, deps.env, deps.fetch, now),
    fetch: deps.fetch,
    now,
    includeOrgRepos: config.discovery.includeOrgRepos,
    staleAfterMonths: config.discovery.staleAfterMonths,
    links: config.links,
    merge: config.merge,
    projects: config.projects,
  });
  await user.putDocument("projects", file);
  const analyzed = new Set(await user.listProjectDocKeys("analysis"));
  return {
    projects: file.projects.length,
    refresh: file.projects.filter((p) => isPublished(p, config) && analyzed.has(p.key)).map((p) => p.key),
  };
}

export interface ProjectRunResult {
  /** New texts were generated (false: unchanged facts, or no LLM configured). */
  generated: boolean;
  warnings: string[];
  usage: { input: number; output: number };
}

/** Facts, then texts, for one project. Previous results are reused when nothing changed. */
export async function runProject(user: UserStore, key: string, deps: PipelineDeps): Promise<ProjectRunResult> {
  const now = deps.now?.() ?? new Date();
  // Written by runDiscovery after validation; re-validating ~50 KB here would cost CPU per step.
  const projectsFile = (await user.getDocument("projects")) as ProjectsFile | null;
  if (!projectsFile) throw new Error("Projects not imported yet.");
  const config = await loadConfig(user);
  const warnings: string[] = [];

  const previousFacts = (await user.getProjectDoc(key, "facts")) as ProjectFacts | null;
  const { file: factsFile } = await extractFacts(projectsFile, {
    netlify: await optionalNetlifyToken(user, deps.env).then((token) => (token ? new NetlifyClient({ token, fetch: deps.fetch }) : null)),
    github: new GitHubClient({ token: await githubToken(user, deps.env, deps.fetch, now), fetch: deps.fetch }),
    fetch: deps.fetch,
    previous: previousFacts ? wrapFacts([previousFacts], now) : null,
    config,
    keys: [key],
    now,
  });
  warnings.push(...factsFile.warnings);
  const facts = factsFile.projects.find((p) => p.key === key);
  if (!facts) throw new Error(`Project ${key} not found.`);
  await user.putProjectDoc(key, "facts", facts);

  const chosen = await llmFor(user, deps.env, deps.fetch);
  if (!chosen) {
    return { generated: false, warnings: [...warnings, "No AI key available: add your own in your profile."], usage: { input: 0, output: 0 } };
  }
  // On the shared key, an exhausted quota blocks only a real generation: unchanged projects
  // never reach the model, so they neither count nor fail.
  const quota = await quotaFor(user, deps.env, now);
  const llm: LlmClient =
    chosen.shared && quota.remaining <= 0
      ? {
          provider: chosen.client.provider,
          model: chosen.client.model,
          generateJson: () => Promise.reject(new Error(QUOTA_REACHED(quota.limit))),
        }
      : chosen.client;

  const previousAnalysis = (await user.getProjectDoc(key, "analysis")) as ProjectAnalysis | null;
  const result = await analyzeProjects(wrapFacts([facts], now), {
    llm,
    locales: config.locales,
    projects: config.projects,
    accountLogin: projectsFile.account.github,
    previous: previousAnalysis ? wrapAnalysis([previousAnalysis], config.locales, now) : null,
    keys: [key],
    now,
  });
  warnings.push(...result.file.warnings);
  const analysis = result.file.projects.find((p) => p.key === key);
  if (analysis && result.generated) await user.putProjectDoc(key, "analysis", analysis);
  // Only the shared key counts towards the quota; an own key is the user's own cost.
  if (chosen.shared && (result.usage.input || result.usage.output)) {
    await user.addUsage(monthOf(now), {
      generations: result.generated,
      inputTokens: result.usage.input,
      outputTokens: result.usage.output,
    });
  }
  return { generated: result.generated > 0, warnings, usage: result.usage };
}

/** The per-project rows in the shapes core and the dashboard expect. */
export function wrapFacts(projects: ProjectFacts[], now: Date): FactsFile {
  return { version: 1, generatedAt: now.toISOString(), projects, warnings: [] };
}

export function wrapAnalysis(projects: ProjectAnalysis[], locales: string[], now: Date): AnalysisFile {
  return { version: 1, generatedAt: now.toISOString(), locales, projects, warnings: [] };
}
