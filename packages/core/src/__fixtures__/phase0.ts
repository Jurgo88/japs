import type { DeployInput, RepoInput, SiteInput } from "../discovery/types.ts";

/**
 * Anonymized shapes from the Phase 0 run on a real account (2026-10-12).
 * Names and domains are fake; the *situations* are real. Each entry notes which case it covers.
 */

export const NOW = new Date("2026-10-12T12:00:00Z");

const deploy = (overrides: Partial<DeployInput>): DeployInput => ({
  commitUrl: null,
  reviewUrl: null,
  framework: "vite",
  screenshotUrl: null,
  context: "production",
  publishedAt: "2026-09-01T10:00:00.000Z",
  committer: "DevUser",
  ...overrides,
});

const site = (overrides: Partial<SiteInput> & Pick<SiteInput, "id" | "name">): SiteInput => ({
  url: `https://${overrides.name}.netlify.app`,
  customDomain: null,
  repoUrl: null,
  deploy: deploy({}),
  ...overrides,
});

const repo = (overrides: Partial<RepoInput> & Pick<RepoInput, "fullName">): RepoInput => ({
  url: `https://github.com/${overrides.fullName}`,
  ownerType: "user",
  private: false,
  fork: false,
  archived: false,
  homepage: null,
  language: "TypeScript",
  topics: [],
  description: null,
  pushedAt: "2026-09-01T10:00:00Z",
  ...overrides,
});

export const sites: SiteInput[] = [
  // Paired via commit_url; repo casing differs from the GitHub API listing.
  site({
    id: "s-shop",
    name: "acme-shop",
    customDomain: "acme-shop.example",
    deploy: deploy({
      commitUrl: "https://github.com/DevUser/AcmeShop/commit/abc123",
      framework: "nuxt",
      publishedAt: "2026-10-09T16:35:43.881Z",
    }),
  }),
  // One repo, two sites (portfolio deployed on two domains).
  site({
    id: "s-portfolio-a",
    name: "devuser",
    customDomain: "devuser.example",
    deploy: deploy({ commitUrl: "https://github.com/DevUser/portfolio-v2/commit/703f5d6", framework: "nuxt" }),
  }),
  site({
    id: "s-portfolio-b",
    name: "devuser-portfolio",
    deploy: deploy({ commitUrl: "https://github.com/DevUser/portfolio-v2/commit/703f5d6", framework: "nuxt" }),
  }),
  // Site name has nothing in common with the repo name.
  site({
    id: "s-kitten",
    name: "kitten",
    deploy: deploy({ commitUrl: "https://github.com/DevUser/Widget/commit/ae9f881" }),
  }),
  // Linked through build_settings.repo_url, deploy carries no commit.
  site({
    id: "s-parking",
    name: "parking-lottery",
    repoUrl: "https://github.com/DevUser/parking-lottery",
    deploy: deploy({ framework: null, publishedAt: "2026-01-15T01:11:12.369Z" }),
  }),
  // Current deploy is a PR preview; repo only known from review_url.
  site({
    id: "s-preview",
    name: "shopmaster",
    deploy: deploy({
      reviewUrl: "https://github.com/DevUser/shopmaster/pull/2",
      context: "deploy-preview",
      framework: "vue",
      publishedAt: "2026-06-01T22:53:31.619Z",
    }),
  }),
  // Manual upload through the API: no git at all.
  site({
    id: "s-upload",
    name: "herb-shop",
    deploy: deploy({ framework: "nuxt", publishedAt: "2026-10-09T23:23:35.469Z" }),
  }),
  // Never deployed, Netlify random name.
  site({ id: "s-empty", name: "brave-otter-1a2b3c", deploy: null }),
  // Old project, last deploy 2023.
  site({
    id: "s-old",
    name: "epassport",
    deploy: deploy({
      commitUrl: "https://github.com/DevUser/ePassport/commit/aaa151c",
      context: "branch-deploy",
      publishedAt: "2023-10-01T22:38:44.852Z",
    }),
  }),
  // Private client repo.
  site({
    id: "s-client",
    name: "client-app",
    customDomain: "client-app.example",
    deploy: deploy({
      commitUrl: "https://github.com/DevUser/client-app/commit/ed46cd6",
      framework: "nuxt",
      committer: "client-dev",
    }),
  }),
  // Git-linked but deploy has no commit; repo found via repo.homepage.
  site({ id: "s-homepage", name: "ehm", deploy: deploy({ publishedAt: "2026-02-20T03:22:42.155Z" }) }),
];

export const repos: RepoInput[] = [
  repo({ fullName: "DevUser/AcmeShop", url: "https://github.com/devuser/acmeshop", pushedAt: "2026-10-09T16:34:00Z" }),
  repo({ fullName: "DevUser/portfolio-v2" }),
  repo({ fullName: "DevUser/Widget" }),
  repo({ fullName: "DevUser/parking-lottery", pushedAt: "2026-01-13T01:20:00Z" }),
  repo({ fullName: "DevUser/shopmaster", pushedAt: "2023-06-01T22:50:00Z" }),
  repo({ fullName: "DevUser/ePassport", pushedAt: "2023-10-01T22:30:00Z" }),
  repo({ fullName: "DevUser/client-app", private: true }),
  repo({ fullName: "DevUser/ehm", homepage: "https://ehm.netlify.app/" }),
  // Repo without any site (library).
  repo({ fullName: "DevUser/tiny-lib", description: "A small utility library" }),
  // Fork.
  repo({ fullName: "DevUser/some-fork", fork: true }),
];
