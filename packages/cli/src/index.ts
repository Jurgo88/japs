#!/usr/bin/env -S npx tsx
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { discover, screenshotTargets } from "@japs/core";
import {
  type JapsConfig,
  Locale,
  type Project,
  type ProjectsFile,
  ProjectsFile as ProjectsFileSchema,
} from "@japs/schema";
import { cloudBuild } from "./cloud-build.ts";
import { CONFIG_FILE, loadConfig, writeStarterConfig } from "./config.ts";
import { createEditorServer } from "./editor-server.ts";
import { publishWorkspace } from "./publish.ts";
import { captureScreenshots, PlaywrightMissingError, SCREENSHOTS_DIR } from "./screenshots.ts";
import { parseThemeId, runThemeScript, themeDir } from "./theme.ts";
import { analyzeWorkspace, buildWorkspace, factsWorkspace, resolveWorkspace, WorkspaceError } from "./workspace.ts";

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
  japs screenshots [--project <key>]…             capture live sites with Playwright into screenshots/
  japs build [--out out]                          assemble out/portfolio.json + screenshots
  japs theme [dev|build|preview] [--theme <id>]   run the configured theme on out/ (or the sample)
  japs edit [--port 4310]                         choose and edit projects in the browser
  japs publish [--draft] [--site-name <name>]     build and deploy to your Netlify (new site on first run)
  japs cloud-build --build <id> --api <url>       hosted version only: build run by the publish workflow

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
      config: { type: "string" },
      all: { type: "boolean", default: false },
      project: { type: "string", multiple: true },
      "no-cache": { type: "boolean", default: false },
    },
  });

  requireNetlifyToken();
  const ws = resolveWorkspace(userCwd, { projects: values.in, facts: values.out, config: values.config });
  const { file, reusedRepos, githubMissing } = await factsWorkspace(ws, {
    env: process.env,
    keys: values.project,
    all: values.all,
    noCache: values["no-cache"],
    onProgress: process.stdout.isTTY
      ? (done, total, project) => process.stdout.write(`\r[${done}/${total}] ${project.title}`.padEnd(60))
      : undefined,
  });
  if (process.stdout.isTTY) process.stdout.write(`\r${" ".repeat(60)}\r`);
  if (githubMissing) console.warn("GITHUB_TOKEN not set — repo facts (README, dependencies, commits) are missing.\n");

  for (const p of file.projects) {
    const tags = p.tech.filter((t) => t.category !== "hosting" && t.category !== "tooling").map((t) => t.name);
    console.log(`${p.title.padEnd(28)} ${tags.slice(0, 8).join(", ")}${tags.length > 8 ? ", …" : ""}`);
  }
  console.log(`\n${file.projects.length} projects, ${reusedRepos} repos reused from cache.`);
  if (file.warnings.length) {
    console.warn(`\nWarnings (${file.warnings.length}):\n${file.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  console.log(`\nWritten to ${ws.facts}`);
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

  const ws = resolveWorkspace(userCwd, {
    facts: values.in,
    analysis: values.out,
    projects: values.projects,
    config: values.config,
  });
  if (!existsSync(ws.config)) {
    console.warn(`No ${CONFIG_FILE} — generating in English only. Run \`japs init --locales en,sk\` for more.\n`);
  }
  const { file, generated, reused, usage, provider, model, locales, config } = await analyzeWorkspace(ws, {
    env: process.env,
    keys: values.project,
    force: values.force,
    onProgress: process.stdout.isTTY
      ? (done, total, key) => process.stdout.write(`\r[${done}/${total}] ${key}`.padEnd(70))
      : undefined,
  });
  if (process.stdout.isTTY) process.stdout.write(`\r${" ".repeat(70)}\r`);
  console.log(`Generated with ${provider} / ${model} in ${locales.join(", ")}.\n`);

  const defaultLocale = config?.defaultLocale ?? locales[0]!;
  for (const p of file.projects) {
    console.log(`${p.copy.title[defaultLocale] ?? p.key}  —  ${p.copy.summary[defaultLocale] ?? ""}`);
  }
  console.log(`\n${generated} generated, ${reused} unchanged (skipped). Tokens: ${usage.input} in, ${usage.output} out.`);
  const dropped = file.projects.flatMap((p) => p.dropped.map((d) => `  - ${p.key} [${d.locale}]: ${d.text}`));
  if (dropped.length) {
    console.warn(`\nRemoved by the grounding check (numbers not in the facts):\n${dropped.join("\n")}`);
  }
  if (file.warnings.length) {
    console.warn(`\nWarnings (${file.warnings.length}):\n${file.warnings.map((w) => `  - ${w}`).join("\n")}`);
  }
  console.log(`\nWritten to ${ws.analysis}`);
}

