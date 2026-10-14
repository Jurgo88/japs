import type { AnalysisFile, JapsConfig, ProjectAnalysis } from "@japs/schema";
import { JapsConfig as JapsConfigSchema } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects } from "../discovery/pair.ts";
import { BuildError, buildPortfolio, type BuildPortfolioInput } from "./portfolio.ts";

const t = (en: string, sk: string) => ({ en, sk });

const projectsFile = (() => {
  const file = buildProjects(sites, repos, { now: NOW });
  // Give the shop site a Netlify screenshot.
  return {
    ...file,
    sites: file.sites.map((s) => (s.id === "s-shop" ? { ...s, screenshotUrl: "https://cdn.example/shop.webp" } : s)),
  };
})();

const analysis = (key: string, title: string, extra: Partial<ProjectAnalysis> = {}): ProjectAnalysis => ({
  key,
  factsHash: "f".repeat(64),
  provider: "fake",
  model: "m",
  generatedAt: "2026-10-13T10:00:00Z",
  anonymized: false,
  copy: {
    title: t(title, `${title} SK`),
    summary: t("Summary.", "Súhrn."),
    description: t("Description.", "Popis."),
    role: t("Solo developer", "Samostatný vývojár"),
    tags: ["Nuxt"],
  },
  usage: { input: 1, output: 1 },
  dropped: [],
  ...extra,
});

const analysisFile: AnalysisFile = {
  version: 1,
  generatedAt: "2026-10-13T10:00:00Z",
  locales: ["en", "sk"],
  projects: [
    analysis("repo:devuser/acmeshop", "Acme Shop"),
    analysis("repo:devuser/portfolio-v2", "Portfolio"),
    analysis("repo:devuser/tiny-lib", "Tiny Lib"),
    analysis("repo:devuser/client-app", "Client App", { anonymized: true }),
  ],
  warnings: [],
};

const config = (extra: Partial<Record<string, unknown>> = {}): JapsConfig =>
  JapsConfigSchema.parse({
    version: 1,
    locales: ["en", "sk"],
    defaultLocale: "en",
    profile: { name: "Jane Doe", headline: t("Developer", "Vývojárka"), bio: t("Hi.", "Ahoj.") },
    ...extra,
  });

const build = (input: Partial<BuildPortfolioInput> = {}) =>
  buildPortfolio({ projectsFile, analysisFile, config: config(), now: NOW, ...input });

