import type { JapsConfig, ProjectsFile } from "@japs/schema";
import { isPublished, primarySite, showsScreenshots } from "./portfolio.ts";

export interface ScreenshotTarget {
  key: string;
  slug: string;
  /** The config's screenshotUrl, else the project's primary site. */
  url: string;
}

/**
 * What `japs screenshots` captures: exactly the projects `japs build` will publish with
 * screenshots, so nothing private or anonymized is ever photographed by accident.
 */
export function screenshotTargets(projectsFile: ProjectsFile, config: JapsConfig, keys?: string[]): ScreenshotTarget[] {
  const siteById = new Map(projectsFile.sites.map((s) => [s.id, s]));
  return projectsFile.projects.flatMap((project) => {
    if (keys && !keys.includes(project.key)) return [];
    if (!isPublished(project, config) || !showsScreenshots(project, config)) return [];
    const site = primarySite(project, siteById);
    const url = config.projects[project.key]?.screenshotUrl ?? (site?.lastDeployAt ? site.url : undefined);
    return url ? [{ key: project.key, slug: project.slug, url }] : [];
  });
}
