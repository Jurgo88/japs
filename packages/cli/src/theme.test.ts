import { existsSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { parseThemeId, themeDir } from "./theme.ts";

describe("themes", () => {
  it("accepts built-in ids and lists them for an unknown one", () => {
    expect(parseThemeId("default")).toBe("default");
    expect(() => parseThemeId("neon; rm -rf /")).toThrow(/Unknown theme "neon; rm -rf \/"\. Built-in themes: default/);
  });

  it("has a package for every built-in theme", () => {
    for (const { id } of THEMES) {
      expect(existsSync(join(themeDir(id), "package.json")), `apps/theme-${id}`).toBe(true);
    }
  });
});
