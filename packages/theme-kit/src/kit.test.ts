import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Portfolio, PortfolioProject } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { SAMPLE_DIR } from "./astro.ts";
import { extendStrings, formatMonth, plural, t } from "./i18n.ts";
import { renderMarkdown } from "./markdown.ts";
import {
  coverShot,
  loadPortfolio,
  localePrefix,
  neighbours,
  orderedProjects,
  portfolioStats,
  projectUrl,
  tagCounts,
  transitionName,
} from "./portfolio.ts";

const text = (en: string) => ({ en, sk: en });

const project = (slug: string, extra: Partial<PortfolioProject> = {}): PortfolioProject => ({
  slug,
  title: text(slug),
  summary: text(""),
  description: text(""),
  role: null,
  period: { from: null, to: null },
  tags: [],
  links: { live: null, repo: null },
  client: { isClient: false, anonymized: false, label: null },
  screenshots: [],
  featured: false,
  ...extra,
});

const portfolio = (projects: PortfolioProject[]): Portfolio => ({
  version: 1,
  generatedAt: "2026-10-15T00:00:00.000Z",
  locales: ["en", "sk"],
  defaultLocale: "en",
  profile: { name: "Jane", headline: text(""), bio: text(""), location: null, links: [], email: null, available: null },
  projects,
});

describe("portfolio helpers", () => {
  const p = portfolio([
    project("a", { tags: ["Vue", "Supabase"], period: { from: "2021-03", to: "2022-01" } }),
    project("b", { featured: true, tags: ["Vue"], period: { from: "2024-05", to: null } }),
    project("c", { tags: ["Astro", "Vue", "Vue"] }),
  ]);

  it("puts featured projects first and keeps the rest in order", () => {
    expect(orderedProjects(p).map((x) => x.slug)).toEqual(["b", "a", "c"]);
  });

  it("prefixes every locale except the default", () => {
    expect(localePrefix("en", p)).toBe("");
    expect(projectUrl(p.projects[0]!, "sk", p)).toBe("/sk/projects/a/");
  });

  it("counts each tag once per project, most used first", () => {
    expect(tagCounts(p)).toEqual([
      { tag: "Vue", count: 3 },
      { tag: "Astro", count: 1 },
      { tag: "Supabase", count: 1 },
    ]);
  });

  it("spans years from the first start to the last activity, ongoing = generatedAt year", () => {
    expect(portfolioStats(p)).toEqual({ projects: 3, technologies: 3, years: 6 });
    expect(portfolioStats(portfolio([project("x")])).years).toBeNull();
  });

  it("finds neighbours in home page order without wrapping", () => {
    const [b, a, c] = orderedProjects(p);
    expect(neighbours(b!, p)).toEqual({ previous: null, next: a });
    expect(neighbours(c!, p)).toEqual({ previous: a, next: null });
  });

  it("prefers the desktop shot as cover and makes CSS-safe transition names", () => {
    const shot = (viewport: "desktop" | "mobile") => ({ viewport, src: `${viewport}.jpg`, alt: text("") });
    expect(coverShot(project("x", { screenshots: [shot("mobile"), shot("desktop")] }))?.viewport).toBe("desktop");
    expect(coverShot(project("x", { screenshots: [shot("mobile")] }))?.viewport).toBe("mobile");
    expect(transitionName("shot", project("my.site"))).toBe("shot-my-site");
  });
});

describe("loadPortfolio", () => {
  const write = (data: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), "japs-kit-"));
    writeFileSync(join(dir, "portfolio.json"), JSON.stringify(data));
    return dir;
  };

  it("loads the bundled sample", () => {
    expect(loadPortfolio(SAMPLE_DIR).projects.length).toBeGreaterThan(1);
  });

  it("names the invalid field", () => {
    const dir = write({ ...portfolio([]), defaultLocale: "de" });
    expect(() => loadPortfolio(dir)).toThrow(/defaultLocale/);
  });

  it("rejects a locale without UI strings", () => {
    const dir = write({ ...portfolio([]), locales: ["en", "fr"], profile: { ...portfolio([]).profile, headline: { en: "", fr: "" }, bio: { en: "", fr: "" } } });
    expect(() => loadPortfolio(dir)).toThrow("No theme UI strings for: fr");
  });
});

describe("strings", () => {
  it("picks plural forms per locale", () => {
    expect([1, 3, 5].map((n) => plural("sk", "projects", n))).toEqual(["projekt", "projekty", "projektov"]);
    expect(plural("en", "years", 1)).toBe("year");
  });

  it("formats months in the page language", () => {
    expect(formatMonth("2025-03", "sk")).toBe("marec 2025");
    expect(formatMonth(null, "en")).toBeNull();
  });

  it("lets a theme add strings and falls back to the shared ones", () => {
    const tt = extendStrings({ en: { hello: "Hi" }, sk: { hello: "Ahoj" }, cs: { hello: "Ahoj" }, de: { hello: "Hallo" } });
    expect(tt("sk", "hello")).toBe("Ahoj");
    expect(tt("sk", "back")).toBe(t("sk", "back"));
  });
});

describe("renderMarkdown", () => {
  it("escapes raw HTML but keeps Markdown", () => {
    expect(renderMarkdown("**bold** <script>x</script>")).toBe("<p><strong>bold</strong> &lt;script&gt;x&lt;/script&gt;</p>\n");
  });
});
