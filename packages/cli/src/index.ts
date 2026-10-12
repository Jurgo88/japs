#!/usr/bin/env -S npx tsx
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { discover } from "@japs/core";
import { type JapsConfig, Locale, type ProjectsFile } from "@japs/schema";
import { CONFIG_FILE, loadConfig, writeStarterConfig } from "./config.ts";

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

Options:
  --config <path>   config file (default ${CONFIG_FILE})

Environment:
  NETLIFY_TOKEN   required
  GITHUB_TOKEN    optional (without it, repos are inferred from Netlify deploys only)
`;

function printSummary(file: ProjectsFile, config: JapsConfig | null): void {
  const { stats } = file;
  const pct = stats.sites ? Math.round((stats.pairedSites / stats.sites) * 100) : 0;
  console.log(`Sites:    ${stats.sites} (${stats.pairedSites} paired with a repo, ${pct} %)`);
  console.log(`Repos:    ${stats.repos}`);
  console.log(`Projects: ${stats.projects} (${stats.hiddenProjects} hidden)`);
  console.log("");
  for (const p of file.projects) {
    const mark = p.hidden ? "·" : "✓";
    const decided = config?.projects[p.key]?.hidden !== undefined ? " config" : "";
    const reasons = p.hiddenReasons.length ? ` ${p.hiddenReasons.join(", ")}` : "";
    const why = reasons || decided ? `  [${(reasons + decided).trim()}]` : "";
    const when = p.lastActivityAt?.slice(0, 7) ?? "       ";
    console.log(`${mark} ${when}  ${p.title}  ${p.key}${why}`);
  }
  if (file.projects.some((p) => p.hidden && p.hiddenReasons.includes("private"))) {
    console.log(`\nPrivate projects stay hidden. To publish one, set "hidden": false under its key in ${CONFIG_FILE}.`);
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

  const netlifyToken = process.env.NETLIFY_TOKEN;
  if (!netlifyToken) {
    console.error(
      loadedEnvFile
        ? `NETLIFY_TOKEN is empty in ${loadedEnvFile}.`
        : "No .env found. Copy .env.example to .env in the repo root and fill in NETLIFY_TOKEN.",
    );
    process.exit(1);
  }
  const githubToken = process.env.GITHUB_TOKEN || undefined;
  if (!githubToken) console.warn("GITHUB_TOKEN not set — repos without a Netlify site will be missing.\n");

  const file = await discover({
    netlifyToken,
    githubToken,
    staleAfterMonths,
    links: config?.links,
    merge: config?.merge,
    projects: config?.projects,
  });

  const outPath = resolve(userCwd, values.out ?? "projects.json");
  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  printSummary(file, config);
  console.log(`\nWritten to ${outPath}`);
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
