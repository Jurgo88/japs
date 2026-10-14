import {
  analyzeProjects,
  discover,
  extractFacts,
  GitHubClient,
  isPublished,
  NetlifyClient,
  OpenAiCompatibleClient,
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
import { githubToken, netlifyToken } from "./tokens.ts";

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

/** Discovery: Netlify sites + GitHub repos -> projects document. Returns the keys to process. */
export async function runDiscovery(user: UserStore, deps: PipelineDeps): Promise<string[]> {
  const now = deps.now?.() ?? new Date();
  const config = await loadConfig(user);
  const file = await discover({
    netlifyToken: await netlifyToken(user, deps.env),
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
  return file.projects.filter((p) => isPublished(p, config)).map((p) => p.key);
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
    netlify: new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch }),
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

  if (!deps.env.OPENAI_API_KEY) {
    return { generated: false, warnings: [...warnings, "No LLM configured on the server."], usage: { input: 0, output: 0 } };
  }
  const previousAnalysis = (await user.getProjectDoc(key, "analysis")) as ProjectAnalysis | null;
  const result = await analyzeProjects(wrapFacts([facts], now), {
    llm: new OpenAiCompatibleClient({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: deps.env.OPENAI_API_KEY,
      model: deps.env.JAPS_LLM_MODEL || "gpt-5-mini",
      fetch: deps.fetch,
    }),
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
  if (result.usage.input || result.usage.output) {
    await user.addUsage(now.toISOString().slice(0, 7), {
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
