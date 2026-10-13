#!/usr/bin/env -S npx tsx
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyzeProjects, buildPortfolio, discover, extractFacts, GitHubClient, NetlifyClient } from "@japs/core";
import {
  AnalysisFile as AnalysisFileSchema,
  type FactsFile,
  FactsFile as FactsFileSchema,
  type JapsConfig,
  Locale,
  type Project,
  type ProjectsFile,
  ProjectsFile as ProjectsFileSchema,
} from "@japs/schema";
import { CONFIG_FILE, loadConfig, writeStarterConfig } from "./config.ts";
import { llmFromEnv } from "./llm.ts";
import { writePortfolio } from "./build.ts";

/**
 * Directory the user ran the command from. `pnpm --filter … start` switches cwd to
 * packages/cli, but pnpm keeps the original directory in INIT_CWD.
 */
const userCwd = process.env.INIT_CWD ?? process.cwd();
let loadedEnvFile: string | null = null;

/** Walks up from `start` and returns the first `.env` found, or null. */
function findEnvFile(start: string): string | null {
  for (let dir = resolve(start); ; dir = dirname(dir)) {
    const candidate = resolve(dir, ".env");
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return null;
  }
}

const HELP = `japs — Just Another Portfolio Site

Usage:
  japs init [--locales en,sk]                     create ${CONFIG_FILE} (never overwrites)
  japs discover [--out projects.json] [--stale-months 24]
  japs facts [--in projects.json] [--out facts.json] [--all] [--project <key>]… [--no-cache]
                                                  extract facts for analysis (no LLM)
  japs analyze [--in facts.json] [--out analysis.json] [--project <key>]… [--force]
                                                  generate project copy with an LLM
  japs build [--out out]                          assemble out/portfolio.json + screenshots

Options:
  --config <path>   config file (default ${CONFIG_FILE})

Environment:
  NETLIFY_TOKEN   required
  GITHUB_TOKEN    optional (without it, repos are inferred from Netlify deploys only)
  JAPS_LLM_PROVIDER  openai (default) | gemini | groq | openrouter | ollama
  JAPS_LLM_MODEL     model name (openai default: gpt-5-mini)
  OPENAI_API_KEY     or GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY / JAPS_LLM_API_KEY
`;

function printSummary(file: ProjectsFile, config: JapsConfig | null): void {
  const { stats } = file;
  const pct = stats.sites ? Math.round((stats.pairedSites / stats.sites) * 100) : 0;
  console.log(`Sites:    ${stats.sites} (${stats.pairedSites} paired with a repo, ${pct} %)`);
  console.log(`Repos:    ${stats.repos}`);
  console.log(`Projects: ${stats.projects} (${stats.hiddenProjects} hidden)`);
  console.log("");
  const isSuggestedClient = (p: Project) =>
    p.hiddenReasons.includes("client") && config?.projects[p.key]?.isClient === undefined;
  for (const p of file.projects) {
    const mark = p.hidden ? "·" : "✓";
    const reasons = p.hiddenReasons.map((r) =>
      r === "client" && isSuggestedClient(p) ? `client? (${p.clientSignals.join(", ")})` : r,
    );
    if (config?.projects[p.key]?.hidden !== undefined) reasons.push("config");
    const why = reasons.length ? `  [${reasons.join(", ")}]` : "";
    const when = p.lastActivityAt?.slice(0, 7) ?? "       ";
    console.log(`${mark} ${when}  ${p.title}  ${p.key}${why}`);
  }
  if (file.projects.some((p) => p.hidden && (p.hiddenReasons.includes("private") || p.hiddenReasons.includes("client")))) {
    console.log(`\nPrivate and client projects stay hidden. To publish one, set "hidden": false under its key in ${CONFIG_FILE}.`);
  }
  if (file.projects.some(isSuggestedClient)) {
    console.log(`"client?" = looks like client work. Confirm with "isClient": true, or dismiss with "isClient": false.`);
  }
  if (file.warnings.length) {
    console.warn(`\nConfig warnings:\n${file.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
}

async function runInit(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      config: { type: "string", default: CONFIG_FILE },
      locales: { type: "string", default: "en" },
    },
  });
  const locales = (values.locales ?? "en").split(",").map((l) => l.trim()).filter(Boolean);
  const invalid = locales.filter((l) => !Locale.safeParse(l).success);
  if (!locales.length || invalid.length) {
    console.error(`Invalid --locales: ${invalid.join(", ") || "(empty)"}. Use BCP 47 tags, e.g. en,sk`);
    process.exit(1);
  }

  const path = resolve(userCwd, values.config ?? CONFIG_FILE);
  if (!(await writeStarterConfig(path, locales))) {
    console.log(`${path} already exists — leaving it untouched.`);
    return;
  }
  console.log(`Created ${path}\nFill in your profile, then run \`japs discover\` and use project keys from its output.`);
}

async function runDiscover(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string", default: "projects.json" },
      config: { type: "string", default: CONFIG_FILE },
      "stale-months": { type: "string" },
    },
  });

  const configPath = resolve(userCwd, values.config ?? CONFIG_FILE);
  const config = await loadConfig(configPath);
  if (!config) console.warn(`No ${CONFIG_FILE} — using defaults. Run \`japs init\` to create one.\n`);

  const staleFlag = values["stale-months"];
  const staleAfterMonths = staleFlag === undefined ? config?.discovery.staleAfterMonths : Number(staleFlag);
  if (staleAfterMonths !== undefined && !(Number.isInteger(staleAfterMonths) && staleAfterMonths > 0)) {
    console.error(`--stale-months must be a positive integer, got "${staleFlag}".`);
    process.exit(1);
  }

  const netlifyToken = requireNetlifyToken();
  const githubToken = process.env.GITHUB_TOKEN || undefined;
  if (!githubToken) console.warn("GITHUB_TOKEN not set — repos without a Netlify site will be missing.\n");

  const file = await discover({
    netlifyToken,
    githubToken,
    staleAfterMonths,
    includeOrgRepos: config?.discovery.includeOrgRepos,
    links: config?.links,
    merge: config?.merge,
    projects: config?.projects,
  });

  const outPath = resolve(userCwd, values.out ?? "projects.json");
  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  printSummary(file, config);
  console.log(`\nWritten to ${outPath}`);
}

