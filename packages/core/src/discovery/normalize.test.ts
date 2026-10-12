import { describe, expect, it } from "vitest";
import { isRandomNetlifyName, normalizeDomain, repoIdFromGitHubUrl, slugify } from "./normalize.ts";

describe("repoIdFromGitHubUrl", () => {
  it.each([
    ["https://github.com/Jurgo88/HermanTool", "jurgo88/hermantool"],
    ["https://github.com/Jurgo88/HermanTool.git", "jurgo88/hermantool"],
    ["https://github.com/Jurgo88/loqsy/commit/ed46cd627bbbf63a", "jurgo88/loqsy"],
    ["https://github.com/Jurgo88/shopmaster/pull/2", "jurgo88/shopmaster"],
    ["https://github.com/Jurgo88/jurgo.cz/commit/5f255ed", "jurgo88/jurgo.cz"],
    ["git@github.com:Jurgo88/japs.git", "jurgo88/japs"],
    ["https://www.github.com/a/b", "a/b"],
  ])("%s -> %s", (input, expected) => {
    expect(repoIdFromGitHubUrl(input)).toBe(expected);
  });

  it.each([null, undefined, "", "https://gitlab.com/a/b", "https://github.com/onlyowner", "not a url"])(
    "returns null for %s",
    (input) => {
      expect(repoIdFromGitHubUrl(input)).toBeNull();
    },
  );
});

describe("normalizeDomain", () => {
  it("strips protocol, www and path", () => {
    expect(normalizeDomain("https://www.Example.com/path/")).toBe("example.com");
    expect(normalizeDomain("example.com")).toBe("example.com");
    expect(normalizeDomain("http://ehm.netlify.app")).toBe("ehm.netlify.app");
  });

  it("returns null for empty input", () => {
    expect(normalizeDomain(null)).toBeNull();
    expect(normalizeDomain("")).toBeNull();
  });
});

describe("isRandomNetlifyName", () => {
  it("detects generated names", () => {
    expect(isRandomNetlifyName("beamish-zabaione-259ab3")).toBe(true);
    expect(isRandomNetlifyName("superlative-wisp-00ec87")).toBe(true);
  });

  it("ignores real names", () => {
    expect(isRandomNetlifyName("bylinky-spod-tatier")).toBe(false);
    expect(isRandomNetlifyName("parking-kvi")).toBe(false);
  });
});

describe("slugify", () => {
  it("handles camel case, diacritics and separators", () => {
    expect(slugify("AcmeShop")).toBe("acme-shop");
    expect(slugify("portfolio-v2")).toBe("portfolio-v2");
    expect(slugify("Bylinky spod Tatier")).toBe("bylinky-spod-tatier");
    expect(slugify("Paluš_Tool")).toBe("palus-tool");
    expect(slugify("!!!")).toBe("project");
  });
});
