import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects } from "./pair.ts";
import type { PairingOptions } from "./types.ts";

const run = (config: PairingOptions) => {
  const file = buildProjects(sites, repos, { now: NOW, ...config });
  return {
    file,
    byKey: (key: string) => file.projects.find((p) => p.key === key),
    site: (id: string) => file.sites.find((s) => s.id === id),
  };
};

describe("manual links", () => {
  it("attaches a site to a repo", () => {
    const { byKey, site } = run({ links: [{ site: "s-upload", repo: "devuser/tiny-lib" }] });
    expect(site("s-upload")).toMatchObject({ repoId: "devuser/tiny-lib", matchSource: "manual" });
    expect(byKey("repo:devuser/tiny-lib")?.siteIds).toEqual(["s-upload"]);
    expect(byKey("site:s-upload")).toBeUndefined();
  });

  it("overrides a discovered pair", () => {
    const { byKey } = run({ links: [{ site: "s-kitten", repo: "devuser/tiny-lib" }] });
    expect(byKey("repo:devuser/tiny-lib")?.siteIds).toEqual(["s-kitten"]);
    expect(byKey("repo:devuser/widget")?.siteIds).toEqual([]);
  });

  it("detaches a wrong pair, and homepage matching does not re-attach it", () => {
    const { byKey, site } = run({ links: [{ site: "s-homepage", repo: null }] });
    expect(site("s-homepage")).toMatchObject({ repoId: null, matchSource: "manual" });
    expect(byKey("site:s-homepage")?.repoIds).toEqual([]);
    expect(byKey("repo:devuser/ehm")?.siteIds).toEqual([]);
  });

  it("warns about an unknown site", () => {
    const { file } = run({ links: [{ site: "s-gone", repo: "devuser/tiny-lib" }] });
    expect(file.warnings).toEqual(['links: site "s-gone" not found on Netlify or Cloudflare']);
  });
});

describe("merge", () => {
  it("folds projects into one, keeping the target key and primary repo", () => {
    const { file, byKey } = run({
      merge: [{ into: "repo:devuser/acmeshop", from: ["repo:devuser/tiny-lib", "site:s-upload"] }],
    });
    const project = byKey("repo:devuser/acmeshop");
    expect(project).toMatchObject({
      title: "AcmeShop",
      repoIds: ["devuser/acmeshop", "devuser/tiny-lib"],
      siteIds: ["s-shop", "s-upload"],
      lastActivityAt: "2026-10-09T23:23:35.469Z",
      hidden: false,
    });
    expect(byKey("repo:devuser/tiny-lib")).toBeUndefined();
    expect(byKey("site:s-upload")).toBeUndefined();
    expect(file.stats.projects).toBe(10);
  });

  it("makes the merged project private when any repo is private", () => {
    const { byKey } = run({ merge: [{ into: "repo:devuser/acmeshop", from: ["repo:devuser/client-app"] }] });
    expect(byKey("repo:devuser/acmeshop")).toMatchObject({ private: true, hidden: true, hiddenReasons: ["private"] });
  });

  it("drops the fork filter when a non-fork repo is merged in", () => {
    const { byKey } = run({ merge: [{ into: "repo:devuser/some-fork", from: ["repo:devuser/tiny-lib"] }] });
    expect(byKey("repo:devuser/some-fork")?.hiddenReasons).toEqual([]);
  });

  it("warns about unknown keys and leaves the rest alone", () => {
    const { file, byKey } = run({
      merge: [
        { into: "repo:devuser/nope", from: ["repo:devuser/tiny-lib"] },
        { into: "repo:devuser/widget", from: ["site:s-nope"] },
      ],
    });
    expect(file.warnings).toEqual(['merge: project "repo:devuser/nope" not found', 'merge: project "site:s-nope" not found']);
    expect(byKey("repo:devuser/tiny-lib")).toBeDefined();
  });
});

describe("visibility overrides", () => {
  it("publishes a private project only when explicitly unhidden", () => {
    const { byKey } = run({ projects: { "repo:devuser/client-app": { hidden: false } } });
    expect(byKey("repo:devuser/client-app")).toMatchObject({ hidden: false, hiddenReasons: ["private"] });
  });

  it("hides a project the filters would show", () => {
    const { file, byKey } = run({ projects: { "repo:devuser/acmeshop": { hidden: true } } });
    expect(byKey("repo:devuser/acmeshop")).toMatchObject({ hidden: true, hiddenReasons: [] });
    expect(file.stats.hiddenProjects).toBe(6);
  });

  it("ignores overrides without a hidden flag", () => {
    const { byKey } = run({ projects: { "repo:devuser/client-app": { featured: true } } });
    expect(byKey("repo:devuser/client-app")?.hidden).toBe(true);
  });

  it("warns about unknown and merged-away keys", () => {
    const { file } = run({
      merge: [{ into: "repo:devuser/acmeshop", from: ["repo:devuser/tiny-lib"] }],
      projects: { "repo:devuser/tiny-lib": { hidden: false }, "site:s-nope": { hidden: true } },
    });
    expect(file.warnings).toEqual([
      'projects: "repo:devuser/tiny-lib" was merged into another project; move its settings to the "into" key',
      'projects: "site:s-nope" not found',
    ]);
  });
});
