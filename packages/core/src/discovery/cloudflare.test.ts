import { describe, expect, it } from "vitest";
import { CloudflareClient, type RawPagesProject, toPagesSiteInput, toWorkerSiteInput } from "./cloudflare.ts";
import { buildProjects } from "./pair.ts";
import type { RepoInput, SiteInput } from "./types.ts";

const NOW = new Date("2026-10-16T12:00:00Z");

const deployment = (extra: Partial<NonNullable<RawPagesProject["canonical_deployment"]>> = {}) => ({
  id: "dep-1",
  url: "https://abc123.shop-demo.pages.dev",
  environment: "production",
  created_on: "2026-10-01T10:00:00.000Z",
  deployment_trigger: { metadata: { branch: "main", commit_hash: "a1b2c3" } },
  latest_stage: { status: "success" },
  ...extra,
});

const project = (extra: Partial<RawPagesProject> = {}): RawPagesProject => ({
  id: "0b1c2d3e",
  name: "shop-demo",
  subdomain: "shop-demo.pages.dev",
  domains: ["shop-demo.pages.dev", "shop.example.dev"],
  source: { type: "github", config: { owner: "DevUser", repo_name: "ShopDemo" } },
  canonical_deployment: deployment(),
  latest_deployment: deployment(),
  ...extra,
});

const repo = (fullName: string, extra: Partial<RepoInput> = {}): RepoInput => ({
  fullName,
  url: `https://github.com/${fullName}`,
  ownerType: "user",
  private: false,
  fork: false,
  archived: false,
  empty: false,
  homepage: null,
  language: "TypeScript",
  topics: [],
  description: null,
  pushedAt: "2026-10-01T00:00:00Z",
  ...extra,
});

describe("Cloudflare Pages projects as sites", () => {
  it("links a GitHub-connected project to its repo, with the custom domain and live commit", () => {
    expect(toPagesSiteInput(project())).toEqual({
      id: "cf:0b1c2d3e",
      provider: "cloudflare",
      name: "shop-demo",
      url: "https://shop-demo.pages.dev",
      customDomain: "shop.example.dev",
      repoUrl: "https://github.com/DevUser/ShopDemo",
      deploy: {
        id: "dep-1",
        commitUrl: "https://github.com/DevUser/ShopDemo/commit/a1b2c3",
        reviewUrl: null,
        framework: null,
        screenshotUrl: null,
        context: "production",
        publishedAt: "2026-10-01T10:00:00.000Z",
        committer: null,
      },
    });
  });

  it("has no repo for direct uploads or GitLab, and no deploy when nothing is live", () => {
    expect(toPagesSiteInput(project({ source: null })).repoUrl).toBeNull();
    expect(toPagesSiteInput(project({ source: { type: "gitlab", config: { owner: "dev", repo_name: "x" } } })).repoUrl).toBeNull();
    expect(toPagesSiteInput(project({ canonical_deployment: null, latest_deployment: null })).deploy).toBeNull();
    // A failed build isn't a deploy.
    expect(toPagesSiteInput(project({ canonical_deployment: deployment({ latest_stage: { status: "failure" } }) })).deploy).toBeNull();
    // Only previews: shown as preview-only, like Netlify deploy previews.
    expect(toPagesSiteInput(project({ canonical_deployment: null, latest_deployment: deployment({ environment: "preview" }) })).deploy?.context).toBe(
      "deploy-preview",
    );
  });

  it("pairs Pages sites like Netlify ones, and keeps both on one project when a repo is on both", () => {
    const netlify: SiteInput = {
      id: "nf-1",
      name: "shop-demo",
      url: "https://shop-demo.netlify.app",
      customDomain: null,
      repoUrl: "https://github.com/devuser/shopdemo",
      deploy: { id: "d1", commitUrl: null, reviewUrl: null, framework: null, screenshotUrl: null, context: "production", publishedAt: "2026-09-01T00:00:00Z", committer: null },
    };
    const pages = toPagesSiteInput(project());
    const upload = toPagesSiteInput(project({ id: "9f8e", name: "landing", subdomain: "landing.pages.dev", domains: ["landing.pages.dev"], source: null }));
    const file = buildProjects([netlify, pages, upload], [repo("DevUser/ShopDemo")], { now: NOW });

    const shop = file.projects.find((p) => p.key === "repo:devuser/shopdemo")!;
    expect(shop.siteIds.sort()).toEqual(["cf:0b1c2d3e", "nf-1"]);
    expect(file.sites.find((s) => s.id === "cf:0b1c2d3e")).toMatchObject({ provider: "cloudflare", domain: "shop.example.dev", matchSource: "repo_url" });
    // Without a repo the key names the site; the prefix keeps it apart from Netlify ids.
    expect(file.projects.find((p) => p.key === "site:cf:9f8e")).toBeDefined();
  });
});

