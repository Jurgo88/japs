import { blake3 } from "@noble/hashes/blake3.js";
import { z } from "zod";
import type { CloudflareClient } from "../discovery/cloudflare.ts";
import type { DeployFile, DeployResult, DeployState } from "./deploy.ts";

/**
 * Publishing to Cloudflare Pages through Direct Upload (ADR 0012), the same API wrangler uses:
 * a short-lived upload token for the project, upload only the content Pages doesn't have,
 * then a deployment with a manifest of path -> hash. fetch + Web Crypto + pure-JS BLAKE3, so
 * it runs in the CLI and in the Worker.
 */

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** Pages' content hash: BLAKE3 of the base64 content plus the extension, 32 hex chars. */
export function pagesFileHash(content: Uint8Array, path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1) : "";
  const digest = blake3(new TextEncoder().encode(toBase64(content) + extension));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  webmanifest: "application/manifest+json",
  xml: "application/xml",
  txt: "text/plain",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  map: "application/json",
};

export function pagesContentType(path: string): string {
  return TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}

const RawProject = z.object({ id: z.string(), name: z.string(), subdomain: z.string().nullish() });
export interface PagesProject {
  id: string;
  name: string;
  /** https://<subdomain>.pages.dev */
  url: string;
}
const toProject = (raw: z.infer<typeof RawProject>): PagesProject => ({
  id: raw.id,
  name: raw.name,
  url: `https://${raw.subdomain || `${raw.name}.pages.dev`}`,
});

/** The project, or null when it no longer exists. */
export async function findPagesProject(cf: CloudflareClient, accountId: string, name: string): Promise<PagesProject | null> {
  try {
    return toProject(RawProject.parse(await cf.get(`/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}`)));
  } catch (err) {
    if (err instanceof Error && / 404 /.test(err.message)) return null;
    throw err;
  }
}

/** A new Direct Upload project; production is the "main" branch. The name must be free. */
export async function createPagesProject(cf: CloudflareClient, accountId: string, name: string): Promise<PagesProject> {
  const res = await cf.send("POST", `/accounts/${accountId}/pages/projects`, { name, production_branch: "main" });
  return toProject(RawProject.parse(res.result));
}

/** Short-lived token that may upload content to this project only. */
export async function pagesUploadToken(cf: CloudflareClient, accountId: string, project: string): Promise<string> {
  const result = await cf.get(`/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/upload-token`);
  return z.object({ jwt: z.string() }).parse(result).jwt;
}

/** Hashes Pages doesn't have yet. */
export async function pagesCheckMissing(cf: CloudflareClient, jwt: string, hashes: string[]): Promise<string[]> {
  return z.array(z.string()).parse((await cf.withToken(jwt).send("POST", "/pages/assets/check-missing", { hashes })).result);
}

export interface PagesAsset {
  hash: string;
  content: Uint8Array;
  contentType: string;
}

/** One upload request; callers keep it well under Pages' 40 MB per request. */
export async function pagesUpload(cf: CloudflareClient, jwt: string, assets: PagesAsset[]): Promise<void> {
  await cf.withToken(jwt).send(
    "POST",
    "/pages/assets/upload",
    assets.map((a) => ({ key: a.hash, value: toBase64(a.content), metadata: { contentType: a.contentType }, base64: true })),
  );
}

/** Marks every hash of the deployment as used, so later deploys can skip them. */
export async function pagesUpsertHashes(cf: CloudflareClient, jwt: string, hashes: string[]): Promise<void> {
  await cf.withToken(jwt).send("POST", "/pages/assets/upsert-hashes", { hashes });
}

/** Creates the deployment from a manifest of "/path" -> hash; "main" makes it production. */
export async function createPagesDeployment(
  cf: CloudflareClient,
  accountId: string,
  project: string,
  manifest: Record<string, string>,
  branch = "main",
): Promise<{ id: string }> {
  const form = new FormData();
  form.append("manifest", JSON.stringify(manifest));
  form.append("branch", branch);
  const res = await cf.send("POST", `/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments`, form);
  return { id: z.object({ id: z.string() }).parse(res.result).id };
}

const RawDeployment = z.object({
  id: z.string(),
  url: z.string().nullish(),
  latest_stage: z.object({ name: z.string().nullish(), status: z.string().nullish() }).partial().nullish(),
});

/** Pages deployments go through stages; done when the "deploy" stage succeeded. */
export async function getPagesDeploymentState(cf: CloudflareClient, accountId: string, project: string, id: string): Promise<DeployState> {
  const raw = RawDeployment.parse(await cf.get(`/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments/${id}`));
  const stage = raw.latest_stage;
  if (stage?.status === "failure" || stage?.status === "canceled") return { state: "error", url: raw.url ?? "", error: `${stage.name ?? "deploy"} ${stage.status}` };
  if (stage?.name === "deploy" && stage.status === "success") return { state: "ready", url: raw.url ?? "", error: null };
  return { state: "pending", url: raw.url ?? "", error: null };
}

/** Upload batches: by count and size, both well within Pages' limits. */
export function pagesBatches<T extends { content: Uint8Array }>(items: T[], maxBytes = 25 * 1024 * 1024, maxCount = 500): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const item of items) {
    if (current.length && (size + item.content.length > maxBytes || current.length >= maxCount)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.content.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

/** Branch for draft deploys: a preview URL of its own, production untouched. */
export const PAGES_DRAFT_BRANCH = "japs-draft";

/** Everything in one go, for the CLI: the counterpart of deploySite for Netlify. */
export async function deployPagesSite(
  cf: CloudflareClient,
  accountId: string,
  project: PagesProject,
  files: DeployFile[],
  options: {
    /** A preview on its own URL; production stays as it is. */
    draft?: boolean;
    onProgress?: (message: string) => void;
    wait?: (ms: number) => Promise<void>;
    timeoutMs?: number;
  } = {},
): Promise<DeployResult> {
  const progress = options.onProgress ?? (() => {});
  const wait = options.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const assets = files.map((f) => ({ path: f.path, hash: pagesFileHash(f.content, f.path), content: f.content, contentType: pagesContentType(f.path) }));
  const manifest = Object.fromEntries(assets.map((a) => [a.path, a.hash]));
  const unique = [...new Map(assets.map((a) => [a.hash, a])).values()];

  const jwt = await pagesUploadToken(cf, accountId, project.name);
  const missing = new Set(await pagesCheckMissing(cf, jwt, unique.map((a) => a.hash)));
  const upload = unique.filter((a) => missing.has(a.hash));
  progress(`Uploading ${upload.length} of ${files.length} files…`);
  for (const batch of pagesBatches(upload)) await pagesUpload(cf, jwt, batch);
  await pagesUpsertHashes(cf, jwt, unique.map((a) => a.hash));

  const { id } = await createPagesDeployment(cf, accountId, project.name, manifest, options.draft ? PAGES_DRAFT_BRANCH : "main");
  const deadline = Date.now() + (options.timeoutMs ?? 120_000);
  for (;;) {
    const state = await getPagesDeploymentState(cf, accountId, project.name, id);
    if (state.state === "error") throw new Error(`Cloudflare Pages deploy failed: ${state.error}`);
    if (state.state === "ready") {
      return { deployId: id, url: options.draft ? state.url : project.url, uploaded: upload.length, total: files.length };
    }
    if (Date.now() > deadline) throw new Error(`Cloudflare Pages deployment ${id} is still in progress after waiting`);
    await wait(1500);
  }
}
