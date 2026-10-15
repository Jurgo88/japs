import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { analyzeProjects, type AnalyzeResult, buildPortfolio, extractFacts, GitHubClient, NetlifyClient } from "@japs/core";
import {
  AnalysisFile,
  FactsFile,
  type JapsConfig,
  type Portfolio,
  type Project,
  ProjectsFile,
} from "@japs/schema";
import { writePortfolio } from "./build.ts";
import { CONFIG_FILE, loadConfig } from "./config.ts";
import { llmFromEnv } from "./llm.ts";
import { loadManifest, SCREENSHOTS_DIR } from "./screenshots.ts";

/** Where the pipeline's files live. Shared by `japs build` and `japs edit`. */
export interface Workspace {
  config: string;
  projects: string;
  facts: string;
  analysis: string;
  screenshots: string;
  out: string;
  /** State of the published Netlify site (ADR 0008). */
  publish: string;
}

export function resolveWorkspace(cwd: string, overrides: Partial<Record<keyof Workspace, string | undefined>> = {}): Workspace {
  const at = (value: string | undefined, fallback: string) => resolve(cwd, value ?? fallback);
  return {
    config: at(overrides.config, CONFIG_FILE),
    projects: at(overrides.projects, "projects.json"),
    facts: at(overrides.facts, "facts.json"),
    analysis: at(overrides.analysis, "analysis.json"),
    screenshots: at(overrides.screenshots, SCREENSHOTS_DIR),
    out: at(overrides.out, "out"),
    publish: at(overrides.publish, "publish.json"),
  };
}

/** A missing input, with the command that produces it. */
export class WorkspaceError extends Error {}

/** Reads and validates a JSON file; null when it doesn't exist. */
export async function readOptional<T>(path: string, schema: { parse: (v: unknown) => T }): Promise<T | null> {
  if (!existsSync(path)) return null;
  return schema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** Like readOptional, but a stale file from an older schema counts as missing. */
async function readLenient<T>(path: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<T | null> {
  if (!existsSync(path)) return null;
  const parsed = schema.safeParse(JSON.parse(await readFile(path, "utf8")));
  return parsed.success ? (parsed.data ?? null) : null;
}

export async function requireConfig(ws: Workspace): Promise<JapsConfig> {
  const config = await loadConfig(ws.config);
  if (!config) throw new WorkspaceError(`No ${CONFIG_FILE}. Run \`japs init --locales en,sk\` and fill in your profile.`);
  return config;
}

/** `japs facts`: projects.json -> facts.json, keeping facts of projects not extracted now. */
export async function factsWorkspace(
  ws: Workspace,
  options: {
    env: NodeJS.ProcessEnv;
    keys?: string[];
    all?: boolean;
    noCache?: boolean;
    onProgress?: (done: number, total: number, project: Project) => void;
  },
): Promise<{ file: FactsFile; reusedRepos: number; githubMissing: boolean }> {
  const projectsFile = await readOptional(ws.projects, ProjectsFile);
  if (!projectsFile) throw new WorkspaceError(`${ws.projects} not found. Run \`japs discover\` first.`);
  const netlifyToken = options.env.NETLIFY_TOKEN || undefined;
  const usesNetlify = projectsFile.sites.some((s) => s.provider === "netlify");
  if (usesNetlify && !netlifyToken) throw new WorkspaceError("NETLIFY_TOKEN is not set. Add it to .env (see .env.example).");
  const githubToken = options.env.GITHUB_TOKEN || undefined;

  const { file, reusedRepos } = await extractFacts(projectsFile, {
    netlify: netlifyToken ? new NetlifyClient({ token: netlifyToken }) : null,
    github: githubToken ? new GitHubClient({ token: githubToken }) : null,
    // A previous facts.json from an older schema is just a cold cache.
    previous: options.noCache ? null : await readLenient(ws.facts, FactsFile),
    config: await loadConfig(ws.config),
    all: options.all,
    keys: options.keys,
    onProgress: options.onProgress,
  });
  await writeFile(ws.facts, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return { file, reusedRepos, githubMissing: !githubToken };
}

/** `japs analyze`: facts.json -> analysis.json via the configured LLM (ADR 0006). */
export async function analyzeWorkspace(
  ws: Workspace,
  options: {
    env: NodeJS.ProcessEnv;
    keys?: string[];
    force?: boolean;
    onProgress?: (done: number, total: number, key: string) => void;
  },
): Promise<AnalyzeResult & { provider: string; model: string; locales: string[]; config: JapsConfig | null }> {
  const factsFile = await readOptional(ws.facts, FactsFile);
  if (!factsFile) throw new WorkspaceError(`${ws.facts} not found. Run \`japs facts\` first.`);
  const config = await loadConfig(ws.config);
  const locales = config?.locales ?? ["en"];
  // The account login only tells whether others committed; analysis works without it.
  const accountLogin = (await readLenient(ws.projects, ProjectsFile))?.account.github ?? null;

  const llm = llmFromEnv(options.env);
  const result = await analyzeProjects(factsFile, {
    llm,
    locales,
    projects: config?.projects,
    accountLogin,
    previous: await readLenient(ws.analysis, AnalysisFile),
    force: options.force,
    keys: options.keys,
    onProgress: options.onProgress,
  });
  await writeFile(ws.analysis, `${JSON.stringify(result.file, null, 2)}\n`, "utf8");
  return { ...result, provider: llm.provider, model: llm.model, locales, config };
}

/** `japs build`: everything on disk -> out/portfolio.json + screenshots. */
export async function buildWorkspace(ws: Workspace): Promise<{ portfolio: Portfolio; warnings: string[] }> {
  const config = await requireConfig(ws);
  const projectsFile = await readOptional(ws.projects, ProjectsFile);
  if (!projectsFile) throw new WorkspaceError(`${ws.projects} not found. Run \`japs discover\` first.`);
  const analysisFile = await readOptional(ws.analysis, AnalysisFile);
  if (!analysisFile) throw new WorkspaceError(`${ws.analysis} not found. Run \`japs analyze\` first.`);

  const result = buildPortfolio({
    projectsFile,
    analysisFile,
    factsFile: await readLenient(ws.facts, FactsFile),
    config,
    screenshots: await loadManifest(ws.screenshots),
  });
  return writePortfolio(ws.out, result, { screenshotsDir: ws.screenshots });
}