describe("CloudflareClient", () => {
  it("lists Pages projects of every account, page by page", async () => {
    const calls: string[] = [];
    const ok = (result: unknown, info?: unknown) => new Response(JSON.stringify({ success: true, errors: [], result, result_info: info }), { status: 200 });
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url.replace("https://api.cloudflare.com/client/v4", ""));
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer cf-token");
      if (url.includes("/accounts?")) return ok([{ id: "acc-1", name: "Dev" }, { id: "acc-2", name: "Team" }], { total_pages: 1 });
      if (url.includes("/accounts/acc-1/pages/projects?page=1")) return ok([project()], { total_pages: 2 });
      if (url.includes("/accounts/acc-1/pages/projects?page=2")) return ok([project({ id: "p2", name: "blog", domains: [] })], { total_pages: 2 });
      if (url.includes("/accounts/acc-2/pages/projects")) return ok([], { total_pages: 0 });
      // A Pages-only token can't read Workers: none, not an error.
      if (url.includes("/workers/")) return new Response(JSON.stringify({ success: false, errors: [{ message: "forbidden" }] }), { status: 403 });
      return new Response(JSON.stringify({ success: false, errors: [{ message: "nope" }] }), { status: 404 });
    }) as typeof globalThis.fetch;

    const sites = await new CloudflareClient({ token: "cf-token", fetch }).listSiteInputs();
    expect(sites.map((s) => s.id)).toEqual(["cf:0b1c2d3e", "cf:p2"]);
    expect(calls).toContain("/accounts/acc-1/pages/projects?page=2&per_page=10");
  });

  it("reports Cloudflare's error message", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 })) as typeof globalThis.fetch;
    await expect(new CloudflareClient({ token: "bad", fetch }).listAccounts()).rejects.toThrow("Cloudflare GET /accounts failed: 403 Authentication error");
  });
});

describe("Cloudflare Workers as sites", () => {
  const script = (id: string, extra = {}) => ({ id, modified_on: "2026-10-10T08:00:00Z", deployment_id: `dep-${id}`, routes: null, ...extra });

  it("takes a Worker with a custom domain, a zone route or workers.dev, and skips backends", () => {
    expect(toWorkerSiteInput(script("app"), ["app.example.dev"], null)).toMatchObject({
      id: "cf:worker:app",
      provider: "cloudflare",
      url: "https://app.example.dev",
      customDomain: "app.example.dev",
      repoUrl: null,
      deploy: { id: "dep-app", context: "production", publishedAt: "2026-10-10T08:00:00Z" },
    });
    expect(toWorkerSiteInput(script("blog", { routes: [{ pattern: "blog.example.dev/*" }] }), [], null)?.url).toBe("https://blog.example.dev");
    expect(toWorkerSiteInput(script("api", { routes: [{ pattern: "*.example.dev/*" }] }), [], null)).toBeNull();
    expect(toWorkerSiteInput(script("demo"), [], "demo.dev-user.workers.dev")).toMatchObject({ url: "https://demo.dev-user.workers.dev", customDomain: null });
    expect(toWorkerSiteInput(script("queue-consumer"), [], null)).toBeNull();
  });

  it("lists public Workers next to Pages, and pairs them by the repo's homepage", async () => {
    const ok = (result: unknown) => new Response(JSON.stringify({ success: true, errors: [], result, result_info: { total_pages: 1 } }), { status: 200 });
    const calls: string[] = [];
    const fetch = (async (input: string | URL | Request) => {
      const url = String(input).replace("https://api.cloudflare.com/client/v4", "");
      calls.push(url);
      if (url.startsWith("/accounts?")) return ok([{ id: "acc", name: "Dev" }]);
      if (url.startsWith("/accounts/acc/pages/projects")) return ok([]);
      if (url === "/accounts/acc/workers/scripts") return ok([script("portfolio-app"), script("demo"), script("cron-job")]);
      if (url === "/accounts/acc/workers/domains") {
        // As the real API does: errors: null on success.
        return new Response(JSON.stringify({ success: true, errors: null, result: [
          { hostname: "app.example.dev", service: "portfolio-app", enabled: true, environment: "production" },
          { hostname: "staging.example.dev", service: "demo", enabled: true, environment: "staging" },
        ] }), { status: 200 });
      }
      if (url === "/accounts/acc/workers/subdomain") return ok({ subdomain: "dev-user" });
      if (url === "/accounts/acc/workers/scripts/demo/subdomain") return ok({ enabled: true });
      if (url === "/accounts/acc/workers/scripts/cron-job/subdomain") return ok({ enabled: false });
      return new Response("{}", { status: 404 });
    }) as typeof globalThis.fetch;

    const sites = await new CloudflareClient({ token: "t", fetch }).listSiteInputs();
    expect(sites.map((s) => [s.id, s.url])).toEqual([
      ["cf:worker:portfolio-app", "https://app.example.dev"],
      ["cf:worker:demo", "https://demo.dev-user.workers.dev"],
    ]);
    // A Worker with a custom domain needs no workers.dev check.
    expect(calls).not.toContain("/accounts/acc/workers/scripts/portfolio-app/subdomain");

    const file = buildProjects(sites, [repo("DevUser/PortfolioApp", { homepage: "https://app.example.dev" })], { now: NOW });
    expect(file.projects.find((p) => p.key === "repo:devuser/portfolioapp")?.siteIds).toEqual(["cf:worker:portfolio-app"]);
    expect(file.sites.find((s) => s.id === "cf:worker:portfolio-app")?.matchSource).toBe("homepage");
  });
});
