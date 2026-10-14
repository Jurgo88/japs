import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Portfolio, type LocalizedText, type PortfolioProject } from "@japs/schema";

type Screenshot = PortfolioProject["screenshots"][number];
import { SUPPORTED_LOCALES } from "./i18n.ts";

let cached: Portfolio | null = null;

/**
 * Loads and validates portfolio.json. The theme reads nothing else. Cached for a build;
 * in `astro dev` it is re-read on every request, so a new `japs build` shows up on reload.
 */
export function loadPortfolio(): Portfolio {
  if (cached && !import.meta.env.DEV) return cached;
  const dir = process.env.JAPS_PORTFOLIO_DIR;
  if (!dir) throw new Error("JAPS_PORTFOLIO_DIR is not set (astro.config.mjs sets it).");

  const result = Portfolio.safeParse(JSON.parse(readFileSync(join(dir, "portfolio.json"), "utf8")));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`${join(dir, "portfolio.json")} is invalid:\n${issues}`);
  }
  // ADR 0005: a locale the theme has no UI strings for is a build error, not a half-translated page.
  const unsupported = result.data.locales.filter((l) => !SUPPORTED_LOCALES.includes(l));
  if (unsupported.length) {
    throw new Error(`theme-default has no UI strings for: ${unsupported.join(", ")} (supported: ${SUPPORTED_LOCALES.join(", ")})`);
  }
  cached = result.data;
  return cached;
}

export const text = (value: LocalizedText, locale: string): string => value[locale] ?? "";

/** Locales other than the default get a URL prefix: / and /sk/. */
export const localePrefix = (locale: string, portfolio: Portfolio): string =>
  locale === portfolio.defaultLocale ? "" : `/${locale}`;

export const projectUrl = (project: PortfolioProject, locale: string, portfolio: Portfolio): string =>
  `${localePrefix(locale, portfolio)}/projects/${project.slug}/`;

/** Featured projects first, otherwise the order from portfolio.json. */
export const orderedProjects = (portfolio: Portfolio): PortfolioProject[] => [
  ...portfolio.projects.filter((p) => p.featured),
  ...portfolio.projects.filter((p) => !p.featured),
];

/** The screenshot a project card shows; the detail page morphs it from the card. */
export const coverShot = (project: PortfolioProject): Screenshot | undefined =>
  project.screenshots.find((s) => s.viewport === "desktop") ?? project.screenshots[0];

/** CSS view-transition-name pairing an element on the home page with the same one on the detail page. */
export const transitionName = (kind: "shot" | "title" | "card", project: PortfolioProject): string =>
  `${kind}-${project.slug.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

/** Tags by number of projects using them (then alphabetically), for the filter. */
export function tagCounts(portfolio: Portfolio): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const project of portfolio.projects) {
    for (const tag of new Set(project.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Numbers for the stats strip. `years` spans the first to the last active year; null without any dates. */
export function portfolioStats(portfolio: Portfolio): { projects: number; technologies: number; years: number | null } {
  const now = new Date(portfolio.generatedAt).getUTCFullYear();
  const year = (month: string | null) => (month ? Number(month.slice(0, 4)) : null);
  const starts = portfolio.projects.map((p) => year(p.period.from)).filter((y): y is number => y !== null);
  const ends = portfolio.projects.map((p) => year(p.period.to) ?? now);
  return {
    projects: portfolio.projects.length,
    technologies: tagCounts(portfolio).length,
    years: starts.length ? Math.max(...ends) - Math.min(...starts) + 1 : null,
  };
}

/** Neighbours in the home page order, for previous / next links (no wrap-around). */
export function neighbours(project: PortfolioProject, portfolio: Portfolio) {
  const list = orderedProjects(portfolio);
  const i = list.findIndex((p) => p.slug === project.slug);
  return { previous: list[i - 1] ?? null, next: i >= 0 ? (list[i + 1] ?? null) : null };
}
