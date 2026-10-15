import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  CloudflareClient,
  createPagesProject,
  createSite,
  type DeployFile,
  type DeployResult,
  deployPagesSite,
  deploySite,
  findPagesProject,
  findSite,
  NetlifyClient,
  type PagesProject,
  slugify,
} from "@japs/core";
import { PublishState, type PublishTarget, type ThemeId } from "@japs/schema";
import { buildTheme } from "./theme.ts";
import { buildWorkspace, readOptional, requireConfig, type Workspace, WorkspaceError } from "./workspace.ts";

/**
 * `japs publish` (ADR 0008, 0012): build portfolio + theme, deploy to the user's own Netlify
 * site or Cloudflare Pages project, the one JAPS created and remembers in publish.json.
 */

/** Every file under `dir`, as site paths ("/sk/index.html"). */
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
  /** Overrides the config's publish.target for this run. */
  target?: PublishTarget;
  /** Name for a new site (<name>.netlify.app / <name>.pages.dev). Default: "<profile name>-portfolio". */
  siteName?: string;
  draft?: boolean;
  onProgress?: (message: string) => void;
  /** Injectable for tests. */
  buildTheme?: (portfolioDir: string, siteUrl: string, theme: ThemeId) => Promise<string>;
  fetch?: typeof fetch;
}

/** The published site, whichever the target. */
export interface PublishedSite {
  id: string;
  name: string;
  url: string;
  adminUrl: string | null;
}

export interface PublishResult {
  target: PublishTarget;
  site: PublishedSite;
  created: boolean;
  deploy: DeployResult;
  projects: number;
  warnings: string[];
}

const taken = (err: unknown) => /unique|taken|already exists|422|409/i.test(err instanceof Error ? err.message : String(err));