async function runScreenshots(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      projects: { type: "string", default: "projects.json" },
      out: { type: "string", default: SCREENSHOTS_DIR },
      config: { type: "string", default: CONFIG_FILE },
      project: { type: "string", multiple: true },
    },
  });

  const config = await loadConfig(resolve(userCwd, values.config ?? CONFIG_FILE));
  if (!config) {
    console.error(`No ${CONFIG_FILE}. Run \`japs init\` first — screenshots follow its visibility settings.`);
    process.exit(1);
  }
  const projectsFile = await readJson(
    resolve(userCwd, values.projects ?? "projects.json"),
    ProjectsFileSchema,
    "Run `japs discover` first.",
  );

  const targets = screenshotTargets(projectsFile, config, values.project);
  if (!targets.length) {
    console.log("Nothing to capture: no published project with a deployed site (or a screenshotUrl).");
    return;
  }

  const dir = resolve(userCwd, values.out ?? SCREENSHOTS_DIR);
  console.log(`Capturing ${targets.length} sites (desktop + mobile)…`);
  try {
    const { taken, warnings } = await captureScreenshots(targets, dir, {
      onProgress: process.stdout.isTTY
        ? (done, total, label) => process.stdout.write(`\r[${done}/${total}] ${label}`.padEnd(70))
        : undefined,
    });
    if (process.stdout.isTTY) process.stdout.write(`\r${" ".repeat(70)}\r`);
    console.log(`${taken} screenshots in ${dir}. Run \`japs build\` to use them.`);
    if (warnings.length) console.warn(`\nWarnings (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  } catch (err) {
    if (err instanceof PlaywrightMissingError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

async function runEdit(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      port: { type: "string", default: "4310" },
      config: { type: "string" },
      projects: { type: "string" },
      analysis: { type: "string" },
      screenshots: { type: "string" },
      out: { type: "string" },
    },
  });
  const port = Number(values.port);
  const dashboardDir = fileURLToPath(new URL("../../../apps/dashboard/dist", import.meta.url));
  if (!existsSync(join(dashboardDir, "index.html"))) {
    console.error("The dashboard is not built yet. Run: pnpm --filter @japs/dashboard build  (or `pnpm editor`)");
    process.exit(1);
  }

  const { server } = createEditorServer(resolveWorkspace(userCwd, values), { dashboardDir });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  console.log(`JAPS editor: http://localhost:${port}\nChanges are saved to japs.config.json only when you press Save. Ctrl+C to stop.`);
}

/** Only for .github/workflows/publish.yml (ADR 0011); prints counts, never portfolio content. */
async function runCloudBuild(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { build: { type: "string" }, api: { type: "string" } } });
  if (!values.build || !values.api) throw new WorkspaceError("Usage: japs cloud-build --build <id> --api <url>");
  await cloudBuild({ buildId: values.build, api: values.api, env: process.env });
}

async function runPublish(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      "site-name": { type: "string" },
      draft: { type: "boolean", default: false },
      config: { type: "string" },
      out: { type: "string" },
    },
  });
  requireNetlifyToken();
  const ws = resolveWorkspace(userCwd, { config: values.config, out: values.out });
  const { site, created, deploy, projects, warnings } = await publishWorkspace(ws, {
    env: process.env,
    siteName: values["site-name"],
    draft: values.draft,
    onProgress: (message) => console.log(message),
  });

  if (warnings.length) console.warn(`\nWarnings (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  console.log(`\n${created ? "Created" : "Updated"} ${site.name}: ${projects} projects, ${deploy.uploaded} of ${deploy.total} files uploaded.`);
  if (values.draft) {
    console.log(`Draft preview: ${deploy.url}\nThe live site ${site.url} is unchanged. Run \`japs publish\` without --draft to go live.`);
  } else {
    console.log(`Live: ${deploy.url || site.url}`);
  }
  if (site.adminUrl) console.log(`Netlify: ${site.adminUrl} (custom domain under Domain management)`);
}

async function runBuild(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string", default: "out" },
      projects: { type: "string", default: "projects.json" },
      facts: { type: "string", default: "facts.json" },
      analysis: { type: "string", default: "analysis.json" },
      screenshots: { type: "string", default: SCREENSHOTS_DIR },
      config: { type: "string", default: CONFIG_FILE },
    },
  });

  const ws = resolveWorkspace(userCwd, values);
  const { portfolio, warnings } = await buildWorkspace(ws);

  for (const p of portfolio.projects) {
    const flags = [p.featured ? "featured" : "", p.client.anonymized ? "anonymized" : "", p.links.repo ? "" : "no repo link"]
      .filter(Boolean)
      .join(", ");
    console.log(`${p.title[portfolio.defaultLocale]}${flags ? `  [${flags}]` : ""}`);
  }
  const shots = portfolio.projects.reduce((n, p) => n + p.screenshots.length, 0);
  console.log(`\n${portfolio.projects.length} projects, ${shots} screenshots, locales ${portfolio.locales.join(", ")}.`);
  if (warnings.length) console.warn(`\nWarnings (${warnings.length}):\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  console.log(`\nWritten to ${join(ws.out, "portfolio.json")}`);
}

async function runTheme(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      theme: { type: "string" },
      config: { type: "string", default: CONFIG_FILE },
      out: { type: "string", default: "out" },
    },
  });
  const task = positionals[0] ?? "dev";
  if (task !== "dev" && task !== "build" && task !== "preview") {
    throw new WorkspaceError(`Unknown theme task "${task}". Use: japs theme dev | build | preview`);
  }
  const config = await loadConfig(resolve(userCwd, values.config ?? CONFIG_FILE));
  const theme = values.theme ? parseThemeId(values.theme) : (config?.theme ?? "default");

  // Without a built portfolio the theme falls back to its bundled sample.
  const out = resolve(userCwd, values.out ?? "out");
  const env = existsSync(join(out, "portfolio.json")) ? { JAPS_PORTFOLIO_DIR: out } : {};
  console.log(`Theme "${theme}" (${themeDir(theme)})`);
  await runThemeScript(theme, task, { stdio: "inherit", env });
  if (task === "build") console.log(`\nStatic site in ${join(themeDir(theme), "dist")}`);
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
    case "screenshots":
      return runScreenshots(rest);
    case "edit":
      return runEdit(rest);
    case "publish":
      return runPublish(rest);
    case "cloud-build":
      return runCloudBuild(rest);
    case "build":
      return runBuild(rest);
    case "theme":
      return runTheme(rest);
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
