import { sha1Hex } from "@japs/core";
import { beforeEach, describe, expect, it } from "vitest";
import { Store, type UserStore } from "../db.ts";
import { fakeBucket } from "../testing/bucket.ts";
import { testDb } from "../testing/sqlite.ts";
import { parseHost, serveSite, type SitesEnv } from "./serve.ts";
import { fileKey, writeManifest } from "./storage.ts";

const NOW = new Date("2026-10-20T12:00:00Z");
let env: SitesEnv;
let store: Store;
let jane: UserStore;

beforeEach(async () => {
  env = { DB: testDb(), SITES: fakeBucket().bucket, SITES_DOMAIN: "japs.example.dev", APP_URL: "https://japs.example.dev" };
  store = new Store(env.DB, () => NOW);
  jane = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null })).id);
  await jane.claimHandle("jane");
});

/** What a finished build leaves behind: the content, its manifest and the address pointing at it. */
async function publish(user: UserStore, files: Record<string, string>, draftKey?: string): Promise<Record<string, string>> {
  const shas: Record<string, string> = {};
  for (const [path, text] of Object.entries(files)) {
    const bytes = new Uint8Array(new TextEncoder().encode(text));
    shas[path] = await sha1Hex(bytes);
    await env.SITES.put(fileKey(user.userId, shas[path]!), bytes);
  }
  const buildId = crypto.randomUUID();
  await writeManifest(env.SITES, user.userId, buildId, shas);
  await user.setHostedBuild(draftKey ? { draft: buildId, key: draftKey } : { live: buildId });
  return shas;
}

const get = (url: string, init: RequestInit = {}) => serveSite(new Request(url, init), env, () => NOW);
const PAGES = {
  "/index.html": "<h1>Jane</h1>",
  "/projects/shop/index.html": "<h1>Shop</h1>",
  "/_astro/app.1a2b.js": "console.log(1)",
  "/screenshots/shop-desktop.webp": "WEBP",
};

describe("parseHost", () => {
  it("finds the handle, or a draft key and handle, one label under the domain", () => {
    expect(parseHost("jane.japs.app", "japs.app")).toEqual({ handle: "jane", draftKey: null });
    expect(parseHost("JANE.japs.app.:443", "japs.app")).toEqual({ handle: "jane", draftKey: null });
    expect(parseHost("k3y--jane.japs.app", "japs.app")).toEqual({ handle: "jane", draftKey: "k3y" });
    expect(parseHost("jane.localhost:8788", "localhost:8788")).toEqual({ handle: "jane", draftKey: null });
    for (const host of ["japs.app", "a.b.japs.app", "jane.evil.example", "japs.app.evil.example", null]) {
      expect(parseHost(host, "japs.app"), String(host)).toBeNull();
    }
  });
});

describe("serving a portfolio", () => {
  it("serves the live build: pages as directories, types, caching and security headers", async () => {
    const shas = await publish(jane, PAGES);

    const home = await get("https://jane.japs.example.dev/");
    expect(home.status).toBe(200);
    expect(await home.text()).toBe("<h1>Jane</h1>");
    expect(home.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(home.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(home.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(home.headers.get("ETag")).toBe(`"${shas["/index.html"]}"`);

    const missingSlash = await get("https://jane.japs.example.dev/projects/shop?lang=sk");
    expect(missingSlash.status).toBe(301);
    expect(missingSlash.headers.get("Location")).toBe("/projects/shop/?lang=sk");
    expect(await (await get("https://jane.japs.example.dev/projects/shop/")).text()).toBe("<h1>Shop</h1>");

    const bundle = await get("https://jane.japs.example.dev/_astro/app.1a2b.js");
    expect(bundle.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(bundle.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect((await get("https://jane.japs.example.dev/screenshots/shop-desktop.webp")).headers.get("Content-Type")).toBe("image/webp");
  });

  it("answers revalidation with 304 and HEAD without a body", async () => {
    const shas = await publish(jane, PAGES);
    const again = await get("https://jane.japs.example.dev/", { headers: { "If-None-Match": `"${shas["/index.html"]}"` } });
    expect(again.status).toBe(304);
    const head = await get("https://jane.japs.example.dev/", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect((await get("https://jane.japs.example.dev/", { method: "POST" })).status).toBe(405);
  });

  it("uses the portfolio's own 404 page, or a notice when it has none", async () => {
    await publish(jane, PAGES);
    expect((await get("https://jane.japs.example.dev/nope")).status).toBe(404);
    await publish(jane, { ...PAGES, "/404.html": "<h1>Lost</h1>" });
    const lost = await get("https://jane.japs.example.dev/nope");
    expect(lost.status).toBe(404);
    expect(await lost.text()).toBe("<h1>Lost</h1>");
  });

  it("explains addresses without a published portfolio", async () => {
    const nobody = await get("https://nobody.japs.example.dev/");
    expect(nobody.status).toBe(404);
    expect(await nobody.text()).toContain("Nobody has published a portfolio at this address.");
    expect(await (await get("https://jane.japs.example.dev/")).text()).toContain("hasn't been published yet");
    expect((await get("https://www.japs.example.dev/about")).headers.get("Location")).toBe("https://japs.example.dev/about");
  });

  it("serves a draft only at its secret address, never indexed or cached", async () => {
    await publish(jane, PAGES);
    await publish(jane, { "/index.html": "<h1>Draft</h1>" }, "k3ysecret0");

    const draft = await get("https://k3ysecret0--jane.japs.example.dev/");
    expect(await draft.text()).toBe("<h1>Draft</h1>");
    expect(draft.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(draft.headers.get("Cache-Control")).toBe("no-store");
    expect((await get("https://wrongkey00--jane.japs.example.dev/")).status).toBe(404);
    // The live site is untouched by the draft.
    expect(await (await get("https://jane.japs.example.dev/")).text()).toBe("<h1>Jane</h1>");
  });

  it("sends visitors of a renamed address to the new one until the old name is free again", async () => {
    await publish(jane, PAGES);
    expect(await jane.changeHandle("jane-doe", "2026-12-19T12:00:00.000Z")).toBe(true);

    const old = await get("https://jane.japs.example.dev/projects/shop/?x=1");
    expect(old.status).toBe(302);
    expect(old.headers.get("Location")).toBe("https://jane-doe.japs.example.dev/projects/shop/?x=1");
    expect(await (await get("https://jane-doe.japs.example.dev/")).text()).toBe("<h1>Jane</h1>");

    const later = serveSite(new Request("https://jane.japs.example.dev/"), env, () => new Date("2026-12-20T00:00:00Z"));
    expect((await later).status).toBe(404);
  });

  it("says a deleted account's portfolio is gone", async () => {
    await publish(jane, PAGES);
    await jane.retireHandlesForDeletion("2026-12-19T12:00:00.000Z");
    await jane.deleteAccount();
    const gone = await get("https://jane.japs.example.dev/");
    expect(gone.status).toBe(410);
    expect(await gone.text()).toContain("This portfolio is gone");
  });
});
