import {
  buildPortfolio,
  CloudflareClient,
  createDeploy,
  createPagesDeployment,
  createPagesProject,
  createSite,
  findPagesProject,
  findSite,
  getDeployState,
  getPagesDeploymentState,
  NetlifyClient,
  PAGES_DRAFT_BRANCH,
  pagesCheckMissing,
  pagesContentType,
  pagesUpload,
  pagesUploadToken,
  pagesUpsertHashes,
  sha1Hex,
  slugify,
  uploadDeployFile,
} from "@japs/core";
import {
  JapsConfig,
  type Portfolio,
  type ProjectAnalysis,
  type ProjectFacts,
  type ProjectsFile,
  PublishState,
  type PublishTarget,
  type ThemeId,
} from "@japs/schema";
import { randomToken } from "./crypto.ts";
import type { Build, UserStore } from "./db.ts";
import type { Env } from "./env.ts";
import { wrapAnalysis, wrapFacts } from "./pipeline.ts";
import { cloudflareToken, ConnectionError, netlifyToken } from "./tokens.ts";

/**
 * Publishing from the hosted version (#34, ADR 0011, 0012). The Worker prepares portfolio.json
 * and the user's JAPS site (Netlify) or project (Cloudflare Pages), GitHub Actions builds the
 * theme exactly like `japs publish`, and the Worker forwards the built files, so the user's
 * tokens never leave it.
 */

/** Netlify allows 3 deploys a minute and 100 a day per account; Pages is similar. */
export const BUILD_LIMITS = { perDay: 20, minGapMs: 30_000, staleAfterMs: 20 * 60_000 } as const;

export class PublishError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 429 | 501 | 502 = 400,
  ) {
    super(message);
  }
}

/** What the workflow downloads: the portfolio, where its screenshots come from, how to hash. */
export interface BuildInput {
  version: 1;
  buildId: string;
  /** Netlify wants SHA-1 digests, Cloudflare Pages its own BLAKE3-based hash. */
  target: PublishTarget;
  theme: ThemeId;
  siteUrl: string;
  portfolio: Portfolio;
  /** Images to place next to portfolio.json; own shots via the builder API, Netlify's directly. */
  assets: { path: string; url: string }[];
}

export const inputKey = (userId: string, buildId: string) => `${userId}/builds/${buildId}.json`;

/** What the browser sees about a publish. */
export interface PublishStatus {
  id: string;
  status: Build["status"];
  target: PublishTarget;
  draft: boolean;
  siteUrl: string;
  url: string | null;
  message: string | null;
  createdAt: string;
}

export const toStatus = (b: Build): PublishStatus => ({
  id: b.id,
  status: b.status,
  target: b.target,
  draft: b.draft,
  siteUrl: b.siteUrl,
  url: b.url,
  message: b.message,
  createdAt: b.createdAt,
});

const isActive = (b: Build | null, now: Date) =>
  b !== null && (b.status === "building" || b.status === "deploying") && now.getTime() - Date.parse(b.updatedAt) < BUILD_LIMITS.staleAfterMs;

export interface PublishDeps {
  env: Env;
  fetch: typeof fetch;
  now: Date;
}

/** The portfolio as `japs build` makes it, from the per-project rows in D1. */
async function portfolioFor(user: UserStore, now: Date) {
  const projectsFile = (await user.getDocument("projects")) as ProjectsFile | null;
  if (!projectsFile) throw new PublishError("Import your projects first.");
  const config = JapsConfig.parse((await user.getDocument("config")) ?? { version: 1 });
  const analysis = (await user.listProjectDocs("analysis")).map((d) => d.body as ProjectAnalysis);
  const facts = (await user.listProjectDocs("facts")).map((d) => d.body as ProjectFacts);
  try {
    const result = buildPortfolio({
      projectsFile,
      analysisFile: wrapAnalysis(analysis, config.locales, now),
      factsFile: wrapFacts(facts, now),
      config,
      screenshots: { version: 1, shots: await user.listScreenshots() },
      now,
    });
    return { config, ...result };
  } catch (err) {
    throw new PublishError(err instanceof Error ? err.message : String(err));
  }
}

