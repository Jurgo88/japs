import { pagesContentType } from "@japs/core";
import { type Db, Store } from "../db.ts";
import type { Bucket } from "../env.ts";
import { siteUrl } from "./handles.ts";
import { fileKey, type Manifest, readManifest } from "./storage.ts";

/**
 * Serves portfolios at <handle>.<SITES_DOMAIN> (ADR 0013). Runs as a Worker of its own with
 * only the database and the sites bucket: no secrets, no tokens, no sessions. Everything it
 * serves was built by the publish workflow from a JAPS theme, never uploaded by a user.
 */
export interface SitesEnv {
  DB: Db;
  SITES: Bucket;
  SITES_DOMAIN: string;
  /** The editor, linked from notices; also gives the scheme (http only in local development). */
  APP_URL: string;
}

/** The label under the domain: "<handle>", or "<draft key>--<handle>" for a draft. */
export function parseHost(host: string | null, domain: string): { handle: string; draftKey: string | null } | null {
  if (!host) return null;
  let name = host.toLowerCase();
  // A port belongs to the domain only in local development ("localhost:8788").
  if (!domain.includes(":")) name = name.replace(/:\d+$/, "").replace(/\.$/, "");
  const suffix = `.${domain.toLowerCase()}`;
  if (!name.endsWith(suffix)) return null;
  const label = name.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  const at = label.indexOf("--");
  return at === -1 ? { handle: label, draftKey: null } : { handle: label.slice(at + 2), draftKey: label.slice(0, at) };
}

const SECURITY = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" };
const TEXT = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/;

function contentType(path: string): string {
  const type = pagesContentType(path);
  return TEXT.test(type) ? `${type}; charset=utf-8` : type;
}

/** Astro puts hashed bundles under /_astro/; they never change. Everything else revalidates. */
const cacheControl = (path: string, draft: boolean) =>
  draft ? "no-store" : path.startsWith("/_astro/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** A small page of our own for addresses without a portfolio. */
function notice(status: number, title: string, text: string, env: SitesEnv): Response {
  const app = new URL(env.APP_URL).origin;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#222}@media(prefers-color-scheme:dark){body{background:#111;color:#ddd}a{color:#8ab4f8}}</style></head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(app)}">JAPS</a> builds portfolios from what developers have shipped.</p></body></html>`;
  return new Response(html, { status, headers: { ...SECURITY, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const redirect = (status: 301 | 302, location: string) => new Response(null, { status, headers: { Location: location, "Cache-Control": "no-store" } });

/** Manifests never change once written, so an isolate keeps the recent ones. */
const manifests = new Map<string, Manifest>();
async function manifestFor(bucket: Bucket, userId: string, buildId: string): Promise<Manifest | null> {
  const key = `${userId}/${buildId}`;
  const cached = manifests.get(key);
  if (cached) return cached;
  const manifest = await readManifest(bucket, userId, buildId);
  if (!manifest) return null;
  if (manifests.size >= 64) manifests.delete(manifests.keys().next().value!);
  manifests.set(key, manifest);
  return manifest;
}

export async function serveSite(request: Request, env: SitesEnv, now: () => Date = () => new Date()): Promise<Response> {
  const url = new URL(request.url);
  // The Host header is what the visitor asked for (wrangler dev rewrites the URL's host).
  const host = parseHost(request.headers.get("Host") ?? url.host, env.SITES_DOMAIN);
  if (!host) return notice(404, "No portfolio here", "This address doesn't belong to a JAPS portfolio.", env);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { ...SECURITY, Allow: "GET, HEAD" } });
  }
  if (host.handle === "www" && !host.draftKey) return redirect(301, new URL(`${url.pathname}${url.search}`, env.APP_URL).toString());

  const store = new Store(env.DB, now);
  const site = await store.hostedSiteByHandle(host.handle);
  if (!site) {
    const retired = host.draftKey ? null : await store.retiredHandle(host.handle);
    // Temporary: once the quarantine ends, the name may belong to someone else.
    if (retired?.currentHandle) return redirect(302, `${siteUrl(retired.currentHandle, env)}${url.pathname}${url.search}`);
    if (retired) return notice(410, "This portfolio is gone", "Its owner removed it.", env);
    return notice(404, "No portfolio here", "Nobody has published a portfolio at this address.", env);
  }

  const draft = host.draftKey !== null;
  const buildId = draft ? (site.draftKey !== null && host.draftKey === site.draftKey ? site.draftBuild : null) : site.liveBuild;
  if (!buildId) {
    return draft
      ? notice(404, "No such draft", "This draft link has expired. A newer draft has its own link.", env)
      : notice(404, "Not published yet", "This portfolio hasn't been published yet.", env);
  }
  const manifest = await manifestFor(env.SITES, site.userId, buildId);
  if (!manifest) return notice(503, "Not available", "This portfolio can't be shown right now. Please try again later.", env);

  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return notice(400, "Bad address", "This address can't be read.", env);
  }
  const { files } = manifest;
  let file = files[path] ? path : path.endsWith("/") && files[`${path}index.html`] ? `${path}index.html` : null;
  // Pages are directories (Astro's default): /about -> /about/.
  if (!file && !path.endsWith("/") && files[`${path}/index.html`]) return redirect(301, `${url.pathname}/${url.search}`);
  let status = 200;
  if (!file) {
    if (!files["/404.html"]) return notice(404, "Page not found", "This portfolio has no such page.", env);
    file = "/404.html";
    status = 404;
  }

  const sha = files[file]!;
  const headers = new Headers({ ...SECURITY, "Content-Type": contentType(file), ETag: `"${sha}"`, "Cache-Control": cacheControl(file, draft) });
  if (draft) headers.set("X-Robots-Tag", "noindex");
  if (status === 200 && request.headers.get("If-None-Match") === `"${sha}"`) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { status, headers });
  const object = await env.SITES.get(fileKey(site.userId, sha));
  if (!object) return notice(503, "Not available", "This page can't be shown right now. Please try again later.", env);
  return new Response(object.body, { status, headers });
}
