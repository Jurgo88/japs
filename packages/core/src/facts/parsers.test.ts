import { describe, expect, it } from "vitest";
import { lastPageFromLink } from "./github.ts";
import { parseHtmlMeta } from "./live.ts";
import { toDeployFacts } from "./netlify.ts";
import { parsePackageJson, parsePnpmWorkspace } from "./package-json.ts";
import { summarizeReadme } from "./readme.ts";

describe("summarizeReadme", () => {
  it("keeps headings and text, drops badges, images, HTML and code", () => {
    const md = [
      "# Acme Shop [![build](https://img.shields.io/x.svg)](https://ci.example)",
      "<p align=\"center\"><img src=\"logo.png\"></p>",
      "",
      "An **e-shop** built with [Nuxt](https://nuxt.com).",
      "",
      "```bash",
      "# not a heading",
      "pnpm install",
      "```",
      "## Features ##",
      "* Cart",
      "![screenshot](shot.png)",
    ].join("\n");
    const { excerpt, headings } = summarizeReadme(md);
    expect(headings).toEqual(["Acme Shop", "Features"]);
    expect(excerpt).toBe("Acme Shop\n\nAn e-shop built with Nuxt.\n\nFeatures\n- Cart");
  });

  it("cuts long text at a word boundary", () => {
    const { excerpt } = summarizeReadme("word ".repeat(100), 22);
    expect(excerpt).toBe("word word word word…");
  });
});

describe("parsePackageJson", () => {
  it("lists dependency names and workspaces", () => {
    const parsed = parsePackageJson(
      JSON.stringify({ name: "acme", dependencies: { vue: "^3", "@supabase/supabase-js": "^2" }, devDependencies: { vitest: "^3" }, workspaces: ["packages/*"] }),
      "",
    );
    expect(parsed).toEqual({
      facts: { path: "", name: "acme", description: null, dependencies: ["@supabase/supabase-js", "vue"], devDependencies: ["vitest"] },
      workspaces: ["packages/*"],
    });
  });

  it("supports yarn's { packages } workspaces and rejects invalid JSON", () => {
    expect(parsePackageJson('{"workspaces":{"packages":["apps/*"]}}', "").workspaces).toEqual(["apps/*"]);
    expect(() => parsePackageJson("{ nope", "")).toThrow();
  });

  it("reads the packages list from pnpm-workspace.yaml", () => {
    const yaml = 'packages:\n  - "packages/*"\n  - apps/web # comment\nallowBuilds:\n  esbuild: true\n';
    expect(parsePnpmWorkspace(yaml)).toEqual(["packages/*", "apps/web"]);
  });
});

describe("parseHtmlMeta", () => {
  it("reads title, description, og tags and lang in any attribute order", () => {
    const html = `<!doctype html><html class="x" lang="sk"><head>
      <title> Acme &amp; Co </title>
      <meta content="Bylinky z Tatier" name="description">
      <meta property="og:title" content='Acme &#8211; shop'>
      <meta property="og:image" content=https://acme.example/og.png>
      </head><body><meta name="description" content="ignored in body"></body></html>`;
    expect(parseHtmlMeta(html)).toEqual({
      title: "Acme & Co",
      description: "Bylinky z Tatier",
      lang: "sk",
      og: { title: "Acme – shop", image: "https://acme.example/og.png" },
    });
  });

  it("returns nulls for an empty SPA shell", () => {
    expect(parseHtmlMeta('<html lang=""><head></head><body><div id="app"></div></body></html>')).toEqual({
      title: null,
      description: null,
      lang: null,
      og: {},
    });
  });
});

describe("toDeployFacts", () => {
  it("maps Netlify's short function keys, schedules and lighthouse averages", () => {
    expect(
      toDeployFacts({
        title: "Add cart\n\nlong body",
        commit_message: null,
        committer: "DevUser",
        available_functions: [
          { n: "server", g: "nuxt@4.6.0", r: "nodejs22.x" },
          { n: "newsletter", g: null, r: "nodejs22.x" },
        ],
        function_schedules: [{ name: "cleanup", cron: "@daily" }],
        edge_functions_present: null,
        lighthouse: { averages: { performance: 100, accessibility: 96, "best-practices": 100, seo: 82, pwa: 30 } },
      }),
    ).toEqual({
      commitMessage: "Add cart",
      committer: "DevUser",
      functions: [
        { name: "server", generator: "nuxt@4.6.0", runtime: "nodejs22.x" },
        { name: "newsletter", generator: null, runtime: "nodejs22.x" },
      ],
      scheduledFunctions: [{ name: "cleanup", cron: "@daily" }],
      edgeFunctions: false,
      lighthouse: { performance: 100, accessibility: 96, bestPractices: 100, seo: 82 },
    });
  });
});

describe("lastPageFromLink", () => {
  it("reads the last page number, or null for a single page", () => {
    const link =
      '<https://api.github.com/repositories/1/commits?per_page=1&page=2>; rel="next", <https://api.github.com/repositories/1/commits?per_page=1&page=205>; rel="last"';
    expect(lastPageFromLink(link)).toBe(205);
    expect(lastPageFromLink(null)).toBeNull();
  });
});
