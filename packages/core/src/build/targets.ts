import type { JapsConfig, ProjectsFile, Viewport } from "@japs/schema";
import { isPublished, primarySite, showsScreenshots } from "./portfolio.ts";

export interface ScreenshotTarget {
  key: string;
  slug: string;
  /** The config's screenshotUrl, else the project's primary site. */
  url: string;
  /** Last deploy of the primary site: shots taken before it are stale. */
  deployedAt: string | null;
}

/** Desktop and mobile captures, the same in the CLI (Playwright) and the cloud (Browser Run). */
export const SCREENSHOT_VIEWPORTS: Record<Viewport, { width: number; height: number; deviceScaleFactor: number; isMobile: boolean }> = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true },
};

/**
 * Hides cookie and consent banners and scrollbars before the shot. Matching by id/class/aria
 * names covers the common consent tools without clicking anything on the user's site.
 * Sites often lock scrolling or blur the page while a banner is open (e.g. <body class="cookie-open">);
 * nothing here hides <html> or <body> themselves.
 */
export const SCREENSHOT_HIDE_CSS = `
  :is([id*="cookie" i], [class*="cookie" i], [id*="consent" i], [class*="consent" i],
    [id*="gdpr" i], [class*="gdpr" i], [aria-label*="cookie" i], [aria-label*="consent" i],
    #onetrust-consent-sdk, #CybotCookiebotDialog, .cc-window, .cky-consent-container,
    #usercentrics-root, .fc-consent-root, #didomi-host, .klaro):not(html):not(body) { display: none !important; }
  html, body { scrollbar-width: none !important; }
  ::-webkit-scrollbar { display: none !important; }
`;

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
    return url ? [{ key: project.key, slug: project.slug, url, deployedAt: site?.lastDeployAt ?? null }] : [];
  });
}