export async function publishWorkspace(ws: Workspace, options: PublishOptions): Promise<PublishResult> {
  const progress = options.onProgress ?? (() => {});
  const config = await requireConfig(ws);
  const target = options.target ?? config.publish.target;
  const env = options.env;
  if (target === "netlify" && !env.NETLIFY_TOKEN) throw new WorkspaceError("NETLIFY_TOKEN is not set. Add it to .env (see .env.example).");
  if (target === "cloudflare" && !env.CLOUDFLARE_API_TOKEN) {
    throw new WorkspaceError("CLOUDFLARE_API_TOKEN is not set. Add a token with Cloudflare Pages: Edit to .env (see .env.example).");
  }

  progress("Building portfolio.json…");
  const { portfolio, warnings } = await buildWorkspace(ws);
  if (!portfolio.projects.length) throw new WorkspaceError("The portfolio has no projects to publish. Show some in the editor first.");

  const state: PublishState = (await readOptional(ws.publish, PublishState)) ?? { version: 1, netlify: null, cloudflare: null };
  const name = options.siteName ?? `${slugify(config.profile?.name ?? "my")}-portfolio`;
  const build = async (siteUrl: string) => {
    progress(`Building the site with the "${config.theme}" theme…`);
    return collectFiles(await (options.buildTheme ?? buildTheme)(ws.out, siteUrl, config.theme));
  };
  const lastDeploy = (deploy: DeployResult, siteUrl: string) => ({
    id: deploy.deployId,
    url: deploy.url || siteUrl,
    draft: options.draft ?? false,
    at: new Date().toISOString(),
  });

  if (target === "cloudflare") {
    const cf = new CloudflareClient({ token: env.CLOUDFLARE_API_TOKEN!, fetch: options.fetch });
    const accountId = state.cloudflare?.accountId ?? (await chooseAccount(cf, env.CLOUDFLARE_ACCOUNT_ID));
    let project: PagesProject | null = state.cloudflare ? await findPagesProject(cf, accountId, state.cloudflare.projectName) : null;
    if (state.cloudflare && !project) {
      throw new WorkspaceError(
        `The Pages project "${state.cloudflare.projectName}" no longer exists on Cloudflare. Remove "cloudflare" from ${ws.publish} to create a new one.`,
      );
    }
    const created = !project;
    if (!project) {
      progress(`Creating Cloudflare Pages project "${name}"…`);
      try {
        project = await createPagesProject(cf, accountId, name);
      } catch (err) {
        if (taken(err)) throw new WorkspaceError(`The project name "${name}" is taken on Cloudflare Pages. Pick another: japs publish --site-name <name>`);
        throw err;
      }
      state.cloudflare = { accountId, projectId: project.id, projectName: project.name, url: project.url, lastDeploy: null };
      // Remember it right away, so a failed first deploy doesn't create a second project.
      await writeState(ws, state);
    }

    const files = await build(project.url);
    progress(`Deploying ${files.length} files to Cloudflare Pages${options.draft ? " as a draft" : ""}…`);
    const deploy = await deployPagesSite(cf, accountId, project, files, { draft: options.draft, onProgress: progress });
    state.cloudflare = { ...state.cloudflare!, lastDeploy: lastDeploy(deploy, project.url) };
    await writeState(ws, state);
    const adminUrl = `https://dash.cloudflare.com/${accountId}/pages/view/${project.name}`;
    return { target, site: { id: project.id, name: project.name, url: project.url, adminUrl }, created, deploy, projects: portfolio.projects.length, warnings };
  }

  const netlify = new NetlifyClient({ token: env.NETLIFY_TOKEN!, fetch: options.fetch });
  // One site per portfolio, remembered in publish.json; never an existing site of the user's.
  let site = state.netlify ? await findSite(netlify, state.netlify.siteId) : null;
  if (state.netlify && !site) {
    throw new WorkspaceError(
      `The site "${state.netlify.siteName}" (${state.netlify.siteId}) no longer exists on Netlify. Remove "netlify" from ${ws.publish} to create a new one.`,
    );
  }
  const created = !site;
  if (!site) {
    progress(`Creating Netlify site "${name}"…`);
    try {
      site = await createSite(netlify, name);
    } catch (err) {
      if (taken(err)) throw new WorkspaceError(`The site name "${name}" is taken on Netlify. Pick another: japs publish --site-name <name>`);
      throw err;
    }
    state.netlify = { siteId: site.id, siteName: site.name, url: site.url, adminUrl: site.adminUrl, lastDeploy: null };
    await writeState(ws, state);
  }

  const files = await build(site.url);
  progress(`Deploying ${files.length} files${options.draft ? " as a draft" : ""}…`);
  const deploy = await deploySite(netlify, site.id, files, { draft: options.draft, onProgress: progress });
  state.netlify = { ...state.netlify!, lastDeploy: lastDeploy(deploy, site.url) };
  await writeState(ws, state);
  return { target, site, created, deploy, projects: portfolio.projects.length, warnings };
}

/** The account for a new Pages project: the only one, or CLOUDFLARE_ACCOUNT_ID when there are several. */
async function chooseAccount(cf: CloudflareClient, preferred: string | undefined): Promise<string> {
  const accounts = await cf.listAccounts();
  if (preferred) {
    if (!accounts.some((a) => a.id === preferred)) throw new WorkspaceError(`CLOUDFLARE_ACCOUNT_ID ${preferred} is not one of the token's accounts.`);
    return preferred;
  }
  if (accounts.length === 1) return accounts[0]!.id;
  if (!accounts.length) throw new WorkspaceError("The Cloudflare token can't see any account.");
  const list = accounts.map((a) => `  ${a.id}  ${a.name}`).join("\n");
  throw new WorkspaceError(`The token can see several Cloudflare accounts. Set CLOUDFLARE_ACCOUNT_ID in .env to one of:\n${list}`);
}

async function writeState(ws: Workspace, state: PublishState): Promise<void> {
  await writeFile(ws.publish, `${JSON.stringify(PublishState.parse(state), null, 2)}\n`, "utf8");
}