const loadState = async (user: UserStore): Promise<PublishState> =>
  PublishState.safeParse(await user.getDocument("publish")).data ?? { version: 1, netlify: null, cloudflare: null };

const taken = (err: unknown) => /unique|taken|already exists|422|409/i.test(err instanceof Error ? err.message : String(err));
const withSuffix = (base: string) => `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Where a build goes: the user's JAPS site or project, created on first use. Never another one. */
interface Destination {
  siteId: string;
  siteUrl: string;
  accountId: string | null;
}

async function netlifyDestination(user: UserStore, deps: PublishDeps, base: string): Promise<Destination> {
  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  const state = await loadState(user);
  // Deleted on Netlify: start over with a new site rather than fail forever.
  const existing = state.netlify ? await findSite(netlify, state.netlify.siteId) : null;
  if (existing) return { siteId: existing.id, siteUrl: existing.url, accountId: null };
  const site = await createSite(netlify, base).catch((err: unknown) => {
    if (!taken(err)) throw err;
    return createSite(netlify, withSuffix(base));
  });
  // Remembered right away, so a failed first build doesn't create a second site.
  await user.putDocument("publish", {
    ...state,
    netlify: { siteId: site.id, siteName: site.name, url: site.url, adminUrl: site.adminUrl, lastDeploy: null },
  } satisfies PublishState);
  return { siteId: site.id, siteUrl: site.url, accountId: null };
}

async function cloudflareClient(user: UserStore, deps: PublishDeps): Promise<CloudflareClient> {
  const token = await cloudflareToken(user, deps.env, deps.fetch, deps.now);
  if (!token) throw new ConnectionError("Connect Cloudflare first.");
  return new CloudflareClient({ token, fetch: deps.fetch });
}

async function cloudflareDestination(user: UserStore, deps: PublishDeps, base: string): Promise<Destination> {
  const cf = await cloudflareClient(user, deps);
  const state = await loadState(user);
  if (state.cloudflare) {
    const existing = await findPagesProject(cf, state.cloudflare.accountId, state.cloudflare.projectName);
    if (existing) return { siteId: existing.name, siteUrl: existing.url, accountId: state.cloudflare.accountId };
  }
  // The first account the user granted; OAuth lets them pick which ones at consent.
  const [account] = await cf.listAccounts();
  if (!account) throw new PublishError("The Cloudflare connection can't see any account. Connect Cloudflare again and pick one.");
  const project = await createPagesProject(cf, account.id, base).catch((err: unknown) => {
    if (!taken(err)) throw err;
    return createPagesProject(cf, account.id, withSuffix(base));
  });
  await user.putDocument("publish", {
    ...state,
    cloudflare: { accountId: account.id, projectId: project.id, projectName: project.name, url: project.url, lastDeploy: null },
  } satisfies PublishState);
  return { siteId: project.name, siteUrl: project.url, accountId: account.id };
}

/** POST /api/publish: checks, portfolio, destination, build input in R2, then the workflow run. */
export async function startPublish(user: UserStore, userId: string, draft: boolean, deps: PublishDeps): Promise<Build> {
  const { env, now } = deps;
  if (!env.GITHUB_BUILD_TOKEN || !env.JAPS_BUILD_REPO || !env.SHOTS) {
    throw new PublishError("Publishing is not configured on this server.", 501);
  }
  const latest = await user.latestBuild();
  if (isActive(latest, now)) throw new PublishError("A publish is already running.", 409);
  if (latest && now.getTime() - Date.parse(latest.createdAt) < BUILD_LIMITS.minGapMs) {
    throw new PublishError("Please wait half a minute between publishes.", 429);
  }
  if ((await user.countBuildsSince(new Date(now.getTime() - 86_400_000).toISOString())) >= BUILD_LIMITS.perDay) {
    throw new PublishError(`You can publish up to ${BUILD_LIMITS.perDay} times a day. Try again tomorrow.`, 429);
  }

  const { config, portfolio, screenshots } = await portfolioFor(user, now);
  if (!portfolio.projects.length) throw new PublishError("The portfolio has no projects to publish. Show some first.");

  const target = config.publish.target;
  const base = `${slugify(config.profile?.name ?? "my") || "my"}-portfolio`;
  const destination = target === "cloudflare" ? await cloudflareDestination(user, deps, base) : await netlifyDestination(user, deps, base);
  const buildId = await user.createBuild({ theme: config.theme, draft, target, ...destination });

  const builder = new URL("/builder/builds/", env.APP_URL);
  const input: BuildInput = {
    version: 1,
    buildId,
    target,
    theme: config.theme,
    siteUrl: destination.siteUrl,
    portfolio,
    assets: screenshots.map(({ path, source }) => ({
      path,
      url: "file" in source ? new URL(`${buildId}/screenshots/${encodeURIComponent(source.file)}`, builder).toString() : source.url,
    })),
  };
  await env.SHOTS.put(inputKey(userId, buildId), new TextEncoder().encode(JSON.stringify(input)), {
    httpMetadata: { contentType: "application/json" },
  });

  const res = await deps.fetch(`https://api.github.com/repos/${env.JAPS_BUILD_REPO}/actions/workflows/publish.yml/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_BUILD_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "JAPS",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main", inputs: { build: buildId, api: new URL(env.APP_URL).origin } }),
  });
  if (!res.ok) {
    await user.updateBuild(buildId, { status: "failed", message: `Could not start the build (${res.status}).` });
    await env.SHOTS.delete([inputKey(userId, buildId)]);
    throw new PublishError("Could not start the build. Please try again later.", 502);
  }
  return (await user.getBuild(buildId))!;
}

