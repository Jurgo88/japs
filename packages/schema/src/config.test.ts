import { describe, expect, it } from "vitest";
import { JapsConfig } from "./config.ts";

const messages = (input: unknown) => {
  const result = JapsConfig.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("JapsConfig", () => {
  it("fills defaults for a minimal config", () => {
    expect(JapsConfig.parse({ version: 1 })).toEqual({
      version: 1,
      locales: ["en"],
      defaultLocale: "en",
      theme: "default",
      discovery: { staleAfterMonths: 24, includeOrgRepos: false },
      links: [],
      merge: [],
      projects: {},
    });
  });

  it("accepts a full bilingual config", () => {
    expect(
      messages({
        version: 1,
        locales: ["en", "sk"],
        defaultLocale: "en",
        profile: {
          name: "Jane Doe",
          headline: { en: "Developer", sk: "Vývojárka" },
          bio: { en: "Hi", sk: "Ahoj" },
        },
        links: [{ site: "abc", repo: "janedoe/acme-shop" }, { site: "def", repo: null }],
        merge: [{ into: "repo:janedoe/acme-shop", from: ["repo:janedoe/acme-shop-api", "site:def"] }],
        projects: {
          "repo:janedoe/acme-shop": {
            hidden: false,
            isClient: true,
            anonymize: true,
            clientLabel: { en: "E-shop for a client", sk: "E-shop pre klienta" },
            featured: true,
            order: 1,
            copy: { title: { sk: "E-shop" }, tags: ["Vue"] },
          },
        },
      }),
    ).toEqual([]);
  });

  it("accepts only built-in themes", () => {
    expect(messages({ version: 1, theme: "default" })).toEqual([]);
    expect(messages({ version: 1, theme: "neon" })[0]).toMatch(/^theme: Invalid enum value/);
  });

  it("validates the profile contact email and availability", () => {
    const profile = { name: "Jane", headline: { en: "" }, bio: { en: "" } };
    expect(messages({ version: 1, profile: { ...profile, email: "jane@example.com", available: true } })).toEqual([]);
    expect(messages({ version: 1, profile: { ...profile, email: "jane" } })).toEqual(["profile.email: Invalid email"]);
  });

  it("rejects typos in hand-edited keys", () => {
    expect(messages({ version: 1, projects: { "site:abc": { hiden: true } } })).toEqual([
      "projects.site:abc: Unrecognized key(s) in object: 'hiden'",
    ]);
  });

  it("rejects project keys that are slugs or uppercase", () => {
    const issues = messages({ version: 1, projects: { "acme-shop": {}, "repo:JaneDoe/Acme": {} } });
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('expected "repo:<owner>/<repo>"');
  });

  it("requires full translations for profile and client label, partial for copy", () => {
    expect(
      messages({
        version: 1,
        locales: ["en", "sk"],
        profile: { name: "Jane", headline: { en: "Dev" }, bio: { en: "Hi", sk: "Ahoj" } },
        projects: { "site:abc": { copy: { title: { sk: "Názov" }, summary: { de: "Text" } } } },
      }),
    ).toEqual(["profile.headline: locales: missing sk", "projects.site:abc.copy.summary: locales: undeclared de"]);
  });

  it("requires defaultLocale in locales", () => {
    expect(messages({ version: 1, locales: ["sk"] })).toEqual(['defaultLocale: defaultLocale "en" is not in locales']);
  });

  it("rejects a site linked twice and a key in two merges", () => {
    expect(
      messages({
        version: 1,
        links: [{ site: "abc", repo: null }, { site: "abc", repo: "a/b" }],
        merge: [
          { into: "repo:a/b", from: ["repo:a/c"] },
          { into: "repo:a/d", from: ["repo:a/c"] },
        ],
      }),
    ).toEqual(['links.1.site: site "abc" is linked more than once', 'merge.1.from.0: "repo:a/c" appears in more than one merge']);
  });
});
