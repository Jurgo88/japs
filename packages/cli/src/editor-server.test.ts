import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEditorServer } from "./editor-server.ts";
import { resolveWorkspace } from "./workspace.ts";

let dir: string;
let base: string;
let close: () => Promise<void>;
const TOKEN = "t0ken";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "japs-edit-"));
  const dashboard = join(dir, "dashboard");
  await mkdir(join(dashboard, "assets"), { recursive: true });
  await writeFile(join(dashboard, "index.html"), "<html><head><title>x</title></head><body></body></html>");
  await writeFile(join(dashboard, "assets", "app.js"), "console.log(1)");
  await writeFile(join(dir, "secret.txt"), "nope");

  const { server } = createEditorServer(resolveWorkspace(dir), { dashboardDir: dashboard, token: TOKEN });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((r) => server.close(() => r()));
});
afterEach(async () => {
  await close();
  await rm(dir, { recursive: true, force: true });
});

const put = (body: unknown, token: string | null = TOKEN) =>
  fetch(`${base}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { "X-Japs-Token": token } : {}) },
    body: JSON.stringify(body),
  });

describe("editor server", () => {
  it("serves the dashboard with the session token, and its assets", async () => {
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain(`<meta name="japs-token" content="${TOKEN}" />`);
    expect(await (await fetch(`${base}/assets/app.js`)).text()).toBe("console.log(1)");
    // Client-side routes fall back to index.html.
    expect(await (await fetch(`${base}/projects/x`)).text()).toContain("japs-token");
  });

  it("never serves files outside the dashboard", async () => {
    const res = await fetch(`${base}/..%2Fsecret.txt`);
    expect(await res.text()).not.toContain("nope");
  });

  it("returns a starter config and nulls when the workspace is empty", async () => {
    const state = await (await fetch(`${base}/api/state`)).json();
    expect(state).toMatchObject({ configExists: false, config: { version: 1 }, projects: null, analysis: null, built: false });
  });

  it("requires the token for writes", async () => {
    expect((await put({ version: 1 }, null)).status).toBe(403);
    expect((await put({ version: 1 }, "wrong")).status).toBe(403);
  });

  it("rejects an invalid config with readable issues and leaves the file alone", async () => {
    const res = await put({ version: 1, projects: { "site:x": { hiden: true } } });
    expect(res.status).toBe(400);
    expect((await res.json()).issues).toEqual(["projects.site:x: Unrecognized key(s) in object: 'hiden'"]);
  });

  it("writes exactly what the editor sent, without filling in defaults", async () => {
    const config = { version: 1, locales: ["en"], projects: { "site:x": { featured: true } } };
    expect((await put(config)).status).toBe(200);
    expect(JSON.parse(await readFile(join(dir, "japs.config.json"), "utf8"))).toEqual(config);
    expect((await (await fetch(`${base}/api/state`)).json()).configExists).toBe(true);
  });

  it("reports what is missing when building too early", async () => {
    await put({ version: 1, profile: { name: "Jane", headline: { en: "" }, bio: { en: "" } } });
    const res = await fetch(`${base}/api/build`, { method: "POST", headers: { "X-Japs-Token": TOKEN } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Run `japs discover` first");
  });

  it("publishes only with the token, and reports the last publish from publish.json", async () => {
    expect((await fetch(`${base}/api/publish`, { method: "POST", body: "{}" })).status).toBe(403);
    expect(await (await fetch(`${base}/api/publish/latest`)).json()).toEqual({ publish: null });

    const state = {
      version: 1,
      siteId: "site-1",
      siteName: "jane-portfolio",
      url: "https://jane-portfolio.netlify.app",
      adminUrl: null,
      lastDeploy: { id: "dep-1", url: "https://jane-portfolio.netlify.app", draft: false, at: "2026-10-16T10:00:00.000Z" },
    };
    await writeFile(resolveWorkspace(dir).publish, JSON.stringify(state));
    expect((await (await fetch(`${base}/api/publish/latest`)).json()).publish).toEqual({
      id: "dep-1",
      status: "live",
      draft: false,
      siteUrl: "https://jane-portfolio.netlify.app",
      url: "https://jane-portfolio.netlify.app",
      message: null,
      createdAt: "2026-10-16T10:00:00.000Z",
    });
  });

  it("refuses requests for another host name (DNS rebinding)", async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const { port } = new URL(base);
      request({ host: "127.0.0.1", port, path: "/api/state", headers: { Host: "evil.example" } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
        .on("error", reject)
        .end();
    });
    expect(status).toBe(403);
  });
});
