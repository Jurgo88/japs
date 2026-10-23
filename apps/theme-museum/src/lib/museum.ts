import type { PortfolioProject } from "@japs/schema";

/** Room numbers the way museums sign them. */
export function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let left = Math.max(1, Math.floor(n));
  let out = "";
  for (const [value, numeral] of table) {
    while (left >= value) {
      out += numeral;
      left -= value;
    }
  }
  return out;
}

/** Painted wall colours, one per room in turn. */
export const WALLS = ["#ebe6dd", "#dfe5da", "#ece1cf", "#dde2e8", "#eadcd8"];

/** Frame finishes, one per work in turn: black lacquer, oak, white. */
export const FRAMES = ["black", "oak", "white"] as const;

/** Works in rooms of three; the last room takes whatever is left. */
export function rooms<T>(works: T[], size = 3): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < works.length; i += size) out.push(works.slice(i, i + size));
  return out;
}

/** An audio-guide stop: room hundreds plus the work's place in the room, e.g. 203. */
export const audioStop = (room: number, place: number): string => String(room * 100 + place);

/** "Vue, Nuxt and TypeScript on the web"-style medium line. */
export function medium(project: PortfolioProject, and: string, onWeb: string): string {
  const tags = project.tags.slice(0, 4);
  if (!tags.length) return "—";
  const list = tags.length === 1 ? tags[0]! : `${tags.slice(0, -1).join(", ")} ${and} ${tags[tags.length - 1]}`;
  return `${list} ${onWeb}`;
}
