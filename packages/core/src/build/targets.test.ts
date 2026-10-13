import { JapsConfig } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects } from "../discovery/pair.ts";
import { screenshotTargets } from "./targets.ts";

const projectsFile = buildProjects(sites, repos, { now: NOW });
const config = (projects: Record<string, unknown> = {}) => JapsConfig.parse({ version: 1, projects });
const keys = (targets: { key: string }[]) => targets.map((t) => t.key);

describe("screenshotTargets", () => {
  it("captures only published projects with a deployed site, at their primary URL", () => {
    const targets = screenshotTargets(projectsFile, config());
    expect(targets).toContainEqual({ key: "repo:devuser/acmeshop", slug: "acme-shop", url: "https://acme-shop.example" });
    // Private, hidden, repo-only and never-deployed projects are never photographed.
    for (const key of ["repo:devuser/client-app", "repo:devuser/tiny-lib", "site:s-empty", "repo:devuser/shopmaster"]) {
      expect(keys(targets)).not.toContain(key);
    }
  });

  it("uses the config's screenshotUrl and respects anonymization", () => {
    const targets = screenshotTargets(
      projectsFile,
      config({
        "repo:devuser/acmeshop": { screenshotUrl: "https://acme-shop.example/demo" },
        "repo:devuser/widget": { anonymize: true },
        "repo:devuser/client-app": { hidden: false, anonymize: true, allowScreenshots: true },
      }),
    );
    expect(targets.find((t) => t.key === "repo:devuser/acmeshop")?.url).toBe("https://acme-shop.example/demo");
    expect(keys(targets)).not.toContain("repo:devuser/widget");
    expect(keys(targets)).toContain("repo:devuser/client-app");
  });

  it("limits to the given keys", () => {
    expect(keys(screenshotTargets(projectsFile, config(), ["repo:devuser/acmeshop"]))).toEqual(["repo:devuser/acmeshop"]);
  });
});
