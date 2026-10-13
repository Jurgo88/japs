import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects } from "./pair.ts";
import type { PairingOptions, RepoInput, SiteInput } from "./types.ts";

const run = (opts: PairingOptions = {}, extraSites: SiteInput[] = [], extraRepos: RepoInput[] = []) => {
  const file = buildProjects([...sites, ...extraSites], [...repos, ...extraRepos], { now: NOW, ...opts });
  return { file, byKey: (key: string) => file.projects.find((p) => p.key === key) };
};

const agencySite: SiteInput = {
  id: "s-agency",
  name: "agency-landing",
  url: "https://agency-landing.netlify.app",
  customDomain: null,
  repoUrl: "https://github.com/AcmeAgency/landing",
  deploy: {
    id: "d-agency",
    commitUrl: null,
    reviewUrl: null,
    framework: "astro",
    screenshotUrl: null,
    context: "production",
    publishedAt: "2026-09-01T10:00:00.000Z",
    committer: "DevUser",
  },
};
const agencyRepo: RepoInput = {
  fullName: "AcmeAgency/landing",
  url: "https://github.com/AcmeAgency/landing",
  ownerType: "organization",
  private: false,
  fork: false,
  archived: false,
  empty: false,
  homepage: null,
  language: "TypeScript",
  topics: [],
  description: null,
  pushedAt: "2026-09-01T10:00:00Z",
};

describe("client suggestions", () => {
  it("flags a deploy committed by someone else", () => {
    const { byKey } = run({ accountLogin: "devuser" });
    expect(byKey("repo:devuser/client-app")).toMatchObject({
      clientSignals: ["foreign-committer"],
      hiddenReasons: ["private", "client"],
    });
    expect(byKey("repo:devuser/acmeshop")).toMatchObject({ clientSignals: [], hidden: false });
  });

  it("compares the committer case-insensitively", () => {
    const { byKey } = run({ accountLogin: "DEVUSER" });
    expect(byKey("repo:devuser/portfolio-v2")?.clientSignals).toEqual([]);
  });

  it("needs the account login for committer and owner signals", () => {
    const { file, byKey } = run();
    expect(byKey("repo:devuser/client-app")?.clientSignals).toEqual([]);
    expect(file.account).toEqual({ github: null });
  });

  it("flags organization repos even without the account login", () => {
    const { byKey } = run({}, [agencySite], [agencyRepo]);
    expect(byKey("repo:acmeagency/landing")).toMatchObject({
      clientSignals: ["organization-repo"],
      hidden: true,
      hiddenReasons: ["client"],
    });
  });

  it("flags a repo owned by another user, also when the token can't see it", () => {
    const foreign: SiteInput = { ...agencySite, id: "s-friend", repoUrl: "https://github.com/OtherDev/shop" };
    const { byKey } = run({ accountLogin: "devuser" }, [foreign]);
    expect(byKey("repo:otherdev/shop")?.clientSignals).toEqual(["foreign-repo-owner"]);
  });

  it("isClient: false dismisses the suggestion, isClient: true marks it without signals", () => {
    const { byKey } = run({
      accountLogin: "devuser",
      projects: {
        "repo:devuser/client-app": { isClient: false },
        "repo:devuser/acmeshop": { isClient: true },
      },
    });
    expect(byKey("repo:devuser/client-app")).toMatchObject({
      clientSignals: ["foreign-committer"],
      hiddenReasons: ["private"],
    });
    expect(byKey("repo:devuser/acmeshop")).toMatchObject({ hidden: true, hiddenReasons: ["client"] });
  });

  it("publishes client work only with an explicit hidden: false", () => {
    const { byKey } = run({}, [agencySite], [agencyRepo]);
    const shown = run({ projects: { "repo:acmeagency/landing": { hidden: false } } }, [agencySite], [agencyRepo]);
    expect(byKey("repo:acmeagency/landing")?.hidden).toBe(true);
    expect(shown.byKey("repo:acmeagency/landing")?.hidden).toBe(false);
  });

  it("records the account login", () => {
    expect(run({ accountLogin: "devuser" }).file.account).toEqual({ github: "devuser" });
  });
});
