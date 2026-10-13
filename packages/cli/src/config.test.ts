import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, writeStarterConfig } from "./config.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "japs-config-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("returns null when the file is missing", async () => {
    expect(await loadConfig(join(dir, "japs.config.json"))).toBeNull();
  });

  it("reports invalid JSON", async () => {
    const path = join(dir, "japs.config.json");
    await writeFile(path, "{ version: 1 }");
    await expect(loadConfig(path)).rejects.toThrow("is not valid JSON");
  });

  it("lists schema issues with paths", async () => {
    const path = join(dir, "japs.config.json");
    await writeFile(path, JSON.stringify({ version: 1, projects: { "site:x": { hidden: "no" } } }));
    await expect(loadConfig(path)).rejects.toThrow("projects.site:x.hidden: Expected boolean");
  });
});

describe("writeStarterConfig", () => {
  it("writes a valid starter config", async () => {
    const path = join(dir, "japs.config.json");
    expect(await writeStarterConfig(path, ["en", "sk"])).toBe(true);
    const config = await loadConfig(path);
    expect(config).toMatchObject({ locales: ["en", "sk"], defaultLocale: "en", profile: { bio: { en: "", sk: "" } } });
  });

  it("never overwrites an existing config", async () => {
    const path = join(dir, "japs.config.json");
    await writeFile(path, "mine");
    expect(await writeStarterConfig(path, ["en"])).toBe(false);
    expect(await readFile(path, "utf8")).toBe("mine");
  });
});
