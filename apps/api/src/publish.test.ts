import { buildProjects, sha1Hex } from "@japs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../../../packages/core/src/__fixtures__/phase0.ts";
import { createApp } from "./app.ts";
import { base64url, encrypt } from "./crypto.ts";
import { Store, type UserStore } from "./db.ts";
import type { Env } from "./env.ts";
import { resetJwksCache } from "./oidc.ts";
import type { BuildInput } from "./publish.ts";
import { fakeBucket } from "./testing/bucket.ts";
import { fakeIssuer } from "./testing/oidc.ts";
import { testDb } from "./testing/sqlite.ts";

const APP_URL = "https://japs.example.dev";
const t = (en: string) => ({ en });

let env: Env;
let objects: Map<string, Uint8Array>;
let issuer: Awaited<ReturnType<typeof fakeIssuer>>;
let calls: { method: string; url: string; body?: unknown }[];
let deployState: string;

/** Fake GitHub (sign-in, dispatch), Netlify (sites, deploys) and the OIDC issuer. */
const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
  calls.push({ method, url, body });
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const jwks = issuer.handle(url);
  if (jwks) return jwks;
  if (url === "https://github.com/login/oauth/access_token") return json({ access_token: "gho_jane", expires_in: 28800 });
  if (url === "https://api.github.com/user") return json({ id: 1, login: "janedoe", name: "Jane Doe", avatar_url: null });
  if (url === "https://api.github.com/repos/jane/japs/actions/workflows/publish.yml/dispatches") return new Response(null, { status: 204 });
  // Cloudflare Pages (ADR 0012).
  const cf = (result: unknown) => json({ success: true, errors: [], result, result_info: { total_pages: 1 } });
  const CF = "https://api.cloudflare.com/client/v4";
  if (url.startsWith(`${CF}/accounts?`)) return cf([{ id: "acc", name: "Jane" }]);
  if (url === `${CF}/accounts/acc/pages/projects` && method === "POST") return cf({ id: "pg1", name: body.name, subdomain: `${body.name}.pages.dev` });
  if (url === `${CF}/accounts/acc/pages/projects/jane-doe-portfolio/upload-token`) return cf({ jwt: "upload-jwt" });
  if (url === `${CF}/pages/assets/check-missing`) return cf(body.hashes.slice(0, 1));
  if (url === `${CF}/pages/assets/upload` || url === `${CF}/pages/assets/upsert-hashes`) return cf(null);
  if (url === `${CF}/accounts/acc/pages/projects/jane-doe-portfolio/deployments` && method === "POST") return cf({ id: "cfdep1" });
  if (url === `${CF}/accounts/acc/pages/projects/jane-doe-portfolio/deployments/cfdep1`) {
    return cf({ id: "cfdep1", url: "https://abc.jane-doe-portfolio.pages.dev", latest_stage: { name: "deploy", status: deployState === "ready" ? "success" : "active" } });
  }
  if (url === "https://api.netlify.com/api/v1/sites" && method === "POST") {
    return json({ id: "site-1", name: body.name, url: `http://${body.name}.netlify.app`, ssl_url: `https://${body.name}.netlify.app`, admin_url: null });
  }
  if (url === "https://api.netlify.com/api/v1/sites/site-1/deploys") return json({ id: "dep-1", state: "uploading", required: [Object.values(body.files)[0]] });
  if (url.startsWith("https://api.netlify.com/api/v1/deploys/dep-1/files/")) return json({});
  if (url === "https://api.netlify.com/api/v1/deploys/dep-1") return json({ id: "dep-1", state: deployState, ssl_url: "https://jane-doe-portfolio.netlify.app" });
  return json({ message: "not found" }, 404);
}) as typeof globalThis.fetch;

let user: UserStore;
let cookie = "";
const app = () => createApp({ fetch });
const request = (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  return app().request(path, { ...init, headers }, env);
};
const json = async (res: Response | Promise<Response>): Promise<any> => (await res).json();
const publish = (draft = false) =>
  request("/api/publish", { method: "POST", headers: { Origin: APP_URL, "Content-Type": "application/json" }, body: JSON.stringify({ draft }) });
