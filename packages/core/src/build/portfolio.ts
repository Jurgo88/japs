import type {
  AnalysisFile,
  FactsFile,
  JapsConfig,
  LocalizedText,
  Portfolio,
  PortfolioProject,
  Project,
  ProjectOverride,
  ProjectsFile,
  ScreenshotsManifest,
  Site,
} from "@japs/schema";
import { Portfolio as PortfolioSchema } from "@japs/schema";

export interface BuildPortfolioInput {
  projectsFile: ProjectsFile;
  analysisFile: AnalysisFile;
  /** Optional: commit history for `period.from`. */
  factsFile?: FactsFile | null;
  config: JapsConfig;
  /** From `japs screenshots`; preferred over Netlify's screenshots. */
  screenshots?: ScreenshotsManifest | null;
  now?: Date;
}

/**
 * An image the CLI must place at `path` (relative to portfolio.json): downloaded from a URL
 * (Netlify, never hotlinked) or copied from the screenshots directory.
 */
export interface ScreenshotAsset {
  path: string;
  source: { url: string } | { file: string };
}

export interface BuildPortfolioResult {
  portfolio: Portfolio;
  screenshots: ScreenshotAsset[];
  warnings: string[];
}

export class BuildError extends Error {}

const month = (iso: string | null | undefined) => iso?.slice(0, 7) ?? null;

/**
 * Visibility from the current config, so editing japs.config.json takes effect without
 * re-running discovery. Mirrors discovery: hidden override > filters, client work hidden.
 */
export function isPublished(project: Project, config: JapsConfig): boolean {
  return publishedWith(project, config.projects[project.key]);
}

/**
 * The same decision from one project's override alone. Needs no valid config, so the editor
 * can use it on a draft that is temporarily invalid (e.g. a half-translated label).
 */
export function publishedWith(project: Project, override: Pick<ProjectOverride, "hidden" | "isClient"> = {}): boolean {
  if (override.hidden !== undefined) return !override.hidden;
  const isClient = override.isClient ?? project.clientSignals.length > 0;
  return !project.hiddenReasons.some((r) => r !== "client") && !isClient;
}

/** The site a project is shown by: the first one with a custom domain, else the first. */
export function primarySite(project: Project, siteById: Map<string, Site>): Site | undefined {
  const sites = project.siteIds.flatMap((id) => siteById.get(id) ?? []);
  return sites.find((s) => s.hasCustomDomain) ?? sites[0];
}

/** Anonymized projects show no screenshots unless the config explicitly allows them. */
export function showsScreenshots(project: Project, config: JapsConfig): boolean {
  const override = config.projects[project.key] ?? {};
  return !(override.anonymize ?? false) || override.allowScreenshots === true;
}

const extension = (file: string) => /.[a-z0-9]+$/i.exec(file)?.[0] ?? "";

/** Overrides only the locales the config sets; the rest keeps the generated text. */
const overlay = (generated: LocalizedText, override: LocalizedText | undefined): LocalizedText => ({
  ...generated,
  ...override,
});

/**
 * Assembles portfolio.json (docs/spec/portfolio-json.md) from discovery, analysis and the
 * user's config. Pure: screenshots come back as a list of files for the CLI to place.
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

  const visible = projectsFile.projects.filter((p) => isPublished(p, config));
  const shotsByKey = new Map<string, ScreenshotsManifest["shots"]>();
  for (const shot of input.screenshots?.shots ?? []) {
    shotsByKey.set(shot.key, [...(shotsByKey.get(shot.key) ?? []), shot]);
  }
  const ordered = [...visible].sort((a, b) => {
    const oa = config.projects[a.key]?.order ?? Number.POSITIVE_INFINITY;
    const ob = config.projects[b.key]?.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return (Date.parse(b.lastActivityAt ?? "") || 0) - (Date.parse(a.lastActivityAt ?? "") || 0);
  });

  const screenshots: ScreenshotAsset[] = [];

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

    const site = primarySite(project, siteById);
    const primaryRepo = project.repoIds.map((id) => repoById.get(id)).find((r) => r !== undefined);

    const firstCommit = facts?.repos
      .flatMap((r) => (r.commits?.first ? [r.commits.first] : []))
      .sort()[0];

    // Own captures first (desktop, then mobile); Netlify's screenshot only when there's no desktop one.
    const projectScreenshots: PortfolioProject["screenshots"] = [];
    if (showsScreenshots(project, config)) {
      const own = shotsByKey.get(project.key) ?? [];
      for (const viewport of ["desktop", "mobile"] as const) {
        const shot = own.find((s) => s.viewport === viewport);
        if (!shot) continue;
        const path = `screenshots/${project.slug}-${viewport}${extension(shot.file)}`;
        screenshots.push({ path, source: { file: shot.file } });
        projectScreenshots.push({ viewport, src: path, alt: title });
      }
      if (!own.some((s) => s.viewport === "desktop") && site?.screenshotUrl) {
        const path = `screenshots/${project.slug}-desktop.webp`;
        screenshots.push({ path, source: { url: site.screenshotUrl } });
        projectScreenshots.unshift({ viewport: "desktop", src: path, alt: title });
      }
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
        live: anonymized ? null : (site?.url ?? null),
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
