import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { publishWorkspace } from "./publish.ts";
import { resolveWorkspace, type Workspace } from "./workspace.ts";

let dir: string;
let ws: Workspace;
let dist: string;

const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value));
const t = (en: string) => ({ en });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "japs-publish-"));
  ws = resolveWorkspace(dir);
  dist = join(dir, "dist");
  await mkdir(join(dist, "projects", "shop"), { recursive: true });
  await writeFile(join(dist, "index.html"), "<h1>Jane</h1>");
  await writeFile(join(dist, "projects", "shop", "index.html"), "<h1>Shop</h1>");

  await json(ws.config, { version: 1, profile: { name: "Jane Doe", headline: t("Dev"), bio: t("Hi") } });
  await json(ws.projects, {
    version: 1,
    generatedAt: "2026-10-14T10:00:00Z",
    account: { github: null },
    stats: { sites: 1, repos: 0, projects: 1, pairedSites: 0, hiddenProjects: 0 },
    repos: [],
    sites: [
      {
        id: "s1", provider: "netlify", name: "shop", domain: "shop.example", url: "https://shop.example",
        hasCustomDomain: true, framework: null, screenshotUrl: null, lastDeployAt: "2026-10-01T00:00:00Z",
        deployId: "d0", deployContext: "production", committer: null, repoId: null, matchSource: "none",
      },
    ],
    projects: [
      {
        key: "site:s1", slug: "shop", title: "Shop", repoIds: [], siteIds: ["s1"], lastActivityAt: "2026-10-01T00:00:00Z",
        private: false, hidden: false, hiddenReasons: [], clientSignals: [],
      },
    ],
    warnings: [],
  });
  await json(ws.analysis, {
    version: 1,
    generatedAt: "2026-10-14T10:00:00Z",
    locales: ["en"],
    projects: [
      {
        key: "site:s1", factsHash: "x", provider: "fake", model: "m", generatedAt: "2026-10-14T10:00:00Z", anonymized: false,
        copy: { title: t("Shop"), summary: t("A shop."), description: t("Sells things."), role: t("Development"), tags: [] },
        usage: { input: 1, output: 1 }, dropped: [],
      },
    ],
    warnings: [],
  });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Call = { method: string; path: string; body: unknown };

function fakeNetlify(options: { existing?: string[]; takenNames?: string[] } = {}) {
  const calls: Call[] = [];
  const sites = new Set(options.existing ?? []);
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace("https://api.netlify.com/api/v1", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    calls.push({ method, path, body });
    const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

    if (method === "POST" && path === "/sites") {
      const name = (body as { name: string }).name;
      if (options.takenNames?.includes(name)) {
        return new Response(JSON.stringify({ message: "subdomain must be unique" }), { status: 422, statusText: "Unprocessable" });
      }
      sites.add("new-site");
      return ok({ id: "new-site", name, url: `http://${name}.netlify.app`, ssl_url: `https://${name}.netlify.app`, admin_url: "https://app.netlify.com/sites/x" });
    }
    const site = /^\/sites\/([^/]+)$/.exec(path)?.[1];
    if (method === "GET" && site) {
      return sites.has(site) ? ok({ id: site, name: "jane-doe-portfolio", url: "https://jane-doe-portfolio.netlify.app" }) : new Response("{}", { status: 404, statusText: "Not Found" });
    }
    if (method === "POST" && path.endsWith("/deploys")) {
      return ok({ id: "dep1", state: "ready", required: Object.values((body as { files: Record<string, string> }).files), ssl_url: "https://jane-doe-portfolio.netlify.app" });
    }
    if (method === "PUT") return ok({});
    return new Response("{}", { status: 404, statusText: "Not Found" });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const env = { NETLIFY_TOKEN: "t" };

describe("publishWorkspace", () => {
  it("creates a site on the first run, builds for its URL, deploys and remembers it", async () => {
    const { fetch, calls } = fakeNetlify();
    let builtFor: [string, string, string] | null = null;
    const result = await publishWorkspace(ws, {
      env,
      fetch,
      buildTheme: async (portfolioDir, siteUrl, theme) => {
        builtFor = [portfolioDir, siteUrl, theme];
        return dist;
      },
    });

    expect(calls.find((c) => c.path === "/sites")?.body).toEqual({ name: "jane-doe-portfolio" });
    expect(builtFor).toEqual([ws.out, "https://jane-doe-portfolio.netlify.app", "default"]);
    const deploy = calls.find((c) => c.path === "/sites/new-site/deploys")!;
    expect(Object.keys((deploy.body as { files: object }).files).sort()).toEqual(["/index.html", "/projects/shop/index.html"]);
    expect(result).toMatchObject({ created: true, projects: 1, deploy: { uploaded: 2, total: 2 } });

    const state = JSON.parse(await readFile(ws.publish, "utf8"));
    expect(state).toMatchObject({ siteId: "new-site", siteName: "jane-doe-portfolio", lastDeploy: { id: "dep1", draft: false } });
  });

  it("reuses the remembered site instead of creating another", async () => {
    await json(ws.publish, { version: 1, siteId: "kept", siteName: "jane-doe-portfolio", url: "https://jane-doe-portfolio.netlify.app", adminUrl: null, lastDeploy: null });
    const { fetch, calls } = fakeNetlify({ existing: ["kept"] });
    const result = await publishWorkspace(ws, { env, fetch, draft: true, buildTheme: async () => dist });
    expect(calls.some((c) => c.method === "POST" && c.path === "/sites")).toBe(false);
    expect(calls.find((c) => c.path === "/sites/kept/deploys")?.body).toMatchObject({ draft: true });
    expect(result.created).toBe(false);
  });

  it("explains a deleted site and a taken name", async () => {
    await json(ws.publish, { version: 1, siteId: "gone", siteName: "old", url: "https://old.netlify.app", adminUrl: null, lastDeploy: null });
    await expect(publishWorkspace(ws, { env, fetch: fakeNetlify().fetch, buildTheme: async () => dist })).rejects.toThrow(
      'The site "old" (gone) no longer exists on Netlify',
    );

    await rm(ws.publish);
    const taken = fakeNetlify({ takenNames: ["jane-doe-portfolio"] });
    await expect(publishWorkspace(ws, { env, fetch: taken.fetch, buildTheme: async () => dist })).rejects.toThrow(
      'The site name "jane-doe-portfolio" is taken on Netlify',
    );
  });

  it("refuses an empty portfolio before touching Netlify", async () => {
    await json(ws.config, {
      version: 1,
      profile: { name: "Jane Doe", headline: t("Dev"), bio: t("Hi") },
      projects: { "site:s1": { hidden: true } },
    });
    const { fetch, calls } = fakeNetlify();
    await expect(publishWorkspace(ws, { env, fetch, buildTheme: async () => dist })).rejects.toThrow("no projects to publish");
    expect(calls).toEqual([]);
  });
});
