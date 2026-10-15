import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha1Hex } from "@japs/core";
import { Portfolio, ThemeId } from "@japs/schema";
import { z } from "zod";
import { writePortfolio } from "./build.ts";
import { collectFiles } from "./publish.ts";
import { buildTheme } from "./theme.ts";
import { WorkspaceError } from "./workspace.ts";

/**
 * `japs cloud-build` (ADR 0011): run only by .github/workflows/publish.yml for the hosted
 * version. Downloads the build input from the JAPS API, builds the theme like `japs publish`,
 * and hands the files to the API, which deploys them with the user's Netlify token.
 * The repo is public, so nothing here prints portfolio content: counts only.
 */

const BuildInput = z.object({
  version: z.literal(1),
  buildId: z.string(),
  theme: ThemeId,
  siteUrl: z.string().url(),
  portfolio: Portfolio,
  assets: z.array(z.object({ path: z.string(), url: z.string().url() })),
});

const BUILD_ID = /^[0-9a-f-]{36}$/;
const THEME_FAILED = "The theme build failed.";

export interface CloudBuildOptions {
  buildId: string;
  /** Origin of the JAPS API, also the OIDC audience. */
  api: string;
  env: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  buildTheme?: typeof buildTheme;
  log?: (message: string) => void;
}

/** A GitHub Actions OIDC token for the API (needs `permissions: id-token: write`). */
async function oidcToken(env: NodeJS.ProcessEnv, audience: string, fetchImpl: typeof fetch): Promise<string> {
  const url = env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const token = env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) throw new WorkspaceError("No GitHub Actions OIDC token available (run inside the publish workflow).");
  const res = await fetchImpl(`${url}&audience=${encodeURIComponent(audience)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new WorkspaceError(`Could not get an OIDC token: ${res.status}`);
  return z.object({ value: z.string() }).parse(await res.json()).value;
}

export async function cloudBuild(options: CloudBuildOptions): Promise<void> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const log = options.log ?? console.log;
  if (!BUILD_ID.test(options.buildId)) throw new WorkspaceError("--build must be a build id.");
  const api = new URL(options.api).origin;
  const base = `${api}/builder/builds/${options.buildId}`;

  // Tokens live a few minutes; a fresh one per phase outlasts a slow build.
  let token = await oidcToken(options.env, api, fetchImpl);
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetchImpl(`${base}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new WorkspaceError(`${init.method ?? "GET"} ${path.split("/").slice(0, 2).join("/")} failed: ${res.status}`);
    return res;
  };

  try {
    const input = BuildInput.parse(await (await call("/input")).json());
    const dir = await mkdtemp(join(tmpdir(), "japs-build-"));

    // Own screenshots come from the API with the same token; Netlify's from their public URL.
    const authed: typeof fetch = (url, init) =>
      String(url).startsWith(`${api}/`) ? fetchImpl(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } }) : fetchImpl(url, init);
    const { warnings } = await writePortfolio(
      dir,
      { portfolio: input.portfolio, screenshots: input.assets.map((a) => ({ path: a.path, source: { url: a.url } })), warnings: [] },
      { fetch: authed },
    );
    log(`Portfolio: ${input.portfolio.projects.length} projects, ${input.assets.length - warnings.length}/${input.assets.length} screenshots.`);

    log(`Building the "${input.theme}" theme…`);
    let dist: string;
    try {
      dist = await (options.buildTheme ?? buildTheme)(dir, input.siteUrl, input.theme);
    } catch {
      // Astro's output can quote portfolio text, and the logs are public: only the fact.
      throw new WorkspaceError(THEME_FAILED);
    }
    const files = await collectFiles(dist);
    const digests: Record<string, string> = {};
    for (const file of files) digests[file.path] = await sha1Hex(file.content);

    token = await oidcToken(options.env, api, fetchImpl);
    const { required } = z
      .object({ required: z.array(z.string()) })
      .parse(await (await call("/deploy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: digests }) })).json());

    // Each content once, a few at a time.
    const needed = [...new Set(required)].map((sha) => files.find((f) => digests[f.path] === sha)!).filter(Boolean);
    log(`Uploading ${needed.length} of ${files.length} files…`);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, needed.length) }, async () => {
        while (next < needed.length) {
          const file = needed[next++]!;
          const path = file.path.split("/").map(encodeURIComponent).join("/");
          await call(`/files${path}`, { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.content });
        }
      }),
    );

    await call("/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) });
    log("Done. Netlify is publishing the site.");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await call("/finish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, message }) }).catch(() => {});
    throw new WorkspaceError(message);
  }
}
