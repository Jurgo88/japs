import { JapsConfig } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { toPagesSiteInput } from "../discovery/cloudflare.ts";
import { GitHubClient } from "../discovery/github.ts";
import { NetlifyClient } from "../discovery/netlify.ts";
import { buildProjects } from "../discovery/pair.ts";
import { extractFacts } from "./extract.ts";

type Route = { status?: number; body?: unknown; text?: string; headers?: Record<string, string> };

/** Routes match on URL substring; first match wins. Unknown URLs are 404. */
function fakeFetch(routes: [string, Route | (() => Route)][]) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const found = routes.find(([k]) => url.includes(k))?.[1];
    if (!found) return new Response("not found", { status: 404 });
    const r = typeof found === "function" ? found() : found;
    const body = r.text ?? JSON.stringify(r.body ?? null);
    return new Response(body, { status: r.status ?? 200, headers: r.headers });
  }) as typeof fetch;
  return { impl, calls };
}

const projectsFile = buildProjects(sites, repos, { now: NOW });
const commit = (date: string) => ({ commit: { author: { date } } });

const githubRoutes: [string, Route][] = [
  ["/repos/DevUser/AcmeShop/languages", { body: { TypeScript: 750, Vue: 200, CSS: 50 } }],
  [
    "/repos/DevUser/AcmeShop/commits?per_page=1&page=42",
    { body: [commit("2025-03-01T10:00:00Z")] },
  ],
  [
    "/repos/DevUser/AcmeShop/commits?per_page=1",
    {
      body: [commit("2026-10-09T16:00:00Z")],
      headers: { link: '<https://api.github.com/x?per_page=1&page=42>; rel="last"' },
    },
  ],
  ["/repos/DevUser/AcmeShop/pulls?state=all&per_page=1", { body: [{}], headers: { link: '<https://x?page=7>; rel="last"' } }],
  ["/repos/DevUser/AcmeShop/readme", { text: "# Acme Shop\n\nAn e-shop." }],
  ["/repos/DevUser/AcmeShop/contents/package.json", { text: JSON.stringify({ dependencies: { nuxt: "^4" } }) }],
  ["/repos/DevUser/tiny-lib/commits", { status: 409, body: { message: "Git Repository is empty." } }],
  ["/repos/", { body: [] }],
];

const netlifyRoutes: [string, Route][] = [
  ["/deploys/", { body: { title: "Ship it", committer: "DevUser", available_functions: [] } }],
];

const liveRoutes: [string, Route][] = [
  ["https://acme-shop.example", { text: '<html lang="en"><head><title>Acme</title></head></html>', headers: { "content-type": "text/html" } }],
];

const clients = (routes: [string, Route][]) => {
  const { impl, calls } = fakeFetch(routes);
  return {
    calls,
    options: {
      netlify: new NetlifyClient({ token: "n", fetch: impl }),
      github: new GitHubClient({ token: "g", fetch: impl }),
      fetch: impl,
      now: NOW,
    },
  };
};