function requireNetlifyToken(): string {
  const token = process.env.NETLIFY_TOKEN;
  if (token) return token;
  console.error(
    loadedEnvFile
      ? `NETLIFY_TOKEN is empty in ${loadedEnvFile}.`
      : "No .env found. Copy .env.example to .env in the repo root and fill in NETLIFY_TOKEN.",
  );
  process.exit(1);
}

async function readJson<T>(path: string, schema: { parse: (v: unknown) => T }, hint: string): Promise<T> {
  if (!existsSync(path)) {
    console.error(`${path} not found. ${hint}`);
    process.exit(1);
  }
  return schema.parse(JSON.parse(await readFile(path, "utf8")));
}

async function runFacts(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      in: { type: "string", default: "projects.json" },
      out: { type: "string", default: "facts.json" },
      all: { type: "boolean", default: false },
      project: { type: "string", multiple: true },
      "no-cache": { type: "boolean", default: false },
    },
  });

  const inPath = resolve(userCwd, values.in ?? "projects.json");
  const outPath = resolve(userCwd, values.out ?? "facts.json");
  const projectsFile = await readJson(inPath, ProjectsFileSchema, "Run `japs discover` first.");

  // A previous facts.json from an older schema is just a cold cache, not an error.
  let previous: FactsFile | null = null;
  if (!values["no-cache"] && existsSync(outPath)) {
    const parsed = FactsFileSchema.safeParse(JSON.parse(await readFile(outPath, "utf8")));
    previous = parsed.success ? parsed.data : null;
  }

  const netlifyToken = requireNetlifyToken();
  const githubToken = process.env.GITHUB_TOKEN || undefined;
  if (!githubToken) console.warn("GITHUB_TOKEN not set — repo facts (README, dependencies, commits) will be missing.\n");

  const { file, reusedRepos } = await extractFacts(projectsFile, {
    netlify: new NetlifyClient({ token: netlifyToken }),
    github: githubToken ? new GitHubClient({ token: githubToken }) : null,
    previous,
    all: values.all,
    keys: values.project,
    onProgress: process.stdout.isTTY
      ? (done, total, project) => process.stdout.write(`\r[${done}/${total}] ${project.title}`.padEnd(60))
      : undefined,
  });
  if (process.stdout.isTTY) process.stdout.write(`\r${" ".repeat(60)}\r`);

  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  for (const p of file.projects) {
    const tags = p.tech.filter((t) => t.category !== "hosting" && t.category !== "tooling").map((t) => t.name);
    console.log(`${p.title.padEnd(28)} ${tags.slice(0, 8).join(", ")}${tags.length > 8 ? ", …" : ""}`);
  }
  console.log(`\n${file.projects.length} projects, ${reusedRepos} repos reused from cache.`);
  if (file.warnings.length) {
    console.warn(`\nWarnings (${file.warnings.length}):\n${file.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  console.log(`\nWritten to ${outPath}`);
}

async function runAnalyze(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      in: { type: "string", default: "facts.json" },
      out: { type: "string", default: "analysis.json" },
      projects: { type: "string", default: "projects.json" },
      config: { type: "string", default: CONFIG_FILE },
      project: { type: "string", multiple: true },
      force: { type: "boolean", default: false },
    },
  });

  const factsFile = await readJson(resolve(userCwd, values.in ?? "facts.json"), FactsFileSchema, "Run `japs facts` first.");
  const config = await loadConfig(resolve(userCwd, values.config ?? CONFIG_FILE));
  if (!config) console.warn(`No ${CONFIG_FILE} — generating in English only. Run \`japs init --locales en,sk\` for more.\n`);
  const locales = config?.locales ?? ["en"];

  // The account login only tells whether others committed; analysis works without it.
  const projectsPath = resolve(userCwd, values.projects ?? "projects.json");
  const projectsParsed = existsSync(projectsPath)
    ? ProjectsFileSchema.safeParse(JSON.parse(await readFile(projectsPath, "utf8")))
    : null;
  const accountLogin = projectsParsed?.success ? projectsParsed.data.account.github : null;

  const outPath = resolve(userCwd, values.out ?? "analysis.json");
  const previousParsed = existsSync(outPath) ? AnalysisFileSchema.safeParse(JSON.parse(await readFile(outPath, "utf8"))) : null;
  const previous = previousParsed?.success ? previousParsed.data : null;

  const llm = llmFromEnv(process.env);
  console.log(`Generating with ${llm.provider} / ${llm.model} in ${locales.join(", ")}…`);

  const { file, generated, reused, usage } = await analyzeProjects(factsFile, {
    llm,
    locales,
    projects: config?.projects,
    accountLogin,
    previous,
    force: values.force,
    keys: values.project,
    onProgress: process.stdout.isTTY
      ? (done, total, key) => process.stdout.write(`\r[${done}/${total}] ${key}`.padEnd(70))
      : undefined,
  });
  if (process.stdout.isTTY) process.stdout.write(`\r${" ".repeat(70)}\r`);

  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");

  const defaultLocale = config?.defaultLocale ?? locales[0]!;
  for (const p of file.projects) {
    console.log(`${p.copy.title[defaultLocale] ?? p.key}  —  ${p.copy.summary[defaultLocale] ?? ""}`);
  }
  console.log(
    `\n${generated} generated, ${reused} unchanged (skipped). Tokens: ${usage.input} in, ${usage.output} out.`,
  );
  if (file.warnings.length) {
    console.warn(`\nWarnings (${file.warnings.length}):\n${file.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  console.log(`\nWritten to ${outPath}`);
}

async function runBuild(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string", default: "out" },
      projects: { type: "string", default: "projects.json" },
      facts: { type: "string", default: "facts.json" },
      analysis: { type: "string", default: "analysis.json" },
      config: { type: "string", default: CONFIG_FILE },
    },
  });

  const config = await loadConfig(resolve(userCwd, values.config ?? CONFIG_FILE));
  if (!config) {
    console.error(`No ${CONFIG_FILE}. Run \`japs init --locales en,sk\` and fill in your profile.`);
    process.exit(1);
  }
  const projectsFile = await readJson(
    resolve(userCwd, values.projects ?? "projects.json"),
    ProjectsFileSchema,
    "Run `japs discover` first.",
  );
  const analysisFile = await readJson(
    resolve(userCwd, values.analysis ?? "analysis.json"),
    AnalysisFileSchema,
    "Run `japs analyze` first.",
  );
  const factsPath = resolve(userCwd, values.facts ?? "facts.json");
  const factsParsed = existsSync(factsPath) ? FactsFileSchema.safeParse(JSON.parse(await readFile(factsPath, "utf8"))) : null;

  const result = buildPortfolio({
    projectsFile,
    analysisFile,
    factsFile: factsParsed?.success ? factsParsed.data : null,
    config,
  });

  const outDir = resolve(userCwd, values.out ?? "out");
  const { portfolio, warnings } = await writePortfolio(outDir, result);

  for (const p of portfolio.projects) {
    const flags = [p.featured ? "featured" : "", p.client.anonymized ? "anonymized" : "", p.links.repo ? "" : "no repo link"]
      .filter(Boolean)
      .join(", ");
    console.log(`${p.title[portfolio.defaultLocale]}${flags ? `  [${flags}]` : ""}`);
  }
  const shots = portfolio.projects.reduce((n, p) => n + p.screenshots.length, 0);
  console.log(`\n${portfolio.projects.length} projects, ${shots} screenshots, locales ${portfolio.locales.join(", ")}.`);
  if (warnings.length) console.warn(`\nWarnings (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  console.log(`\nWritten to ${join(outDir, "portfolio.json")}`);
}

async function main(): Promise<void> {
  loadedEnvFile = findEnvFile(userCwd);
  if (loadedEnvFile) process.loadEnvFile(loadedEnvFile);

  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "init":
      return runInit(rest);
    case "discover":
      return runDiscover(rest);
    case "facts":
      return runFacts(rest);
    case "analyze":
      return runAnalyze(rest);
    case "build":
      return runBuild(rest);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${command}\n\n${HELP}`);
      process.exit(1);
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
    console.error(`${err.message}${cause}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
