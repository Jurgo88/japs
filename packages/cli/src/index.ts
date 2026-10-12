#!/usr/bin/env -S npx tsx
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { discover } from "@japs/core";
import type { ProjectsFile } from "@japs/schema";

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
  japs discover [--out projects.json] [--stale-months 24]

Environment:
  NETLIFY_TOKEN   required
  GITHUB_TOKEN    optional (without it, repos are inferred from Netlify deploys only)
`;

function printSummary(file: ProjectsFile): void {
  const { stats } = file;
  const pct = stats.sites ? Math.round((stats.pairedSites / stats.sites) * 100) : 0;
  console.log(`Sites:    ${stats.sites} (${stats.pairedSites} paired with a repo, ${pct} %)`);
  console.log(`Repos:    ${stats.repos}`);
  console.log(`Projects: ${stats.projects} (${stats.hiddenProjects} hidden by default filters)`);
  console.log("");
  for (const p of file.projects) {
    const mark = p.hidden ? "·" : "✓";
    const why = p.hidden ? `  [${p.hiddenReasons.join(", ")}]` : "";
    const when = p.lastActivityAt?.slice(0, 7) ?? "       ";
    console.log(`${mark} ${when}  ${p.title}  (${p.siteIds.length} site, ${p.repoIds.length} repo)${why}`);
  }
}

async function runDiscover(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string", default: "projects.json" },
      "stale-months": { type: "string", default: "24" },
    },
  });

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
    staleAfterMonths: Number(values["stale-months"]),
  });

  const outPath = resolve(userCwd, values.out ?? "projects.json");
  await writeFile(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  printSummary(file);
  console.log(`\nWritten to ${outPath}`);
}

async function main(): Promise<void> {
  loadedEnvFile = findEnvFile(userCwd);
  if (loadedEnvFile) process.loadEnvFile(loadedEnvFile);

  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
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
