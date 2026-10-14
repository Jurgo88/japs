import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { THEMES, ThemeId } from "@japs/schema";
import { WorkspaceError } from "./workspace.ts";

/** Built-in themes live in apps/theme-<id> as @japs/theme-<id> (ADR 0010). */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export const themeDir = (id: ThemeId): string => join(REPO_ROOT, "apps", `theme-${id}`);

/** Validates a theme id from the command line; the config is already validated by its schema. */
export function parseThemeId(value: string): ThemeId {
  const parsed = ThemeId.safeParse(value);
  if (!parsed.success) {
    throw new WorkspaceError(`Unknown theme "${value}". Built-in themes: ${THEMES.map((t) => t.id).join(", ")}`);
  }
  return parsed.data;
}

export interface RunThemeOptions {
  env?: NodeJS.ProcessEnv;
  /** Inherit the terminal (dev server) or collect output for an error message (build). */
  stdio: "inherit" | "collect";
}

/** Runs a script of the theme package (dev, build, preview). Resolves with the collected output. */
export async function runThemeScript(id: ThemeId, script: "dev" | "build" | "preview", options: RunThemeOptions): Promise<string> {
  if (!existsSync(join(themeDir(id), "package.json"))) {
    throw new WorkspaceError(`Theme "${id}" is not installed (expected ${themeDir(id)}).`);
  }
  const output: string[] = [];
  const code = await new Promise<number>((resolveExit, reject) => {
    // pnpm is a .cmd shim on Windows, which needs a shell. `id` passed ThemeId, so the command is
    // built from a fixed allow-list, never from free text.
    const child = spawn(`pnpm --filter @japs/theme-${id} ${script}`, {
      cwd: REPO_ROOT,
      shell: true,
      stdio: options.stdio === "inherit" ? "inherit" : "pipe",
      env: { ...process.env, ...options.env },
    });
    child.stdout?.on("data", (d: Buffer) => output.push(d.toString()));
    child.stderr?.on("data", (d: Buffer) => output.push(d.toString()));
    child.on("error", reject);
    child.on("close", (c) => resolveExit(c ?? 1));
  });
  const text = output.join("");
  if (code !== 0) {
    const tail = text ? `:\n${text.split("\n").slice(-15).join("\n")}` : ".";
    throw new WorkspaceError(`Theme "${id}" ${script} failed${tail}`);
  }
  return text;
}

/** Builds a theme for `portfolioDir`, with absolute URLs on `siteUrl`. Returns the dist directory. */
export async function buildTheme(portfolioDir: string, siteUrl: string | undefined, id: ThemeId): Promise<string> {
  const env: NodeJS.ProcessEnv = { JAPS_PORTFOLIO_DIR: portfolioDir };
  if (siteUrl) env.JAPS_SITE_URL = siteUrl;
  await runThemeScript(id, "build", { stdio: "collect", env });
  return join(themeDir(id), "dist");
}
