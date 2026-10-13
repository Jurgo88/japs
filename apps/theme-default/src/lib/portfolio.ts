import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Portfolio, type LocalizedText, type PortfolioProject } from "@japs/schema";
import { SUPPORTED_LOCALES } from "./i18n.ts";

let cached: Portfolio | null = null;

/** Loads and validates portfolio.json once per build. The theme reads nothing else. */
export function loadPortfolio(): Portfolio {
  if (cached) return cached;
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