describe("extractFacts", () => {
  it("collects repo, deploy and live-site facts for visible projects", async () => {
    const { options } = clients([...githubRoutes, ...netlifyRoutes, ...liveRoutes]);
    const { file } = await extractFacts(projectsFile, options);

    expect(file.projects.map((p) => p.key)).toEqual(
      projectsFile.projects.filter((p) => !p.hidden).map((p) => p.key),
    );

    const shop = file.projects.find((p) => p.key === "repo:devuser/acmeshop")!;
    expect(shop.repos[0]).toMatchObject({
      accessible: true,
      languages: { TypeScript: 75, Vue: 20, CSS: 5 },
      commits: { count: 42, first: "2025-03-01T10:00:00Z", last: "2026-10-09T16:00:00Z" },
      pullRequests: 7,
      readme: { excerpt: "Acme Shop\n\nAn e-shop.", headings: ["Acme Shop"] },
      packages: [{ path: "", dependencies: ["nuxt"] }],
    });
    expect(shop.sites[0]).toMatchObject({
      deploy: { commitMessage: "Ship it", committer: "DevUser" },
      live: { status: 200, title: "Acme", lang: "en" },
    });
    expect(shop.tech.map((t) => t.name)).toEqual(["Nuxt", "Vue", "TypeScript", "Netlify"]);
    expect(shop.hash).toMatch(/^[0-9a-f]{64}$/);
    // Netlify sites carry no provider field, so facts from before Cloudflare keep their hash.
    expect("provider" in shop.sites[0]!).toBe(false);
  });

  it("takes Cloudflare Pages sites without Netlify: live-site facts, Pages as hosting", async () => {
    const pages = toPagesSiteInput({
      id: "p1",
      name: "acme-shop",
      subdomain: "acme-shop.pages.dev",
      domains: ["acme-shop.pages.dev", "acme-shop.example"],
      source: { type: "github", config: { owner: "DevUser", repo_name: "AcmeShop" } },
      canonical_deployment: { id: "d1", created_on: "2026-10-01T10:00:00.000Z", latest_stage: { status: "success" } },
    });
    const file = buildProjects([pages], repos, { now: NOW });
    const { options, calls } = clients([...githubRoutes, ...liveRoutes]);
    const { file: facts } = await extractFacts(file, { ...options, netlify: null, keys: ["repo:devuser/acmeshop"] });

    const shop = facts.projects[0]!;
    expect(shop.sites[0]).toMatchObject({ id: "cf:p1", provider: "cloudflare", deploy: null, live: { title: "Acme" } });
    expect(shop.tech.map((t) => t.name)).toContain("Cloudflare Pages");
    expect(calls.some((u) => u.includes("netlify"))).toBe(false);
  });

  it("treats an empty repo as zero commits and records a live site's error status", async () => {
    const { options } = clients([...githubRoutes, ...netlifyRoutes]);
    const { file } = await extractFacts(projectsFile, { ...options, keys: ["repo:devuser/tiny-lib", "site:s-upload"] });
    const byKey = (key: string) => file.projects.find((p) => p.key === key);
    expect(byKey("repo:devuser/tiny-lib")?.repos[0]?.commits).toEqual({ count: 0, first: null, last: null });
    expect(byKey("site:s-upload")?.sites[0]?.live).toMatchObject({ status: 404, title: null });
  });

  it("turns network failures into warnings and keeps the rest", async () => {
    const { options } = clients([...netlifyRoutes]);
    const failing = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as typeof fetch;
    const { file } = await extractFacts(projectsFile, { ...options, github: null, fetch: failing, keys: ["site:s-upload"] });
    expect(file.warnings).toEqual(["herb-shop.netlify.app: live site: getaddrinfo ENOTFOUND"]);
    expect(file.projects[0]?.sites[0]).toMatchObject({ live: null, deploy: { commitMessage: "Ship it" } });
  });

  it("reuses repo facts while pushedAt is unchanged", async () => {
    const first = clients([...githubRoutes, ...netlifyRoutes]);
    const { file: previous } = await extractFacts(projectsFile, { ...first.options, keys: ["repo:devuser/acmeshop"] });

    const second = clients([...githubRoutes, ...netlifyRoutes]);
    const { file, reusedRepos } = await extractFacts(projectsFile, {
      ...second.options,
      previous,
      keys: ["repo:devuser/acmeshop"],
    });
    expect(reusedRepos).toBe(1);
    expect(second.calls.some((c) => c.includes("api.github.com"))).toBe(false);
    expect(file.projects[0]?.hash).toBe(previous.projects[0]?.hash);
  });

  it("without a GitHub client, repos are identity-only and nothing hits GitHub", async () => {
    const { options, calls } = clients([...netlifyRoutes]);
    const { file } = await extractFacts(projectsFile, { ...options, github: null, keys: ["repo:devuser/acmeshop"] });
    expect(file.projects[0]?.repos[0]).toMatchObject({ accessible: false, commits: null, packages: [] });
    expect(calls.some((c) => c.includes("api.github.com"))).toBe(false);
  });

  it("warns about unknown keys", async () => {
    const { options } = clients([]);
    const { file } = await extractFacts(projectsFile, { ...options, keys: ["repo:devuser/nope"] });
    expect(file.warnings).toEqual(['project "repo:devuser/nope" not found']);
  });

  it("keeps facts of projects not extracted this run", async () => {
    const first = clients([...githubRoutes, ...netlifyRoutes]);
    const { file: previous } = await extractFacts(projectsFile, { ...first.options, keys: ["repo:devuser/acmeshop"] });
    const second = clients([...githubRoutes, ...netlifyRoutes]);
    const { file } = await extractFacts(projectsFile, { ...second.options, previous, keys: ["repo:devuser/tiny-lib"] });
    expect(file.projects.map((p) => p.key).sort()).toEqual(["repo:devuser/acmeshop", "repo:devuser/tiny-lib"]);
  });

  it("follows the current config's visibility instead of projects.json", async () => {
    const { options } = clients([...githubRoutes, ...netlifyRoutes]);
    const config = JapsConfig.parse({
      version: 1,
      projects: { "repo:devuser/client-app": { hidden: false }, "repo:devuser/acmeshop": { hidden: true } },
    });
    const { file } = await extractFacts(projectsFile, { ...options, config });
    const keys = file.projects.map((p) => p.key);
    expect(keys).toContain("repo:devuser/client-app");
    expect(keys).not.toContain("repo:devuser/acmeshop");
  });
});
