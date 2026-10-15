import {
  buildPortfolio,
  createDeploy,
  createSite,
  findSite,
  getDeployState,
  NetlifyClient,
  type NetlifySite,
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
  type ThemeId,
} from "@japs/schema";
import { randomToken } from "./crypto.ts";
import type { Build, UserStore } from "./db.ts";
import type { Bucket, Env } from "./env.ts";
import { wrapAnalysis, wrapFacts } from "./pipeline.ts";
import { netlifyToken } from "./tokens.ts";

/**
 * Publishing from the hosted version (#34, ADR 0011). The Worker prepares portfolio.json and
 * the Netlify site, GitHub Actions builds the theme exactly like `japs publish`, and the Worker
 * forwards the built files to Netlify, so the user's token never leaves it.
 */

/** Netlify allows 3 deploys a minute and 100 a day per account. */
export const BUILD_LIMITS = { perDay: 20, minGapMs: 30_000, staleAfterMs: 20 * 60_000 } as const;

export class PublishError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 429 | 501 | 502 = 400,
  ) {
    super(message);
  }
}

/** What the workflow downloads: the portfolio and where its screenshots come from. */
export interface BuildInput {
  version: 1;
  buildId: string;
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
  draft: boolean;
  siteUrl: string;
  url: string | null;
  message: string | null;
  createdAt: string;
}

export const toStatus = (b: Build): PublishStatus => ({
  id: b.id,
  status: b.status,
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

/** The site JAPS created for this user (publish document), or a new one. Never any other site. */
async function siteFor(user: UserStore, netlify: NetlifyClient, name: string): Promise<NetlifySite> {
  const stored = PublishState.safeParse(await user.getDocument("publish"));
  if (stored.success) {
    const site = await findSite(netlify, stored.data.siteId);
    if (site) return site;
    // Deleted on Netlify: start over with a new site rather than fail forever.
  }
  const base = `${slugify(name) || "my"}-portfolio`;
  let site: NetlifySite;
  try {
    site = await createSite(netlify, base);
  } catch (err) {
    if (!/unique|taken|422/.test(err instanceof Error ? err.message : String(err))) throw err;
    site = await createSite(netlify, `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`);
  }
  // Remembered right away, so a failed first build doesn't create a second site.
  await user.putDocument("publish", {
    version: 1,
    siteId: site.id,
    siteName: site.name,
    url: site.url,
    adminUrl: site.adminUrl,
    lastDeploy: null,
  } satisfies PublishState);
  return site;
}

/** POST /api/publish: checks, portfolio, site, build input in R2, then the workflow run. */
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

  const netlify = new NetlifyClient({ token: await netlifyToken(user, env), fetch: deps.fetch });
  const site = await siteFor(user, netlify, config.profile?.name ?? "my");
  const buildId = await user.createBuild({ theme: config.theme, draft, siteId: site.id, siteUrl: site.url });

  const builder = new URL("/builder/builds/", env.APP_URL);
  const input: BuildInput = {
    version: 1,
    buildId,
    theme: config.theme,
    siteUrl: site.url,
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

/**
 * GET /api/publish/latest: while deploying, asks Netlify once whether the site is live, so the
 * browser's polling drives the state. A build that went quiet is reported as failed.
 */
export async function refreshPublish(user: UserStore, deps: PublishDeps): Promise<Build | null> {
  const build = await user.latestBuild();
  if (!build || (build.status !== "building" && build.status !== "deploying")) return build;
  if (!isActive(build, deps.now)) {
    await user.updateBuild(build.id, { status: "failed", message: "The build timed out. Please publish again." });
    return user.getBuild(build.id);
  }
  if (build.status !== "deploying" || !build.deployId || !build.files) return build;

  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  const state = await getDeployState(netlify, build.deployId, build.draft);
  if (state.state === "pending") return build;
  if (state.state === "error") {
    await user.updateBuild(build.id, { status: "failed", message: `Netlify deploy failed: ${state.error}` });
  } else {
    const url = state.url || build.siteUrl;
    await user.updateBuild(build.id, { status: "live", url, message: null });
    const stored = PublishState.safeParse(await user.getDocument("publish"));
    if (stored.success) {
      await user.putDocument("publish", {
        ...stored.data,
        lastDeploy: { id: build.deployId, url, draft: build.draft, at: deps.now.toISOString() },
      } satisfies PublishState);
    }
  }
  return user.getBuild(build.id);
}

// --- Builder side: called by the GitHub Actions run, authenticated with OIDC ---

const SHA1 = /^[0-9a-f]{40}$/;
const MAX_FILES = 5000;

/** POST /builder/builds/:id/deploy: digests of the built site -> a Netlify deploy. */
export async function createBuildDeploy(user: UserStore, build: Build, files: unknown, deps: PublishDeps): Promise<string[]> {
  if (build.status !== "building") throw new PublishError("This build is not waiting for files.", 409);
  const valid =
    typeof files === "object" &&
    files !== null &&
    Object.keys(files).length > 0 &&
    Object.keys(files).length <= MAX_FILES &&
    Object.entries(files).every(([path, sha]) => path.startsWith("/") && !path.includes("..") && typeof sha === "string" && SHA1.test(sha));
  if (!valid) throw new PublishError("Expected { files: { \"/path\": \"<sha1>\" } }.");

  const digests = files as Record<string, string>;
  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  const { deployId, required } = await createDeploy(netlify, build.siteId, digests, build.draft);
  await user.updateBuild(build.id, { status: "deploying", deployId, files: digests, required });
  return required;
}

/** PUT /builder/builds/:id/files/<path>: one required file, checked and forwarded to Netlify. */
export async function forwardBuildFile(user: UserStore, build: Build, path: string, content: Uint8Array<ArrayBuffer>, deps: PublishDeps): Promise<void> {
  if (build.status !== "deploying" || !build.deployId || !build.files || !build.required) {
    throw new PublishError("This build is not uploading.", 409);
  }
  const sha = build.files[path];
  if (!sha || !build.required.includes(sha)) throw new PublishError(`Netlify doesn't need ${path}.`);
  if ((await sha1Hex(content)) !== sha) throw new PublishError(`Content of ${path} doesn't match its digest.`);
  const netlify = new NetlifyClient({ token: await netlifyToken(user, deps.env), fetch: deps.fetch });
  await uploadDeployFile(netlify, build.deployId, path, content);
}

/** POST /builder/builds/:id/finish: the run is done (or failed). The input is no longer needed. */
export async function finishBuild(user: UserStore, userId: string, build: Build, outcome: { ok: boolean; message?: string }, bucket: Bucket): Promise<void> {
  await bucket.delete([inputKey(userId, build.id)]);
  if (!outcome.ok) {
    await user.updateBuild(build.id, { status: "failed", message: (outcome.message ?? "The build failed.").slice(0, 500) });
  }
}
