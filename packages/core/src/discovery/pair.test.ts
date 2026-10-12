import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects, resolveSiteRepo } from "./pair.ts";

const result = buildProjects(sites, repos, { now: NOW });
const projectBySite = (siteId: string) => result.projects.find((p) => p.siteIds.includes(siteId));
const projectByRepo = (repoId: string) => result.projects.find((p) => p.repoIds.includes(repoId));
const siteById = (id: string) => result.sites.find((s) => s.id === id);

describe("resolveSiteRepo priority", () => {
  it("prefers repo_url over commit_url over review_url", () => {
    const base = {
      id: "x",
      name: "x",
      url: "https://x.netlify.app",
      customDomain: null,
      deploy: {
        commitUrl: "https://github.com/a/from-commit/commit/1",
        reviewUrl: "https://github.com/a/from-review/pull/1",
        framework: null,
        screenshotUrl: null,
        context: "production" as const,
        publishedAt: null,
      },
    };
    expect(resolveSiteRepo({ ...base, repoUrl: "https://github.com/a/from-repo-url" })).toEqual({
      repoId: "a/from-repo-url",
      matchSource: "repo_url",
    });
    expect(resolveSiteRepo({ ...base, repoUrl: null })).toEqual({
      repoId: "a/from-commit",
      matchSource: "commit_url",
    });
    expect(
      resolveSiteRepo({ ...base, repoUrl: null, deploy: { ...base.deploy, commitUrl: null } }),
    ).toEqual({ repoId: "a/from-review", matchSource: "review_url" });
  });
});

describe("buildProjects on Phase 0 shapes", () => {
  it("pairs sites through deploy metadata, not names", () => {
    expect(siteById("s-kitten")).toMatchObject({ repoId: "devuser/widget", matchSource: "commit_url" });
    expect(siteById("s-parking")).toMatchObject({ repoId: "devuser/parking-lottery", matchSource: "repo_url" });
    expect(siteById("s-preview")).toMatchObject({ repoId: "devuser/shopmaster", matchSource: "review_url" });
  });

  it("normalizes repo casing between Netlify and GitHub", () => {
    const project = projectBySite("s-shop");
    expect(project?.repoIds).toEqual(["devuser/acmeshop"]);
    expect(project?.title).toBe("AcmeShop");
  });

  it("groups two sites deployed from one repo into one project", () => {
    const project = projectByRepo("devuser/portfolio-v2");
    expect(project?.siteIds.sort()).toEqual(["s-portfolio-a", "s-portfolio-b"]);
    expect(result.projects.filter((p) => p.repoIds.includes("devuser/portfolio-v2"))).toHaveLength(1);
  });

  it("matches a site from the repo side via homepage", () => {
    expect(siteById("s-homepage")).toMatchObject({ repoId: "devuser/ehm", matchSource: "homepage" });
  });

  it("keeps a site without git as its own visible project", () => {
    const project = projectBySite("s-upload");
    expect(project?.repoIds).toEqual([]);
    expect(project?.hidden).toBe(false);
  });

  it("keeps a repo without a site as its own project", () => {
    const project = projectByRepo("devuser/tiny-lib");
    expect(project?.siteIds).toEqual([]);
    expect(project?.hidden).toBe(false);
  });

  it("uses the custom domain for the site url", () => {
    expect(siteById("s-shop")).toMatchObject({ domain: "acme-shop.example", url: "https://acme-shop.example", hasCustomDomain: true });
  });

  it("marks private repos as private and hides them by default", () => {
    expect(projectBySite("s-client")).toMatchObject({ private: true, hidden: true, hiddenReasons: ["private"] });
    expect(projectBySite("s-shop")).toMatchObject({ private: false, hidden: false });
  });

  it("keys projects by repo, or by site when there is no repo", () => {
    expect(projectBySite("s-portfolio-a")?.key).toBe("repo:devuser/portfolio-v2");
    expect(projectBySite("s-upload")?.key).toBe("site:s-upload");
    expect(projectByRepo("devuser/tiny-lib")?.key).toBe("repo:devuser/tiny-lib");
  });

  it("treats a repo missing from the GitHub listing as private", () => {
    const onlyNetlify = buildProjects(sites, [], { now: NOW });
    expect(onlyNetlify.projects.find((p) => p.siteIds.includes("s-shop"))?.private).toBe(true);
  });

  describe("default filters", () => {
    it.each([
      ["s-empty", ["no-deploy", "random-name"]],
      ["s-preview", ["preview-only"]],
      ["s-old", ["stale"]],
    ])("hides %s with %j", (siteId, reasons) => {
      const project = projectBySite(siteId);
      expect(project?.hidden).toBe(true);
      expect(project?.hiddenReasons).toEqual(reasons);
    });

    it("hides forks", () => {
      expect(projectByRepo("devuser/some-fork")?.hiddenReasons).toEqual(["fork"]);
    });

    it("respects a custom stale threshold", () => {
      const strict = buildProjects(sites, repos, { now: NOW, staleAfterMonths: 6 });
      expect(strict.projects.find((p) => p.siteIds.includes("s-parking"))?.hiddenReasons).toContain("stale");
      expect(result.projects.find((p) => p.siteIds.includes("s-parking"))?.hidden).toBe(false);
    });
  });

  it("reports stats", () => {
    expect(result.stats).toEqual({
      sites: 11,
      repos: 10,
      projects: 12,
      pairedSites: 9,
      hiddenProjects: 5,
    });
    expect(result.warnings).toEqual([]);
  });

  it("produces unique slugs", () => {
    const slugs = result.projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("orders projects by last activity, newest first", () => {
    const dates = result.projects.map((p) => Date.parse(p.lastActivityAt ?? "0") || 0);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});
