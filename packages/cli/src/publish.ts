import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createSite, type DeployFile, type DeployResult, deploySite, findSite, NetlifyClient, type NetlifySite, slugify } from "@japs/core";
import { PublishState } from "@japs/schema";
import { buildWorkspace, readOptional, requireConfig, type Workspace, WorkspaceError } from "./workspace.ts";

/** `japs publish` (ADR 0008): build portfolio + theme, deploy to the user's own Netlify site. */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const THEME_DIST = join(REPO_ROOT, "apps", "theme-default", "dist");

/** Builds theme-default for `portfolioDir`, with absolute URLs on `siteUrl`. Returns the dist directory. */
export async function buildTheme(portfolioDir: string, siteUrl: string): Promise<string> {
  const output: string[] = [];
  const code = await new Promise<number>((resolveExit, reject) => {
    // pnpm is a .cmd shim on Windows, which needs a shell; a fixed command string, no user input.
    const child = spawn("pnpm --filter @japs/theme-default build", {
      cwd: REPO_ROOT,
      shell: true,
      env: { ...process.env, JAPS_PORTFOLIO_DIR: portfolioDir, JAPS_SITE_URL: siteUrl },
    });
    child.stdout.on("data", (d: Buffer) => output.push(d.toString()));
    child.stderr.on("data", (d: Buffer) => output.push(d.toString()));
    child.on("error", reject);
    child.on("close", (c) => resolveExit(c ?? 1));
  });
  if (code !== 0) throw new WorkspaceError(`Theme build failed:\n${output.join("").split("\n").slice(-15).join("\n")}`);
  return THEME_DIST;
}

/** Every file under `dir`, as Netlify site paths ("/sk/index.html"). */
export async function collectFiles(dir: string): Promise<DeployFile[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return Promise.all(
    entries
      .filter((e) => e.isFile())
      .map(async (e) => {
        const full = join(e.parentPath, e.name);
        return {
          path: `/${relative(dir, full).split(sep).join("/")}`,
          content: new Uint8Array(await readFile(full)),
        };
      }),
  );
}

export interface PublishOptions {
  env: NodeJS.ProcessEnv;
  /** Name for a new site (<name>.netlify.app). Default: "<profile name>-portfolio". */
  siteName?: string;
  draft?: boolean;
  onProgress?: (message: string) => void;
  /** Injectable for tests. */
  buildTheme?: (portfolioDir: string, siteUrl: string) => Promise<string>;
  fetch?: typeof fetch;
}

export interface PublishResult {
  site: NetlifySite;
  created: boolean;
  deploy: DeployResult;
  projects: number;
  warnings: string[];
}

export async function publishWorkspace(ws: Workspace, options: PublishOptions): Promise<PublishResult> {
  const progress = options.onProgress ?? (() => {});
  const token = options.env.NETLIFY_TOKEN;
  if (!token) throw new WorkspaceError("NETLIFY_TOKEN is not set. Add it to .env (see .env.example).");
  const netlify = new NetlifyClient({ token, fetch: options.fetch });
  const config = await requireConfig(ws);

  progress("Building portfolio.json…");
  const { portfolio, warnings } = await buildWorkspace(ws);
  if (!portfolio.projects.length) throw new WorkspaceError("The portfolio has no projects to publish. Show some in the editor first.");

  // One site per portfolio, remembered in publish.json; never an existing site of the user's.
  const state = await readOptional(ws.publish, PublishState);
  let site = state ? await findSite(netlify, state.siteId) : null;
  if (state && !site) {
    throw new WorkspaceError(
      `The site "${state.siteName}" (${state.siteId}) no longer exists on Netlify. Delete ${ws.publish} to create a new one.`,
    );
  }
  const created = !site;
  if (!site) {
    const name = options.siteName ?? `${slugify(config.profile?.name ?? "my")}-portfolio`;
    progress(`Creating Netlify site "${name}"…`);
    try {
      site = await createSite(netlify, name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/unique|taken|422/.test(message)) {
        throw new WorkspaceError(`The site name "${name}" is taken on Netlify. Pick another: japs publish --site-name <name>`);
      }
      throw err;
    }
    // Remember it right away, so a failed first deploy doesn't create a second site next time.
    await writeState(ws, { site, lastDeploy: null });
  }

  progress("Building the site…");
  const dist = await (options.buildTheme ?? buildTheme)(ws.out, site.url);
  const files = await collectFiles(dist);

  progress(`Deploying ${files.length} files${options.draft ? " as a draft" : ""}…`);
  const deploy = await deploySite(netlify, site.id, files, { draft: options.draft, onProgress: progress });
  await writeState(ws, {
    site,
    lastDeploy: { id: deploy.deployId, url: deploy.url || site.url, draft: options.draft ?? false, at: new Date().toISOString() },
  });
  return { site, created, deploy, projects: portfolio.projects.length, warnings };
}

async function writeState(ws: Workspace, data: { site: NetlifySite; lastDeploy: PublishState["lastDeploy"] }): Promise<void> {
  const state: PublishState = {
    version: 1,
    siteId: data.site.id,
    siteName: data.site.name,
    url: data.site.url,
    adminUrl: data.site.adminUrl,
    lastDeploy: data.lastDeploy,
  };
  await writeFile(ws.publish, `${JSON.stringify(PublishState.parse(state), null, 2)}\n`, "utf8");
}
