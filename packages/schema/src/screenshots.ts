import { z } from "zod";

/** screenshots/manifest.json, written by `japs screenshots`, read by `japs build`. */

export const Viewport = z.enum(["desktop", "mobile"]);
export type Viewport = z.infer<typeof Viewport>;

export const ScreenshotRecord = z.object({
  key: z.string(),
  viewport: Viewport,
  /** File name inside the screenshots directory. */
  file: z.string(),
  /** Page that was captured (the site, or the config's screenshotUrl). */
  url: z.string().url(),
  takenAt: z.string().datetime(),
});
export type ScreenshotRecord = z.infer<typeof ScreenshotRecord>;

export const ScreenshotsManifest = z.object({
  version: z.literal(1),
  shots: z.array(ScreenshotRecord),
});
export type ScreenshotsManifest = z.infer<typeof ScreenshotsManifest>;
