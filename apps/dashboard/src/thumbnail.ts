import { primarySite } from "@japs/core";
import type { Project } from "@japs/schema";
import { backend, state } from "./store.ts";

/** Own desktop capture if there is one, else Netlify's screenshot (fine to hotlink locally). */
export function thumbnail(project: Project, viewport: "desktop" | "mobile" = "desktop"): string | null {
  const shot = state.value?.screenshots?.shots.find((s) => s.key === project.key && s.viewport === viewport);
  if (shot) return backend.screenshotUrl(shot.file);
  if (viewport === "mobile") return null;
  const sites = new Map(state.value?.projects?.sites.map((s) => [s.id, s]) ?? []);
  return primarySite(project, sites)?.screenshotUrl ?? null;
}
