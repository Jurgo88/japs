import type { JapsConfigInput } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { NOW, repos, sites } from "../__fixtures__/phase0.ts";
import { buildProjects } from "../discovery/pair.ts";
import { defaultPublished, setClientLabel, setCopyText, setOrder, setOverride, setPublished, setTags } from "./config-edit.ts";

const projectsFile = buildProjects(sites, repos, { now: NOW });
const project = (key: string) => projectsFile.projects.find((p) => p.key === key)!;
const base: JapsConfigInput = { version: 1, locales: ["en", "sk"], defaultLocale: "en" };

describe("setPublished", () => {
  it("stores hidden only when it differs from the filters", () => {
    const shop = project("repo:devuser/acmeshop");
    expect(defaultPublished(shop, base)).toBe(true);
    const hidden = setPublished(base, shop, false);
    expect(hidden.projects).toEqual({ "repo:devuser/acmeshop": { hidden: true } });
    expect(setPublished(hidden, shop, true).projects).toEqual({});
  });

  it("publishing a private project needs an explicit hidden: false", () => {
    const client = project("repo:devuser/client-app");
    expect(defaultPublished(client, base)).toBe(false);
    expect(setPublished(base, client, true).projects).toEqual({ "repo:devuser/client-app": { hidden: false } });
  });

  it("does not mutate the input", () => {
    const before = structuredClone(base);
    setPublished(base, project("repo:devuser/acmeshop"), false);
    expect(base).toEqual(before);
  });
});

describe("text overrides", () => {
  const generated = { en: "Acme Shop", sk: "E-shop Acme" };

  it("keeps only the edited locale, and removes it when it matches the generated text", () => {
    const edited = setCopyText(base, "repo:devuser/acmeshop", "title", "sk", "Pekáreň Acme", generated);
    expect(edited.projects).toEqual({ "repo:devuser/acmeshop": { copy: { title: { sk: "Pekáreň Acme" } } } });
    expect(setCopyText(edited, "repo:devuser/acmeshop", "title", "sk", "E-shop Acme ", generated).projects).toEqual({});
    expect(setCopyText(edited, "repo:devuser/acmeshop", "title", "sk", "", generated).projects).toEqual({});
  });

  it("stores tags only when they differ from the generated list", () => {
    const edited = setTags(base, "k:x", ["Vue", " Nuxt", "Vue", ""], ["Nuxt"]);
    expect(edited.projects).toEqual({ "k:x": { copy: { tags: ["Vue", "Nuxt"] } } });
    expect(setTags(edited, "k:x", ["Nuxt"], ["Nuxt"]).projects).toEqual({});
  });
});

describe("flags, labels and order", () => {
  it("drops false flags except isClient, which dismisses a suggestion", () => {
    const featured = setOverride(base, "k:x", "featured", true);
    expect(featured.projects).toEqual({ "k:x": { featured: true } });
    expect(setOverride(featured, "k:x", "featured", false).projects).toEqual({});
    expect(setOverride(base, "k:x", "isClient", false).projects).toEqual({ "k:x": { isClient: false } });
  });

  it("drops empty client label locales", () => {
    expect(setClientLabel(base, "k:x", { en: "E-shop for a client", sk: " " }).projects).toEqual({
      "k:x": { clientLabel: { en: "E-shop for a client" } },
    });
    expect(setClientLabel(base, "k:x", { en: "", sk: "" }).projects).toEqual({});
  });

  it("numbers the given order and clears it elsewhere", () => {
    const ordered = setOrder({ ...base, projects: { "k:old": { order: 1, featured: true } } }, ["k:b", "k:a"]);
    expect(ordered.projects).toEqual({ "k:old": { featured: true }, "k:b": { order: 1 }, "k:a": { order: 2 } });
  });
});
