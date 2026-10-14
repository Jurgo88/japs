import { type ScreenshotTarget, screenshotTargets } from "@japs/core";
import { JapsConfig, type ProjectsFile, type ScreenshotRecord, type Viewport } from "@japs/schema";
import type { UserStore } from "./db.ts";
import type { Bucket } from "./env.ts";

/**
 * Own screenshots in the hosted version (#33): desktop + mobile through Cloudflare Browser Run,
 * images in R2 under `<userId>/<file>`, the manifest in D1. The free plan gives 10 browser
 * minutes a day for the whole service, so only stale shots are retaken, and when the time runs
 * out the portfolio keeps Netlify's screenshot (the build already falls back to it).
 */

export const VIEWPORTS: Viewport[] = ["desktop", "mobile"];

/** One browser session per project, both viewports. Throws BrowserLimitError when time is up. */
export type Capture = (url: string) => Promise<Partial<Record<Viewport, Uint8Array>>>;

/** The day's free browser time is used up: retrying today won't help. */
export class BrowserLimitError extends Error {}

export const BROWSER_LIMIT_MESSAGE =
  "Screenshots paused: today's free browser time is used up. They continue with the next import; Netlify's screenshot is shown meanwhile.";

export const objectKey = (userId: string, file: string) => `${userId}/${file}`;

/**
 * The picked projects that need a (new) shot: shown with screenshots, and without a shot of
 * the current URL taken after the site's last deploy.
 */
export async function planScreenshots(user: UserStore, keys: string[]): Promise<ScreenshotTarget[]> {
  const projectsFile = (await user.getDocument("projects")) as ProjectsFile | null;
  if (!projectsFile) return [];
  const config = JapsConfig.parse((await user.getDocument("config")) ?? { version: 1 });
  const shots = await user.listScreenshots();
  const fresh = (target: ScreenshotTarget) =>
    VIEWPORTS.every((viewport) => {
      const shot = shots.find((s) => s.key === target.key && s.viewport === viewport);
      return shot && shot.url === target.url && (!target.deployedAt || shot.takenAt >= target.deployedAt);
    });
  return screenshotTargets(projectsFile, config, keys).filter((t) => !fresh(t));
}

/** Captures one project and stores what came out; a viewport that failed keeps its old shot. */
export async function shootProject(
  user: UserStore,
  userId: string,
  bucket: Bucket,
  target: ScreenshotTarget,
  capture: Capture,
  now: Date,
): Promise<ScreenshotRecord[]> {
  const images = await capture(target.url);
  const stored: ScreenshotRecord[] = [];
  for (const viewport of VIEWPORTS) {
    const image = images[viewport];
    if (!image) continue;
    const file = `${target.slug}-${viewport}.jpg`;
    await bucket.put(objectKey(userId, file), image, { httpMetadata: { contentType: "image/jpeg" } });
    const shot: ScreenshotRecord = { key: target.key, viewport, file, url: target.url, takenAt: now.toISOString() };
    await user.putScreenshot(shot);
    stored.push(shot);
  }
  return stored;
}

/**
 * Account deletion (#36): every image under the user's prefix. Listed in full first, because
 * deleting while paging can shift the cursor past objects; R2 deletes up to 1000 keys a call.
 */
export async function deleteUserImages(bucket: Bucket, userId: string): Promise<void> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${userId}/`, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}