const builder = async (path: string, init: RequestInit = {}, claims: Record<string, unknown> = {}) =>
  app().request(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${await issuer.token(claims)}` } }, env);

beforeEach(async () => {
  resetJwksCache();
  issuer = await fakeIssuer();
  calls = [];
  deployState = "processing";
  const shots = fakeBucket();
  objects = shots.objects;
  env = {
    DB: testDb(),
    APP_URL,
    GITHUB_CLIENT_ID: "gh-client",
    GITHUB_CLIENT_SECRET: "gh-secret",
    NETLIFY_CLIENT_ID: "nf-client",
    NETLIFY_CLIENT_SECRET: "nf-secret",
    SESSION_SECRET: "session-secret",
    ENCRYPTION_KEY: base64url(new Uint8Array(32).fill(3)),
    SHOTS: shots.bucket,
    GITHUB_BUILD_TOKEN: "github_pat_build",
    JAPS_BUILD_REPO: "jane/japs",
  };

  // Sign in through the real routes, then fill the account like an import + generation would.
  const start = await app().request("/auth/github/login", {}, env);
  const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
  const stateCookie = start.headers.getSetCookie()[0]!.split(";")[0]!;
  const done = await app().request(`/auth/github/callback?code=c&state=${state}`, { headers: { Cookie: stateCookie } }, env);
  cookie = done.headers.getSetCookie().find((c) => c.startsWith("__Host-japs_session="))!.split(";")[0]!;

  const store = new Store(env.DB);
  user = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: "Jane Doe", avatarUrl: null })).id);
  await user.setConnection({ provider: "netlify", accountLogin: "jane", accessToken: await encrypt("nf_token", env.ENCRYPTION_KEY), refreshToken: null, expiresAt: null, meta: null });
  await user.putDocument("projects", buildProjects(sites, repos, { now: NOW }));
  await user.putDocument("config", { version: 1, profile: { name: "Jane Doe", headline: t("Developer"), bio: t("Hi.") } });
  await user.putProjectDoc("repo:devuser/acmeshop", "analysis", {
    key: "repo:devuser/acmeshop",
    factsHash: "f".repeat(64),
    provider: "fake",
    model: "m",
    generatedAt: "2026-10-13T10:00:00Z",
    anonymized: false,
    copy: { title: t("Acme Shop"), summary: t("A shop."), description: t("Sells things."), role: t("Developer"), tags: ["Nuxt"] },
    usage: { input: 1, output: 1 },
    dropped: [],
  });
});

describe("publishing from the cloud", () => {
  it("prepares the build, starts the workflow, and refuses a second one while it runs", async () => {
    const res = await publish();
    expect(res.status).toBe(202);
    const { publish: status } = await json(res);
    expect(status).toMatchObject({ status: "building", draft: false, siteUrl: "https://jane-doe-portfolio.netlify.app" });

    const dispatch = calls.find((c) => c.url.endsWith("/dispatches"))!;
    expect(dispatch.body).toEqual({ ref: "main", inputs: { build: status.id, api: APP_URL } });
    // The run gets an id only; the portfolio waits in R2 under the user's prefix.
    const [key] = [...objects.keys()];
    expect(key).toMatch(new RegExp(`/builds/${status.id}\\.json$`));
    const input = JSON.parse(new TextDecoder().decode(objects.get(key!))) as BuildInput;
    expect(input.portfolio.projects.map((p) => p.slug)).toContain("acme-shop");
    expect(await user.getDocument("publish")).toMatchObject({ netlify: { siteId: "site-1" }, cloudflare: null });

    expect((await publish()).status).toBe(409);
  });

  it("lets only the publish workflow run that claimed the build read it and deploy it", async () => {
    const { publish: status } = await json(publish());
    const base = `/builder/builds/${status.id}`;

    expect((await app().request(`${base}/input`, {}, env)).status).toBe(403);
    expect((await builder(`${base}/input`, {}, { repository: "mallory/japs" })).status).toBe(403);
    const input = await builder(`${base}/input`);
    expect(input.status).toBe(200);
    // A second run can't take over the build.
    expect((await builder(`${base}/input`, {}, { run_id: "2002" })).status).toBe(403);

    const html = new Uint8Array(new TextEncoder().encode("<h1>Jane</h1>"));
    const sha = await sha1Hex(html);
    const deploy = await builder(`${base}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: { "/index.html": sha } }) });
    expect(await json(deploy)).toEqual({ required: [sha] });

    // Only the required content, matching its digest, goes on to Netlify.
    expect((await builder(`${base}/files/other.html`, { method: "PUT", body: html })).status).toBe(400);
    expect((await builder(`${base}/files/index.html`, { method: "PUT", body: new TextEncoder().encode("<h1>Evil</h1>") })).status).toBe(400);
    expect((await builder(`${base}/files/index.html`, { method: "PUT", body: html })).status).toBe(200);
    expect(calls.filter((c) => c.url.includes("/deploys/dep-1/files/")).map((c) => c.url)).toEqual(["https://api.netlify.com/api/v1/deploys/dep-1/files/index.html"]);

    expect((await builder(`${base}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) })).status).toBe(200);
    expect(objects.size).toBe(0);

    // The editor's polling asks Netlify until the site is live.
    expect((await json(request("/api/publish/latest"))).publish.status).toBe("deploying");
    deployState = "ready";
    const live = (await json(request("/api/publish/latest"))).publish;
    expect(live).toMatchObject({ status: "live", url: "https://jane-doe-portfolio.netlify.app" });
    expect(((await user.getDocument("publish")) as { netlify: { lastDeploy: { id: string } } }).netlify.lastDeploy.id).toBe("dep-1");
  });

  it("reports a failed build and paces publishes", async () => {
    const { publish: status } = await json(publish());
    await builder(`/builder/builds/${status.id}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: false, message: "The theme build failed." }) });
    expect((await json(request("/api/publish/latest"))).publish).toMatchObject({ status: "failed", message: "The theme build failed." });
    // Netlify allows 3 deploys a minute: half a minute between publishes.
    expect((await publish()).status).toBe(429);
  });

  it("is not available without the build token", async () => {
    env.GITHUB_BUILD_TOKEN = undefined;
    expect((await publish()).status).toBe(501);
  });
});

