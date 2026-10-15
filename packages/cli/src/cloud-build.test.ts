import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha1Hex } from "@japs/core";
import { describe, expect, it } from "vitest";
import { cloudBuild } from "./cloud-build.ts";

const BUILD = "0b9f6c1e-1111-4a2b-9c3d-123456789abc";
const API = "https://japs.example.dev";

const portfolio = {
  version: 1,
  generatedAt: "2026-10-16T00:00:00.000Z",
  locales: ["en"],
  defaultLocale: "en",
  profile: { name: "Jane Doe", headline: { en: "Dev" }, bio: { en: "Hi." }, location: null, avatarUrl: null, links: [], email: null, available: null },
  projects: [],
};

function fakeApi(options: { failBuild?: boolean } = {}) {
  const calls: { method: string; url: string; auth?: string; body?: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    calls.push({ method, url, auth, body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body });
    const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (url.startsWith("https://oidc.example/token")) return json({ value: "oidc-token" });
    if (url === `${API}/builder/builds/${BUILD}/input`) {
      return json({
        version: 1,
        buildId: BUILD,
        theme: "default",
        siteUrl: "https://jane.netlify.app",
        portfolio,
        assets: [{ path: "screenshots/shop-desktop.jpg", url: `${API}/builder/builds/${BUILD}/screenshots/shop-desktop.jpg` }],
      });
    }
    if (url.endsWith("/screenshots/shop-desktop.jpg")) return new Response(new Uint8Array([0xff, 0xd8]));
    if (url.endsWith("/deploy")) {
      const files = (JSON.parse(String(init?.body)) as { files: Record<string, string> }).files;
      return json({ required: [files["/index.html"]] });
    }
    return json({ ok: true });
  }) as typeof globalThis.fetch;

  const buildTheme = async (portfolioDir: string) => {
    if (options.failBuild) throw new Error('Theme "default" build failed:\n<secret portfolio text>');
    // The kit serves screenshots from the portfolio directory; the build copies them.
    expect(await readFile(join(portfolioDir, "screenshots/shop-desktop.jpg"))).toEqual(Buffer.from([0xff, 0xd8]));
    const dist = await mkdtemp(join(tmpdir(), "japs-dist-"));
    await mkdir(join(dist, "projects"), { recursive: true });
    await writeFile(join(dist, "index.html"), "<h1>Jane</h1>");
    await writeFile(join(dist, "projects/a.html"), "<h1>A</h1>");
    return dist;
  };
  return { calls, fetch, buildTheme };
}

const env = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example/token?x=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "runner" };

describe("japs cloud-build", () => {
  it("builds from the API's input and uploads only what Netlify needs, with the OIDC token", async () => {
    const api = fakeApi();
    const log: string[] = [];
    await cloudBuild({ buildId: BUILD, api: API, env, fetch: api.fetch, buildTheme: api.buildTheme as never, log: (m) => log.push(m) });

    expect(api.calls.find((c) => c.url.startsWith("https://oidc.example"))?.url).toBe(`https://oidc.example/token?x=1&audience=${encodeURIComponent(API)}`);
    const deploy = api.calls.find((c) => c.url.endsWith("/deploy"))!;
    expect(deploy.body).toEqual({
      files: { "/index.html": await sha1Hex(new TextEncoder().encode("<h1>Jane</h1>")), "/projects/a.html": await sha1Hex(new TextEncoder().encode("<h1>A</h1>")) },
    });
    const puts = api.calls.filter((c) => c.method === "PUT").map((c) => c.url);
    expect(puts).toEqual([`${API}/builder/builds/${BUILD}/files/index.html`]);
    expect(api.calls.filter((c) => c.url.startsWith(API)).every((c) => c.auth === "Bearer oidc-token")).toBe(true);
    expect(api.calls.at(-1)).toMatchObject({ url: `${API}/builder/builds/${BUILD}/finish`, body: { ok: true } });
    expect(log.join("\n")).not.toContain("Jane");
  });

  it("reports a failed theme build without its output, which may contain portfolio text", async () => {
    const api = fakeApi({ failBuild: true });
    await expect(cloudBuild({ buildId: BUILD, api: API, env, fetch: api.fetch, buildTheme: api.buildTheme as never, log: () => {} })).rejects.toThrow(
      /^The theme build failed\.$/,
    );
    expect(api.calls.at(-1)).toMatchObject({ url: `${API}/builder/builds/${BUILD}/finish`, body: { ok: false, message: "The theme build failed." } });
  });

  it("refuses anything but a build id", async () => {
    await expect(cloudBuild({ buildId: "../../etc", api: API, env, fetch: fakeApi().fetch })).rejects.toThrow(/build id/);
  });
});
