/** Seven-segment geometry on a 14×20 cell: a top, b/c right, d bottom, e/f left, g middle. */
export const SEGMENTS = [
  { id: "a", x: 2.5, y: 0, w: 9, h: 2.2 },
  { id: "b", x: 11.6, y: 2.2, w: 2.2, h: 7 },
  { id: "c", x: 11.6, y: 10.8, w: 2.2, h: 7 },
  { id: "d", x: 2.5, y: 17.8, w: 9, h: 2.2 },
  { id: "e", x: 0.2, y: 10.8, w: 2.2, h: 7 },
  { id: "f", x: 0.2, y: 2.2, w: 2.2, h: 7 },
  { id: "g", x: 2.5, y: 8.9, w: 9, h: 2.2 },
] as const;

const MAP: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
};

/** Lit segments for one character; unknown characters stay dark. */
export const segmentsFor = (ch: string): string => MAP[ch] ?? "";