describe("buildPortfolio", () => {
  it("requires a profile name", () => {
    expect(() => build({ config: config({ profile: undefined }) })).toThrow(BuildError);
  });

  it("copies the contact email and availability, null when unset", () => {
    const profile = { name: "Jane Doe", headline: t("Developer", "Vývojárka"), bio: t("Hi.", "Ahoj.") };
    expect(build().portfolio.profile).toMatchObject({ email: null, available: null });
    const set = build({ config: config({ profile: { ...profile, email: "jane@example.com", available: false } }) });
    expect(set.portfolio.profile).toMatchObject({ email: "jane@example.com", available: false });
  });

  it("includes visible, analyzed projects and warns about the rest", () => {
    const { portfolio, warnings } = build();
    expect(portfolio.projects.map((p) => p.slug)).toEqual(["acme-shop", "portfolio-v2", "tiny-lib"]);
    expect(warnings).toContain("repo:devuser/widget: no analysis yet, skipped (run `japs analyze`)");
    // client-app is private, so hidden: never in the portfolio without hidden: false.
    expect(portfolio.projects.some((p) => p.slug === "client-app")).toBe(false);
  });

  it("orders by config order first, then by last activity", () => {
    const { portfolio } = build({ config: config({ projects: { "repo:devuser/tiny-lib": { order: 1 } } }) });
    expect(portfolio.projects[0]?.slug).toBe("tiny-lib");
  });

  it("maps links, period, screenshots and locales", () => {
    const { portfolio, screenshots } = build();
    const shop = portfolio.projects.find((p) => p.slug === "acme-shop")!;
    expect(shop).toMatchObject({
      title: t("Acme Shop", "Acme Shop SK"),
      links: { live: "https://acme-shop.example", repo: "https://github.com/devuser/acmeshop" },
      period: { from: null, to: "2026-10" },
      screenshots: [{ viewport: "desktop", src: "screenshots/acme-shop-desktop.webp", alt: t("Acme Shop", "Acme Shop SK") }],
      client: { isClient: false, anonymized: false, label: null },
      featured: false,
    });
    expect(screenshots).toEqual([
      { path: "screenshots/acme-shop-desktop.webp", source: { url: "https://cdn.example/shop.webp" } },
    ]);
    expect(portfolio).toMatchObject({ locales: ["en", "sk"], defaultLocale: "en", profile: { name: "Jane Doe" } });
  });

  it("prefers own screenshots over Netlify's, desktop first", () => {
    const shot = (viewport: "desktop" | "mobile") => ({
      key: "repo:devuser/acmeshop",
      viewport,
      file: `acme-shop-${viewport}.jpg`,
      url: "https://acme-shop.example",
      takenAt: "2026-10-13T10:00:00Z",
    });
    const { portfolio, screenshots } = build({ screenshots: { version: 1, shots: [shot("mobile"), shot("desktop")] } });

    expect(portfolio.projects[0]?.screenshots.map((s) => [s.viewport, s.src])).toEqual([
      ["desktop", "screenshots/acme-shop-desktop.jpg"],
      ["mobile", "screenshots/acme-shop-mobile.jpg"],
    ]);
    expect(screenshots.map((s) => s.source)).toEqual([{ file: "acme-shop-desktop.jpg" }, { file: "acme-shop-mobile.jpg" }]);
  });

  it("falls back to Netlify for desktop when only a mobile shot exists", () => {
    const mobile = { key: "repo:devuser/acmeshop", viewport: "mobile" as const, file: "m.jpg", url: "https://acme-shop.example", takenAt: "2026-10-13T10:00:00Z" };
    const { portfolio } = build({ screenshots: { version: 1, shots: [mobile] } });
    expect(portfolio.projects[0]?.screenshots.map((s) => s.src)).toEqual([
      "screenshots/acme-shop-desktop.webp",
      "screenshots/acme-shop-mobile.jpg",
    ]);
  });

  it("applies config text overrides per locale, and tag overrides as a whole", () => {
    const { portfolio } = build({
      config: config({
        projects: { "repo:devuser/acmeshop": { featured: true, copy: { title: { sk: "Pekáreň" }, tags: ["Vue"] } } },
      }),
    });
    expect(portfolio.projects[0]).toMatchObject({ title: t("Acme Shop", "Pekáreň"), tags: ["Vue"], featured: true });
  });

  it("never links a private repo, and anonymizes client work", () => {
    const { portfolio, screenshots } = build({
      config: config({
        projects: {
          "repo:devuser/client-app": { hidden: false, anonymize: true, clientLabel: t("E-shop for a client", "E-shop pre klienta") },
        },
      }),
    });
    const client = portfolio.projects.find((p) => p.slug === "client-app")!;
    expect(client).toMatchObject({
      links: { live: null, repo: null },
      client: { isClient: true, anonymized: true, label: t("E-shop for a client", "E-shop pre klienta") },
      screenshots: [],
    });
    expect(screenshots.some((s) => s.path.includes("client-app"))).toBe(false);
  });

  it("skips an anonymized project whose analysis still has names", () => {
    const { portfolio, warnings } = build({
      config: config({ projects: { "repo:devuser/acmeshop": { anonymize: true } } }),
    });
    expect(portfolio.projects.some((p) => p.slug === "acme-shop")).toBe(false);
    expect(warnings).toContain(
      "repo:devuser/acmeshop: anonymized in config but analyzed with names, skipped (run `japs analyze`)",
    );
  });

  it("takes period.from from the first commit and warns about stale analysis", () => {
    const { portfolio, warnings } = build({
      factsFile: {
        version: 1,
        generatedAt: "2026-10-13T10:00:00Z",
        warnings: [],
        projects: [
          {
            key: "repo:devuser/acmeshop",
            title: "AcmeShop",
            private: false,
            hash: "e".repeat(64),
            repos: [
              {
                id: "devuser/acmeshop",
                accessible: true,
                private: false,
                pushedAt: null,
                description: null,
                topics: [],
                primaryLanguage: null,
                languages: {},
                commits: { count: 10, first: "2025-03-04T10:00:00Z", last: "2026-10-09T10:00:00Z" },
                pullRequests: 0,
                readme: null,
                packages: [],
              },
            ],
            sites: [],
            tech: [],
          },
        ],
      },
    });
    expect(portfolio.projects[0]?.period).toEqual({ from: "2025-03", to: "2026-10" });
    expect(warnings).toContain("repo:devuser/acmeshop: facts changed since analysis, texts may be outdated");
  });

  it("skips projects analyzed in fewer locales than configured", () => {
    const { portfolio, warnings } = build({
      config: config({ locales: ["en", "sk", "cs"], profile: { name: "J", headline: { en: "", sk: "", cs: "" }, bio: { en: "", sk: "", cs: "" } } }),
    });
    expect(portfolio.projects).toEqual([]);
    expect(warnings).toContain("repo:devuser/acmeshop: analysis lacks cs, skipped (run `japs analyze`)");
    expect(warnings).toContain("profile.headline is empty in en, sk, cs");
  });
});
