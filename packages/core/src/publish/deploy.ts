import { z } from "zod";
import type { NetlifyClient } from "../discovery/netlify.ts";

/**
 * Publishing the built site to Netlify through the file-digest deploy API (ADR 0008):
 * send SHA-1 per path, upload only what Netlify doesn't have, wait until it's live.
 * fetch + Web Crypto only, so it also runs in Edge Functions later.
 */

export interface DeployFile {
  /** Site path with a leading slash, e.g. "/sk/index.html". */
  path: string;
  content: Uint8Array<ArrayBuffer>;
}

const RawSite = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  ssl_url: z.string().nullish(),
  admin_url: z.string().nullish(),
});
export type NetlifySite = { id: string; name: string; url: string; adminUrl: string | null };

const toSite = (raw: z.infer<typeof RawSite>): NetlifySite => ({
  id: raw.id,
  name: raw.name,
  url: raw.ssl_url || raw.url,
  adminUrl: raw.admin_url ?? null,
});

const RawDeploy = z.object({
  id: z.string(),
  state: z.string(),
  required: z.array(z.string()).nullish(),
  deploy_ssl_url: z.string().nullish(),
  deploy_url: z.string().nullish(),
  ssl_url: z.string().nullish(),
  error_message: z.string().nullish(),
});

export async function sha1Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-1", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a new site. The name becomes <name>.netlify.app and must be free on Netlify. */
export async function createSite(netlify: NetlifyClient, name: string): Promise<NetlifySite> {
  return toSite(RawSite.parse(await netlify.send("POST", "/sites", { name })));
}

/** The site, or null when it no longer exists (deleted in the Netlify UI). */
export async function findSite(netlify: NetlifyClient, siteId: string): Promise<NetlifySite | null> {
  try {
    return toSite(RawSite.parse(await netlify.get(`/sites/${siteId}`)));
  } catch (err) {
    if (err instanceof Error && / 404 /.test(err.message)) return null;
    throw err;
  }
}

export interface DeployResult {
  deployId: string;
  /** Live URL; for a draft, the unique preview URL. */
  url: string;
  uploaded: number;
  total: number;
}

export interface DeployOptions {
  /** Preview deploy on its own URL; the live site stays as it is. */
  draft?: boolean;
  onProgress?: (message: string) => void;
  /** Polling while Netlify processes the deploy. Injectable for tests. */
  wait?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export async function deploySite(
  netlify: NetlifyClient,
  siteId: string,
  files: DeployFile[],
  options: DeployOptions = {},
): Promise<DeployResult> {
  const wait = options.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const progress = options.onProgress ?? (() => {});

  const digests: Record<string, string> = {};
  const bySha = new Map<string, DeployFile>();
  for (const file of files) {
    const sha = await sha1Hex(file.content);
    digests[file.path] = sha;
    if (!bySha.has(sha)) bySha.set(sha, file);
  }

  let deploy = RawDeploy.parse(
    await netlify.send("POST", `/sites/${siteId}/deploys`, { files: digests, draft: options.draft ?? false }),
  );

  // Only content Netlify hasn't seen before; identical files are uploaded once.
  const required = [...new Set(deploy.required ?? [])];
  progress(`Uploading ${required.length} of ${files.length} files…`);
  for (const [i, sha] of required.entries()) {
    const file = bySha.get(sha);
    if (!file) throw new Error(`Netlify asked for unknown content ${sha}`);
    await netlify.send("PUT", `/deploys/${deploy.id}/files${encodePath(file.path)}`, file.content);
    if ((i + 1) % 10 === 0) progress(`Uploaded ${i + 1}/${required.length}`);
  }

  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  while (deploy.state !== "ready") {
    if (deploy.state === "error") throw new Error(`Netlify deploy failed: ${deploy.error_message ?? "unknown error"}`);
    if (Date.now() > deadline) throw new Error(`Netlify deploy ${deploy.id} still "${deploy.state}" after waiting`);
    await wait(1500);
    deploy = RawDeploy.parse(await netlify.get(`/deploys/${deploy.id}`));
  }

  const url = (options.draft ? deploy.deploy_ssl_url || deploy.deploy_url : deploy.ssl_url) ?? deploy.deploy_ssl_url ?? "";
  return { deployId: deploy.id, url, uploaded: required.length, total: files.length };
}