describe("publishing to Cloudflare Pages from the cloud", () => {
  beforeEach(async () => {
    await user.setConnection({ provider: "cloudflare", accountLogin: "jane", accessToken: await encrypt("cf_token", env.ENCRYPTION_KEY), refreshToken: null, expiresAt: null, meta: null });
    await user.putDocument("config", { version: 1, publish: { target: "cloudflare" }, profile: { name: "Jane Doe", headline: t("Developer"), bio: t("Hi.") } });
  });

  it("creates the user's Pages project, uploads what's missing with the user's token, and goes live", async () => {
    const { publish: status } = await json(publish());
    expect(status).toMatchObject({ target: "cloudflare", siteUrl: "https://jane-doe-portfolio.pages.dev" });
    const input = JSON.parse(new TextDecoder().decode([...objects.values()][0]!)) as BuildInput;
    expect(input.target).toBe("cloudflare");

    const base = `/builder/builds/${status.id}`;
    const files = { "/index.html": "a".repeat(32), "/about.html": "b".repeat(32) };
    // Netlify-style SHA-1 digests are refused for Pages.
    expect((await builder(`${base}/deploy`, { method: "POST", body: JSON.stringify({ files: { "/index.html": "c".repeat(40) } }) })).status).toBe(400);
    const deploy = await builder(`${base}/deploy`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files }) });
    expect(await json(deploy)).toEqual({ required: ["a".repeat(32)] });

    expect((await builder(`${base}/files/about.html`, { method: "PUT", body: new Uint8Array([1]) })).status).toBe(400);
    expect((await builder(`${base}/files/index.html`, { method: "PUT", body: new TextEncoder().encode("<h1>Jane</h1>") })).status).toBe(200);
    const upload = calls.find((c) => c.url.endsWith("/pages/assets/upload"))!;
    expect(upload.body).toEqual([{ key: "a".repeat(32), value: btoa("<h1>Jane</h1>"), metadata: { contentType: "text/html" }, base64: true }]);

    expect((await builder(`${base}/finish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) })).status).toBe(200);
    const created = calls.find((c) => c.url.endsWith("/jane-doe-portfolio/deployments") && c.method === "POST")!;
    expect(JSON.parse(String((created.body as FormData).get("manifest")))).toEqual(files);
    expect((created.body as FormData).get("branch")).toBe("main");
    // The user's own token stays in the Worker: every Cloudflare call is ours.
    expect(calls.filter((c) => c.url.includes("api.cloudflare.com")).length).toBeGreaterThan(0);

    deployState = "ready";
    expect((await json(request("/api/publish/latest"))).publish).toMatchObject({ status: "live", url: "https://jane-doe-portfolio.pages.dev" });
    expect(await user.getDocument("publish")).toMatchObject({ cloudflare: { projectName: "jane-doe-portfolio", lastDeploy: { id: "cfdep1" } } });
  });

  it("needs a Cloudflare connection to publish there", async () => {
    await user.deleteConnection("cloudflare");
    const res = await publish();
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Connect Cloudflare first.");
  });
});