/** Records a live deploy on the destination, so the editor and the next publish know it. */
async function recordLive(user: UserStore, build: Build, url: string, deployId: string, now: Date): Promise<void> {
  await user.updateBuild(build.id, { status: "live", url, message: null });
  const state = await loadState(user);
  const lastDeploy = { id: deployId, url, draft: build.draft, at: now.toISOString() };
  if (build.target === "cloudflare" && state.cloudflare) state.cloudflare = { ...state.cloudflare, lastDeploy };
  if (build.target === "netlify" && state.netlify) state.netlify = { ...state.netlify, lastDeploy };
  await user.putDocument("publish", state satisfies PublishState);
}

/**
 * GET /api/publish/latest: while deploying, asks Netlify or Pages once whether the site is live,
 * so the browser's polling drives the state. A build that went quiet is reported as failed.
 */
export async function refreshPublish(user: UserStore, deps: PublishDeps): Promise<Build | null> {
  const build = await user.latestBuild();
  if (!build || (build.status !== "building" && build.status !== "deploying")) return build;
  if (!isActive(build, deps.now)) {
    await user.updateBuild(build.id, { status: "failed", message: "The build timed out. Please publish again." });
    return user.getBuild(build.id);
  }
  if (build.status !== "deploying" || !build.deployId || !build.files) return build;

  const state =
    build.target === "cloudflare"
      ? await getPagesDeploymentState(await cloudflareClient(user, deps), build.accountId!, build.siteId, build.deployId)
      : await getDeployState(new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch }), build.deployId, build.draft);
  if (state.state === "pending") return build;
  if (state.state === "error") {
    await user.updateBuild(build.id, { status: "failed", message: `Deploy failed: ${state.error}` });
  } else {
    // Pages reports the deployment's own URL; production is the project URL.
    const url = build.target === "cloudflare" && !build.draft ? build.siteUrl : state.url || build.siteUrl;
    await recordLive(user, build, url, build.deployId, deps.now);
  }
  return user.getBuild(build.id);
}

// --- Builder side: called by the GitHub Actions run, authenticated with OIDC ---

