import { z } from "zod";

/**
 * Built-in themes (ADR 0010). Theme `x` lives in apps/theme-x as @japs/theme-x.
 * A theme joins this list in the same change that adds it.
 */
export const THEMES = [
  { id: "default", label: "Default", description: "Clean and fast. Light and dark, subtle motion." },
] as const;

export type ThemeInfo = (typeof THEMES)[number];

export const ThemeId = z.enum(THEMES.map((t) => t.id) as [ThemeInfo["id"], ...ThemeInfo["id"][]]);
export type ThemeId = z.infer<typeof ThemeId>;
