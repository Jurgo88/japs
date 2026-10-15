import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Portfolio, type LocalizedText, type PortfolioProject } from "@japs/schema";
import { SUPPORTED_LOCALES } from "./i18n.ts";

type Screenshot = PortfolioProject["screenshots"][number];

let cached: { file: string; mtime: number; portfolio: Portfolio } | null = null;

/**
 * Loads and validates portfolio.json from JAPS_PORTFOLIO_DIR (set by japsAstroConfig).
 * Re-read only when the file changes, so `astro dev` picks up a new `japs build` on reload.
 */
export function loadPortfolio(dir = process.env.JAPS_PORTFOLIO_DIR): Portfolio {
  if (!dir) throw new Error("JAPS_PORTFOLIO_DIR is not set (japsAstroConfig() in astro.config.mjs sets it).");
  const file = join(dir, "portfolio.json");
  const mtime = statSync(file).mtimeMs;
  if (cached?.file === file && cached.mtime === mtime) return cached.portfolio;

  const result = Portfolio.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`${file} is invalid:\n${issues}`);
  }
  // ADR 0005: a locale without UI strings is a build error, not a half-translated page.
  const unsupported = result.data.locales.filter((l) => !SUPPORTED_LOCALES.includes(l));
  if (unsupported.length) {
    throw new Error(`No theme UI strings for: ${unsupported.join(", ")} (supported: ${SUPPORTED_LOCALES.join(", ")})`);
  }
  cached = { file, mtime, portfolio: result.data };
  return result.data;
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

/** "2024", "2021 – 2024" or "2024 – present" (`present` is the theme's word for ongoing work). */
export function projectYears(project: PortfolioProject, present: string): string {
  const from = project.period.from?.slice(0, 4) ?? null;
  const to = project.period.to?.slice(0, 4) ?? null;
  if (!from) return to ?? present;
  if (!to) return `${from} – ${present}`;
  return from === to ? from : `${from} – ${to}`;
}
