import type { FactsFile, ProjectFacts } from "@japs/schema";

/** Anonymized facts for analysis tests. */
export const shopFacts: ProjectFacts = {
  key: "repo:devuser/acmeshop",
  title: "AcmeShop",
  private: true,
  hash: "a".repeat(64),
  repos: [
    {
      id: "devuser/acmeshop",
      accessible: true,
      private: true,
      pushedAt: "2026-10-09T16:34:00Z",
      description: "E-shop for Acme Bakery",
      topics: [],
      primaryLanguage: "TypeScript",
      languages: { TypeScript: 80, Vue: 20 },
      commits: { count: 120, first: "2025-03-01T10:00:00Z", last: "2026-10-09T16:00:00Z" },
      pullRequests: 14,
      readme: { excerpt: "Acme Bakery shop. Order bread online.", headings: ["Acme Bakery"] },
      packages: [
        { path: "", name: "acme-bakery", description: null, dependencies: ["nuxt", "@supabase/supabase-js"], devDependencies: [] },
      ],
    },
  ],
  sites: [
    {
      id: "s-shop",
      domain: "acme-bakery.example",
      url: "https://acme-bakery.example",
      framework: "nuxt",
      lastDeployAt: "2026-10-09T16:35:43.881Z",
      deploy: {
        commitMessage: "Add cart",
        committer: "client-dev",
        functions: [
          { name: "server", generator: "nuxt@4.6.0", runtime: null },
          { name: "order-mailer", generator: null, runtime: null },
        ],
        scheduledFunctions: [],
        edgeFunctions: false,
        lighthouse: { performance: 98, accessibility: 95, bestPractices: 100, seo: 92 },
      },
      live: { status: 200, finalUrl: "https://acme-bakery.example/", title: "Acme Bakery", description: "Fresh bread", lang: "sk", og: {} },
    },
  ],
  tech: [
    { name: "Nuxt", category: "framework", evidence: ["dependency:nuxt"] },
    { name: "TypeScript", category: "language", evidence: ["language:TypeScript:80%"] },
    { name: "Supabase", category: "service", evidence: ["dependency:@supabase/supabase-js"] },
  ],
};

export const libFacts: ProjectFacts = {
  key: "repo:devuser/tiny-lib",
  title: "tiny-lib",
  private: false,
  hash: "b".repeat(64),
  repos: [{ ...shopFacts.repos[0]!, id: "devuser/tiny-lib", private: false, readme: null, packages: [] }],
  sites: [],
  tech: [{ name: "TypeScript", category: "language", evidence: ["language:TypeScript:primary"] }],
};

export const factsFile: FactsFile = {
  version: 1,
  generatedAt: "2026-10-13T10:00:00Z",
  projects: [shopFacts, libFacts],
  warnings: [],
};
