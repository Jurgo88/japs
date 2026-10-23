import { z } from "zod";

/**
 * Built-in themes (ADR 0010). Theme `x` lives in apps/theme-x as @japs/theme-x.
 * A theme joins this list in the same change that adds it.
 */
export const THEMES = [
  { id: "default", label: "Default", description: "Clean and fast. Light and dark, subtle motion." },
  { id: "editorial", label: "Editorial", description: "Magazine feel: serif type on paper, projects as chapters." },
  { id: "studio", label: "Studio", description: "Dark and bold: wide type, project index with a cursor preview." },
  { id: "gallery", label: "Gallery", description: "Playful and colourful: big statement, projects in a sideways-scrolling gallery." },
  { id: "fieldnotes", label: "Fieldnotes", description: "A considered project journal: archival details, warm paper and vivid field marks." },
  { id: "riot", label: "Riot", description: "A loud cut-and-paste portfolio with comic panels and electric print colours." },
  { id: "orbit", label: "Orbit", description: "An interactive project constellation with GSAP motion and a live case-file display." },
  { id: "reel", label: "Reel", description: "Cinematic and dark: projects spin on a 3D carousel, the showcase filters by technology with duotone spotlight screenshots." },
  { id: "swiss", label: "Swiss", description: "International Typographic Style: a strict 12-column grid, huge grotesque type, black and signal red, with a grid overlay to toggle." },
  { id: "retro", label: "Retro OS", description: "A classic desktop OS: draggable platinum windows, a projects folder in icon or list view, quick-look previews and a startup screen." },
  { id: "blueprint", label: "Blueprint", description: "A technical drawing set on blue paper: dimension lines, detail callouts, a title block and screenshots drawn as linework." },
  { id: "metro", label: "Metro", description: "A transit network: technologies are coloured lines, projects are stations on a generated map, with a departures board and station pages." },
  { id: "arena", label: "Arena", description: "Game night: an LED scoreboard with a live clock, projects as a lineup on the ice, stats leaders by technology and match-report project pages." },
  { id: "bento", label: "Bento", description: "A modern bento grid: rounded tiles of mixed sizes with stats, a tech marquee, an activity chart and a pointer spotlight; follows the system light or dark mode." },
  { id: "newspaper", label: "Newspaper", description: "A broadsheet front page: blackletter masthead, a lead story in columns, halftone photos, news in brief, a tech index and a classified ad." },
] as const;

export type ThemeInfo = (typeof THEMES)[number];

export const ThemeId = z.enum(THEMES.map((t) => t.id) as [ThemeInfo["id"], ...ThemeInfo["id"][]]);
export type ThemeId = z.infer<typeof ThemeId>;
