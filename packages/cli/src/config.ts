import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { JapsConfig, type JapsConfigInput } from "@japs/schema";

/** User decisions, written only by the user (ADR 0004). */
export const CONFIG_FILE = "japs.config.json";

/** Reads and validates the config. Returns null when the file doesn't exist. */
export async function loadConfig(path: string): Promise<JapsConfig | null> {
  if (!existsSync(path)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = JapsConfig.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`${path} is invalid:\n${issues.join("\n")}`);
  }
  return result.data;
}

export function starterConfig(locales: string[]): JapsConfigInput {
  const empty = Object.fromEntries(locales.map((l) => [l, ""]));
  return {
    version: 1,
    locales,
    defaultLocale: locales[0],
    profile: { name: "", headline: empty, bio: empty, location: null, links: [] },
    discovery: { staleAfterMonths: 24 },
    links: [],
    merge: [],
    projects: {},
  };
}

/** Creates a starter config. Never overwrites: returns false when the file already exists. */
export async function writeStarterConfig(path: string, locales: string[]): Promise<boolean> {
  if (existsSync(path)) return false;
  await writeFile(path, `${JSON.stringify(starterConfig(locales), null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return true;
}
