import type { RepoFacts, SiteFacts } from "@japs/schema";
import { describe, expect, it } from "vitest";
import { deriveTech, techForDependency } from "./tech.ts";

const repo = (overrides: Partial<RepoFacts>): RepoFacts => ({
  id: "devuser/acme",
  accessible: true,
  private: false,
  pushedAt: null,
  description: null,
  topics: [],
  primaryLanguage: null,
  languages: {},
  commits: null,
  pullRequests: null,
  readme: null,
  packages: [],
  ...overrides,
});

const site = (overrides: Partial<SiteFacts>): SiteFacts => ({
  id: "s1",
  domain: "acme.example",
  url: "https://acme.example",
  framework: null,
  lastDeployAt: null,
  deploy: null,
  live: null,
  ...overrides,
});

describe("techForDependency", () => {
  it("matches exact names and scope prefixes", () => {
    expect(techForDependency("@supabase/supabase-js")?.name).toBe("Supabase");
    expect(techForDependency("@sentry/nuxt")?.name).toBe("Sentry");
    expect(techForDependency("left-pad")).toBeUndefined();
  });
});

describe("deriveTech", () => {
  it("merges evidence from dependencies, languages, topics and Netlify", () => {
    const tech = deriveTech(
      [
        repo({
          primaryLanguage: "TypeScript",
          languages: { TypeScript: 80, Vue: 15, Shell: 3, JavaScript: 2 },
          topics: ["vuejs"],
          packages: [
            { path: "", name: "acme", description: null, dependencies: ["nuxt", "@supabase/supabase-js"], devDependencies: ["typescript", "eslint"] },
          ],
        }),
      ],
      [
        site({
          framework: "nuxt",
          deploy: {
            commitMessage: null,
            committer: null,
            functions: [
              { name: "server", generator: "nuxt@4.6.0", runtime: null },
              { name: "mailer", generator: null, runtime: null },
            ],
            scheduledFunctions: [],
            edgeFunctions: false,
            lighthouse: null,
          },
        }),
      ],
    );
    expect(tech.map((t) => [t.name, t.evidence])).toEqual([
      ["Nuxt", ["dependency:nuxt", "netlify:framework:nuxt"]],
      ["Vue", ["language:Vue:15%", "topic:vuejs"]],
      ["TypeScript", ["dependency:typescript", "language:TypeScript:80%", "language:TypeScript:primary"]],
      ["Supabase", ["dependency:@supabase/supabase-js"]],
      ["Netlify", ["netlify:site:acme.example"]],
      ["Netlify Functions", ["netlify:functions:1"]],
    ]);
  });

  it("ignores framework-generated functions and minor languages", () => {
    const tech = deriveTech(
      [repo({ languages: { JavaScript: 96, CSS: 4 } })],
      [
        site({
          deploy: {
            commitMessage: null,
            committer: null,
            functions: [{ name: "server", generator: "nuxt@4.6.0", runtime: null }],
            scheduledFunctions: [],
            edgeFunctions: false,
            lighthouse: null,
          },
        }),
      ],
    );
    expect(tech.map((t) => t.name)).toEqual(["JavaScript", "Netlify"]);
  });
});