const DIGEST = { netlify: /^[0-9a-f]{40}$/, cloudflare: /^[0-9a-f]{32}$/ } as const;
const MAX_FILES = 5000;

/** POST /builder/builds/:id/deploy: digests of the built site -> what still has to be uploaded. */
export async function createBuildDeploy(user: UserStore, build: Build, files: unknown, deps: PublishDeps): Promise<string[]> {
  if (build.status !== "building") throw new PublishError("This build is not waiting for files.", 409);
  const pattern = DIGEST[build.target];
  const valid =
    typeof files === "object" &&
    files !== null &&
    Object.keys(files).length > 0 &&
    Object.keys(files).length <= MAX_FILES &&
    Object.entries(files).every(([path, hash]) => path.startsWith("/") && !path.includes("..") && typeof hash === "string" && pattern.test(hash));
  if (!valid) throw new PublishError('Expected { files: { "/path": "<hash>" } }.');
  const digests = files as Record<string, string>;

  if (build.target === "cloudflare") {
    // Pages: no deployment until every missing asset is in; it's created on finish.
    const cf = await cloudflareClient(user, deps);
    const jwt = await pagesUploadToken(cf, build.accountId!, build.siteId);
    const required = await pagesCheckMissing(cf, jwt, [...new Set(Object.values(digests))]);
    await user.updateBuild(build.id, { status: "deploying", files: digests, required });
    return required;
  }

  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  const { deployId, required } = await createDeploy(netlify, build.siteId, digests, build.draft);
  await user.updateBuild(build.id, { status: "deploying", deployId, files: digests, required });
  return required;
}

/** PUT /builder/builds/:id/files/<path>: one required file, forwarded with the user's token. */
export async function forwardBuildFile(user: UserStore, build: Build, path: string, content: Uint8Array<ArrayBuffer>, deps: PublishDeps): Promise<void> {
  if (build.status !== "deploying" || !build.files || !build.required) throw new PublishError("This build is not uploading.", 409);
  const hash = build.files[path];
  if (!hash || !build.required.includes(hash)) throw new PublishError(`${path} isn't needed.`);

  if (build.target === "cloudflare") {
    // Pages' hash is BLAKE3 over base64, too costly to recompute per file within the free CPU
    // limit; a wrong file could only spoil this user's own deployment, and the run is OIDC-verified.
    const cf = await cloudflareClient(user, deps);
    const jwt = await pagesUploadToken(cf, build.accountId!, build.siteId);
    await pagesUpload(cf, jwt, [{ hash, content, contentType: pagesContentType(path) }]);
    return;
  }
  if (!build.deployId) throw new PublishError("This build is not uploading.", 409);
  if ((await sha1Hex(content)) !== hash) throw new PublishError(`Content of ${path} doesn't match its digest.`);
  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  await uploadDeployFile(netlify, build.deployId, path, content);
}

/**
 * POST /builder/builds/:id/finish: the run is done (or failed). For Pages, this is when the
 * deployment is created from the manifest. The input in R2 is no longer needed either way.
 */
export async function finishBuild(
  user: UserStore,
  userId: string,
  build: Build,
  outcome: { ok: boolean; message?: string },
  deps: PublishDeps,
): Promise<void> {
  await deps.env.SHOTS?.delete([inputKey(userId, build.id)]);
  if (!outcome.ok) {
    await user.updateBuild(build.id, { status: "failed", message: (outcome.message ?? "The build failed.").slice(0, 500) });
    return;
  }
  if (build.target === "cloudflare" && build.status === "deploying" && build.files) {
    const cf = await cloudflareClient(user, deps);
    const jwt = await pagesUploadToken(cf, build.accountId!, build.siteId);
    await pagesUpsertHashes(cf, jwt, [...new Set(Object.values(build.files))]);
    const { id } = await createPagesDeployment(cf, build.accountId!, build.siteId, build.files, build.draft ? PAGES_DRAFT_BRANCH : "main");
    await user.updateBuild(build.id, { deployId: id });
  }
}
