import type {
  AnalysisFile,
  FactsFile,
  JapsConfig,
  LocalizedText,
  Portfolio,
  PortfolioProject,
  Project,
  ProjectsFile,
} from "@japs/schema";
import { Portfolio as PortfolioSchema } from "@japs/schema";

export interface BuildPortfolioInput {
  projectsFile: ProjectsFile;
  analysisFile: AnalysisFile;
  /** Optional: commit history for `period.from`. */
  factsFile?: FactsFile | null;
  config: JapsConfig;
  now?: Date;
}

/** A remote image the CLI must download to `path` (relative to portfolio.json). Never hotlinked. */
export interface ScreenshotDownload {
  url: string;
  path: string;
}

export interface BuildPortfolioResult {
  portfolio: Portfolio;
  screenshots: ScreenshotDownload[];
  warnings: string[];
}

export class BuildError extends Error {}

const month = (iso: string | null | undefined) => iso?.slice(0, 7) ?? null;

/**
 * Visibility from the current config, so editing japs.config.json takes effect without
 * re-running discovery. Mirrors discovery: hidden override > filters, client work hidden.
 */
function isHidden(project: Project, config: JapsConfig): boolean {
  const override = config.projects[project.key] ?? {};
  if (override.hidden !== undefined) return override.hidden;
  const isClient = override.isClient ?? project.clientSignals.length > 0;
  return project.hiddenReasons.some((r) => r !== "client") || isClient;
}

/** Overrides only the locales the config sets; the rest keeps the generated text. */
const overlay = (generated: LocalizedText, override: LocalizedText | undefined): LocalizedText => ({
  ...generated,
  ...override,
});

/**
 * Assembles portfolio.json (docs/spec/portfolio-json.md) from discovery, analysis and the
 * user's config. Pure: screenshots come back as a download list for the CLI.
 * Precedence (ADR 0004): config > analysis > discovery.
 */
export function buildPortfolio(input: BuildPortfolioInput): BuildPortfolioResult {
  const { projectsFile, analysisFile, factsFile, config } = input;
  const { locales, defaultLocale } = config;
  const warnings: string[] = [];

  const profile = config.profile;
  if (!profile?.name.trim()) {
    throw new BuildError('Fill in "profile" (at least "name") in japs.config.json before building.');
  }
  for (const field of ["headline", "bio"] as const) {
    const empty = locales.filter((l) => !profile[field][l]?.trim());
    if (empty.length) warnings.push(`profile.${field} is empty in ${empty.join(", ")}`);
  }

  const analysisByKey = new Map(analysisFile.projects.map((a) => [a.key, a]));
  const factsByKey = new Map(factsFile?.projects.map((f) => [f.key, f]) ?? []);
  const siteById = new Map(projectsFile.sites.map((s) => [s.id, s]));
  const repoById = new Map(projectsFile.repos.map((r) => [r.id, r]));

  const visible = projectsFile.projects.filter((p) => !isHidden(p, config));
  const ordered = [...visible].sort((a, b) => {
    const oa = config.projects[a.key]?.order ?? Number.POSITIVE_INFINITY;
    const ob = config.projects[b.key]?.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return (Date.parse(b.lastActivityAt ?? "") || 0) - (Date.parse(a.lastActivityAt ?? "") || 0);
  });

  const screenshots: ScreenshotDownload[] = [];

  const toPortfolioProject = (project: Project): PortfolioProject | null => {
    const analysis = analysisByKey.get(project.key);
    if (!analysis) {
      warnings.push(`${project.key}: no analysis yet, skipped (run \`japs analyze\`)`);
      return null;
    }
    const missing = locales.filter((l) => !(l in analysis.copy.title));
    if (missing.length) {
      warnings.push(`${project.key}: analysis lacks ${missing.join(", ")}, skipped (run \`japs analyze\`)`);
      return null;
    }
    const facts = factsByKey.get(project.key);
    if (facts && facts.hash !== analysis.factsHash) {
      warnings.push(`${project.key}: facts changed since analysis, texts may be outdated`);
    }

    const override = config.projects[project.key] ?? {};
    const anonymized = override.anonymize ?? false;
    const isClient = override.isClient ?? false;
    if (anonymized && !analysis.anonymized) {
      warnings.push(`${project.key}: anonymized in config but analyzed with names, skipped (run \`japs analyze\`)`);
      return null;
    }
    if (anonymized && !override.clientLabel) {
      warnings.push(`${project.key}: anonymized without "clientLabel"`);
    }

    // Keep only declared locales so a wider analysis doesn't break the schema.
    const pick = (text: LocalizedText): LocalizedText => Object.fromEntries(locales.map((l) => [l, text[l] ?? ""]));
    const copy = override.copy ?? {};
    const title = pick(overlay(analysis.copy.title, copy.title));

    const sites = project.siteIds.flatMap((id) => siteById.get(id) ?? []);
    const primarySite = sites.find((s) => s.hasCustomDomain) ?? sites[0];
    const primaryRepo = project.repoIds.map((id) => repoById.get(id)).find((r) => r !== undefined);

    const firstCommit = facts?.repos
      .flatMap((r) => (r.commits?.first ? [r.commits.first] : []))
      .sort()[0];

    const projectScreenshots: PortfolioProject["screenshots"] = [];
    const showScreenshots = !anonymized || override.allowScreenshots === true;
    if (showScreenshots && primarySite?.screenshotUrl) {
      const path = `screenshots/${project.slug}-desktop.webp`;
      screenshots.push({ url: primarySite.screenshotUrl, path });
      projectScreenshots.push({ viewport: "desktop", src: path, alt: title });
    }

    return {
      slug: project.slug,
      title,
      summary: pick(overlay(analysis.copy.summary, copy.summary)),
      description: pick(overlay(analysis.copy.description, copy.description)),
      role: pick(overlay(analysis.copy.role, copy.role)),
      period: { from: month(firstCommit), to: month(project.lastActivityAt) },
      tags: copy.tags ?? analysis.copy.tags,
      links: {
        live: anonymized ? null : (primarySite?.url ?? null),
        // Never reveal a private repository (CLAUDE.md, portfolio-json spec).
        repo: project.private || !primaryRepo ? null : primaryRepo.url,
      },
      client: {
        isClient: isClient || anonymized,
        anonymized,
        label: override.clientLabel ? pick(override.clientLabel) : null,
      },
      screenshots: projectScreenshots,
      featured: override.featured ?? false,
    };
  };

  const portfolio: Portfolio = {
    version: 1,
    generatedAt: (input.now ?? new Date()).toISOString(),
    locales,
    defaultLocale,
    profile: {
      name: profile.name,
      headline: profile.headline,
      bio: profile.bio,
      location: profile.location,
      links: profile.links,
    },
    projects: ordered.flatMap((p) => toPortfolioProject(p) ?? []),
  };

  const parsed = PortfolioSchema.safeParse(portfolio);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new BuildError(`portfolio.json would be invalid:\n${issues}`);
  }
  return { portfolio: parsed.data, screenshots, warnings };
}
