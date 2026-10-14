import { beforeEach, describe, expect, it } from "vitest";
import { Store, type UserStore } from "./db.ts";
import { deleteUserImages, planScreenshots, shootProject } from "./screenshots.ts";
import { fakeBucket } from "./testing/bucket.ts";
import { testDb } from "./testing/sqlite.ts";

const projectsFile = {
  version: 1,
  generatedAt: "2026-10-01T00:00:00.000Z",
  account: { netlify: "jane@example.com", github: "jane" },
  sites: [
    { id: "s1", name: "shop", url: "https://shop.example.dev", hasCustomDomain: true, lastDeployAt: "2026-10-01T00:00:00.000Z", screenshotUrl: null },
    { id: "s2", name: "blog", url: "https://blog.example.dev", hasCustomDomain: true, lastDeployAt: "2026-10-01T00:00:00.000Z", screenshotUrl: null },
  ],
  repos: [],
  projects: [
    { key: "site:s1", slug: "shop", siteIds: ["s1"], repoIds: [] },
    { key: "site:s2", slug: "blog", siteIds: ["s2"], repoIds: [] },
  ],
};

let user: UserStore;
beforeEach(async () => {
  const store = new Store(testDb());
  user = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "jane", name: null, avatarUrl: null })).id);
  await user.putDocument("projects", projectsFile);
  await user.putDocument("config", { version: 1, projects: { "site:s1": { hidden: false }, "site:s2": { hidden: false } } });
});

const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n]);

describe("screenshots", () => {
  it("plans only shown projects without a fresh shot of the current URL", async () => {
    expect((await planScreenshots(user, ["site:s1", "site:s2"])).map((t) => t.key)).toEqual(["site:s1", "site:s2"]);

    const { bucket } = fakeBucket();
    const capture = async () => ({ desktop: jpeg(1), mobile: jpeg(2) });
    await shootProject(user, "u1", bucket, (await planScreenshots(user, ["site:s1"]))[0]!, capture, new Date("2026-10-05T00:00:00Z"));
    expect((await planScreenshots(user, ["site:s1", "site:s2"])).map((t) => t.key)).toEqual(["site:s2"]);

    // A redeploy after the shot, or a different screenshot URL, makes it stale again.
    await user.putDocument("projects", { ...projectsFile, sites: projectsFile.sites.map((s) => ({ ...s, lastDeployAt: "2026-10-10T00:00:00.000Z" })) });
    expect((await planScreenshots(user, ["site:s1"])).map((t) => t.key)).toEqual(["site:s1"]);

    // Hidden projects are never photographed.
    await user.putDocument("config", { version: 1, projects: { "site:s1": { hidden: true } } });
    expect(await planScreenshots(user, ["site:s1"])).toEqual([]);
  });

  it("stores each captured viewport in R2 under the user's prefix and keeps the old one when a viewport fails", async () => {
    const { bucket, objects } = fakeBucket();
    const [target] = await planScreenshots(user, ["site:s1"]);
    await shootProject(user, "u1", bucket, target!, async () => ({ desktop: jpeg(1), mobile: jpeg(2) }), new Date("2026-10-05T00:00:00Z"));
    await shootProject(user, "u1", bucket, target!, async () => ({ desktop: jpeg(3) }), new Date("2026-10-06T00:00:00Z"));

    expect([...objects.keys()].sort()).toEqual(["u1/shop-desktop.jpg", "u1/shop-mobile.jpg"]);
    expect(objects.get("u1/shop-desktop.jpg")).toEqual(jpeg(3));
    expect(await user.listScreenshots()).toEqual([
      { key: "site:s1", viewport: "desktop", file: "shop-desktop.jpg", url: "https://shop.example.dev", takenAt: "2026-10-06T00:00:00.000Z" },
      { key: "site:s1", viewport: "mobile", file: "shop-mobile.jpg", url: "https://shop.example.dev", takenAt: "2026-10-05T00:00:00.000Z" },
    ]);
  });

  it("deletes every image of one user, across pages, and nobody else's", async () => {
    const { bucket, objects } = fakeBucket(2);
    for (const k of ["u1/a.jpg", "u1/b.jpg", "u1/c.jpg", "u10/d.jpg", "u2/e.jpg"]) objects.set(k, jpeg(0));
    await deleteUserImages(bucket, "u1");
    expect([...objects.keys()].sort()).toEqual(["u10/d.jpg", "u2/e.jpg"]);
  });
});
