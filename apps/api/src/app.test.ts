import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { base64url, decrypt } from "./crypto.ts";
import { Store } from "./db.ts";
import type { Env } from "./env.ts";
import { fakeBucket } from "./testing/bucket.ts";
import { testDb } from "./testing/sqlite.ts";

/** Response bodies are `unknown` in the Workers types; tests read them loosely. */
const body = async (res: Response | Promise<Response>): Promise<any> => (await res).json();

const APP_URL = "https://japs.example.dev";
let env: Env;

beforeEach(() => {
  env = {
    DB: testDb(),
    APP_URL,
    GITHUB_CLIENT_ID: "gh-client",
    GITHUB_CLIENT_SECRET: "gh-secret",
    NETLIFY_CLIENT_ID: "nf-client",
    NETLIFY_CLIENT_SECRET: "nf-secret",
    SESSION_SECRET: "session-secret",
    ENCRYPTION_KEY: base64url(new Uint8Array(32).fill(3)),
    OPENAI_API_KEY: "sk-owner",
  };
});

/** Fake GitHub + Netlify. `users` maps an OAuth code to the GitHub user it signs in. */
function fakeProviders(users: Record<string, { id: number; login: string }> = { "code-jane": { id: 1, login: "janedoe" } }) {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
    if (url === "https://github.com/login/oauth/access_token") {
      const code = (JSON.parse(String(init?.body)) as { code: string }).code;
      const user = users[code];
      return user
        ? json({ access_token: `gho_${user.login}`, refresh_token: `ghr_${user.login}`, expires_in: 28800 })
        : json({ error: "bad_verification_code", error_description: "The code passed is incorrect or expired." });
    }
    if (url === "https://api.github.com/user") {
      const login = String((init?.headers as Record<string, string>).Authorization).replace("Bearer gho_", "");
      const user = Object.values(users).find((u) => u.login === login)!;
      return json({ id: user.id, login: user.login, name: login, avatar_url: null });
    }
    if (url === "https://api.github.com/applications/gh-client/grant") return new Response(null, { status: 204 });
    if (url === "https://dash.cloudflare.com/oauth2/token") {
      const form = new URLSearchParams(String(init?.body));
      return form.get("code") === "cf-code" && form.get("client_secret") === "cf-secret"
        ? json({ access_token: "cf_access", refresh_token: "cf_refresh", expires_in: 3600 })
        : json({ error: "invalid_grant" }, 400);
    }
    if (url === "https://api.cloudflare.com/client/v4/user") return json({ success: true, result: { email: "jane@example.com" } });
    if (url === "https://dash.cloudflare.com/oauth2/revoke") return json({});
    if (url === "https://api.netlify.com/oauth/token") return json({ access_token: "nf_token" });
    if (url === "https://api.netlify.com/api/v1/user") return json({ email: "jane@example.com" });
    return json({ message: "not found" }, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

/** Minimal cookie jar over Set-Cookie headers. */
class Browser {
  cookies = new Map<string, string>();
  constructor(private app: ReturnType<typeof createApp>) {}

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set("Cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await this.app.request(path, { ...init, headers }, env);
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const [name, value] = pair!.split("=");
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(raw) || value === "") this.cookies.delete(name!);
      else this.cookies.set(name!, value!);
    }
    return res;
  }

  /** Runs the GitHub sign-in round trip with the given OAuth code. */
  async signIn(code = "code-jane") {
    const start = await this.request("/auth/github/login");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    return this.request(`/auth/github/callback?code=${code}&state=${state}`);
  }
}

describe("GitHub sign-in", () => {
  it("redirects to GitHub with our client id, callback URL and a state", async () => {
    const res = await new Browser(createApp()).request("/auth/github/login");
    const location = new URL(res.headers.get("Location")!);
    expect(res.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(location.searchParams.get("client_id")).toBe("gh-client");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP_URL}/auth/github/callback`);
    expect(location.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{22}$/);
    const cookie = res.headers.get("Set-Cookie")!;
    expect(cookie).toMatch(/^__Host-japs_oauth_state=.*Path=\/;.*HttpOnly.*Secure.*SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("signs in, stores tokens encrypted, and serves /api/me", async () => {
    const { fetch } = fakeProviders();
    const browser = new Browser(createApp({ fetch }));
    const res = await browser.signIn();
    expect(res.headers.get("Location")).toBe("/");
    expect(browser.cookies.get("__Host-japs_session")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const me = await body(browser.request("/api/me"));
    expect(me).toMatchObject({ user: { login: "janedoe" }, connections: [{ provider: "github", accountLogin: "janedoe" }] });
    expect(JSON.stringify(me)).not.toContain("gho_");

    const store = new Store(env.DB);
    const user = await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null });
    const stored = await store.forUser(user.id).getConnection("github");
    expect(stored?.accessToken).toMatch(/^v1:/);
    expect(await decrypt(stored!.accessToken, env.ENCRYPTION_KEY)).toBe("gho_janedoe");
    expect(await decrypt(stored!.refreshToken!, env.ENCRYPTION_KEY)).toBe("ghr_janedoe");
  });

  it("rejects a callback without the matching state cookie (CSRF)", async () => {
    const { fetch, calls } = fakeProviders();
    const res = await new Browser(createApp({ fetch })).request("/auth/github/callback?code=code-jane&state=forged");
    expect(res.headers.get("Location")).toMatch(/^\/\?auth_error=Sign-in%20expired/);
    expect(calls).toEqual([]);
  });

  it("turns the redirect after an app installation into a fresh sign-in, ignoring its code", async () => {
    const { fetch, calls } = fakeProviders();
    const res = await new Browser(createApp({ fetch })).request("/auth/github/callback?code=code-jane&installation_id=42&setup_action=install");
    expect(res.headers.get("Location")).toBe("/auth/github/login");
    expect(calls).toEqual([]);
  });

  it("reports a bad code from GitHub without signing in", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    const res = await browser.signIn("code-wrong");
    expect(decodeURIComponent(res.headers.get("Location")!)).toContain("The code passed is incorrect or expired.");
    expect(browser.cookies.has("__Host-japs_session")).toBe(false);
  });
});

describe("sessions and API access", () => {
  it("refuses the API without a session", async () => {
    expect((await new Browser(createApp()).request("/api/me")).status).toBe(401);
  });

  it("logs out only from our own origin", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    expect((await browser.request("/auth/logout", { method: "POST" })).status).toBe(403);
    expect((await browser.request("/auth/logout", { method: "POST", headers: { Origin: "https://evil.example" } })).status).toBe(403);

    const res = await browser.request("/auth/logout", { method: "POST", headers: { Origin: APP_URL } });
    expect(res.status).toBe(200);
    expect((await browser.request("/api/me")).status).toBe(401);
  });

  it("keeps users apart", async () => {
    const { fetch } = fakeProviders({ "code-jane": { id: 1, login: "janedoe" }, "code-john": { id: 2, login: "johndoe" } });
    const jane = new Browser(createApp({ fetch }));
    const john = new Browser(createApp({ fetch }));
    await jane.signIn("code-jane");
    await john.signIn("code-john");
    expect((await body(john.request("/api/me"))).user.login).toBe("johndoe");
    expect((await body(jane.request("/api/me"))).user.login).toBe("janedoe");
  });

  it("fails loudly when a secret is missing", async () => {
    env.ENCRYPTION_KEY = "";
    const res = await new Browser(createApp()).request("/api/me");
    expect(res.status).toBe(500);
    expect((await body(res)).error).toContain("ENCRYPTION_KEY");
  });
});

describe("Netlify connect", () => {
  it("requires sign-in, then stores the encrypted token and shows the account", async () => {
    const { fetch } = fakeProviders();
    const browser = new Browser(createApp({ fetch }));
    expect((await browser.request("/auth/netlify/connect")).headers.get("Location")).toBe("/auth/github/login");

    await browser.signIn();
    const start = await browser.request("/auth/netlify/connect");
    const location = new URL(start.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://app.netlify.com/authorize");
    expect(location.searchParams.get("response_type")).toBe("code");

    const state = location.searchParams.get("state")!;
    expect((await browser.request(`/auth/netlify/callback?code=nf-code&state=${state}`)).headers.get("Location")).toBe("/");
    const me = await body(browser.request("/api/me"));
    expect(me.connections).toContainEqual(expect.objectContaining({ provider: "netlify", accountLogin: "jane@example.com" }));

    // A GitHub state can't be replayed for Netlify.
    const gh = await browser.request("/auth/github/login");
    const ghState = new URL(gh.headers.get("Location")!).searchParams.get("state")!;
    expect((await browser.request(`/auth/netlify/callback?code=nf-code&state=${ghState}`)).headers.get("Location")).toMatch(/auth_error/);
  });

  it("disconnects Netlify but never the GitHub sign-in", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const del = (provider: string) => browser.request(`/api/connections/${provider}`, { method: "DELETE", headers: { Origin: APP_URL } });
    expect((await del("github")).status).toBe(400);
    expect((await del("netlify")).status).toBe(200);
  });
});

describe("editor API", () => {
  const put = (browser: Browser, config: unknown) =>
    browser.request("/api/config", {
      method: "PUT",
      headers: { Origin: APP_URL, "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });

  it("gives a new user a starter config prefilled from GitHub", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const state = await body(browser.request("/api/state"));
    expect(state).toMatchObject({
      mode: "cloud",
      configExists: false,
      config: { version: 1, profile: { name: "janedoe", links: [{ label: "GitHub", url: "https://github.com/janedoe" }] } },
      projects: null,
      analysis: null,
    });
  });

  it("stores a valid config as sent, rejects an invalid one, and keeps users apart", async () => {
    const { fetch } = fakeProviders({ "code-jane": { id: 1, login: "janedoe" }, "code-john": { id: 2, login: "johndoe" } });
    const jane = new Browser(createApp({ fetch }));
    const john = new Browser(createApp({ fetch }));
    await jane.signIn("code-jane");
    await john.signIn("code-john");

    const bad = await put(jane, { version: 1, projects: { "site:x": { hiden: true } } });
    expect(bad.status).toBe(400);
    expect((await body(bad)).issues).toEqual(["projects.site:x: Unrecognized key(s) in object: 'hiden'"]);

    const config = { version: 1, locales: ["en"], projects: { "site:x": { featured: true } } };
    expect((await put(jane, config)).status).toBe(200);
    expect(await body(jane.request("/api/state"))).toMatchObject({ configExists: true, config });
    expect((await body(john.request("/api/state"))).configExists).toBe(false);
  });

  it("requires sign-in and our origin for saving", async () => {
    const anonymous = new Browser(createApp());
    expect((await put(anonymous, { version: 1 })).status).toBe(401);
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const res = await browser.request("/api/config", { method: "PUT", body: JSON.stringify({ version: 1 }) });
    expect(res.status).toBe(403);
  });

  it("serves the dashboard for other GET paths, but not for unknown API paths", async () => {
    env.ASSETS = { fetch: async (req: Request) => new Response(`dashboard ${new URL(req.url).pathname}`) };
    const browser = new Browser(createApp());
    expect(await (await browser.request("/projects/x")).text()).toBe("dashboard /projects/x");
    expect((await browser.request("/api/nope")).status).toBe(401);
  });
});

describe("jobs API", () => {
  /** Records workflow starts instead of running them. */
  function fakeWorkflows() {
    const started: { binding: string; params: unknown }[] = [];
    const binding = (name: string) => ({
      create: async (o: { params: unknown }) => (started.push({ binding: name, params: o.params }), { id: `wf-${started.length}` }),
      createBatch: async (batch: { params: unknown }[]) => batch.map((o) => (started.push({ binding: name, params: o.params }), { id: "wf" })),
    });
    env.SYNC_JOBS = binding("sync") as Env["SYNC_JOBS"];
    env.PROJECT_JOBS = binding("project") as Env["PROJECT_JOBS"];
    return started;
  }
  const post = (browser: Browser, path: string, json?: unknown) =>
    browser.request(path, {
      method: "POST",
      headers: { Origin: APP_URL, "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  async function signedInWithNetlify() {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const start = await browser.request("/auth/netlify/connect");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    await browser.request(`/auth/netlify/callback?code=nf&state=${state}`);
    return browser;
  }

  it("refuses to import before Netlify or Cloudflare is connected", async () => {
    fakeWorkflows();
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const res = await post(browser, "/api/jobs/sync");
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Connect Netlify or Cloudflare first.");
  });

  it("starts one import workflow per user and refuses a second while it runs", async () => {
    const started = fakeWorkflows();
    const browser = await signedInWithNetlify();
    const first = await post(browser, "/api/jobs/sync");
    expect(first.status).toBe(202);
    const { job } = await body(first);
    expect(job).toMatchObject({ kind: "sync", status: "running" });
    expect(started).toEqual([{ binding: "sync", params: { userId: expect.any(String), jobId: job.id } }]);

    expect((await post(browser, "/api/jobs/sync")).status).toBe(409);
    expect((await body(browser.request("/api/jobs/latest"))).job.id).toBe(job.id);
    expect((await body(browser.request("/api/state"))).job.id).toBe(job.id);
  });

  it("generates texts only for the picked, known projects, after an import", async () => {
    const started = fakeWorkflows();
    const browser = await signedInWithNetlify();
    expect((await post(browser, "/api/generate", { keys: ["repo:jane/shop"] })).status).toBe(400);

    const store = new Store(env.DB);
    const user = await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null });
    await store.forUser(user.id).putDocument("projects", { version: 1, projects: [{ key: "repo:jane/shop" }, { key: "repo:jane/blog" }] });
    expect((await post(browser, "/api/generate", { keys: [] })).status).toBe(400);
    expect((await post(browser, "/api/generate", { key: "repo:jane/shop" })).status).toBe(400);
    const unknown = await post(browser, "/api/generate", { keys: ["repo:jane/nope"] });
    expect((await body(unknown)).error).toBe("Unknown projects: repo:jane/nope");

    const res = await post(browser, "/api/generate", { keys: ["repo:jane/shop", "repo:jane/blog", "repo:jane/shop"] });
    expect(res.status).toBe(202);
    expect((await body(res)).job).toMatchObject({ kind: "generate", total: 2 });
    expect(started.filter((s) => s.binding === "project").map((s) => (s.params as { key: string }).key)).toEqual([
      "repo:jane/shop",
      "repo:jane/blog",
    ]);
  });

  it("assembles per-project analysis into the analysis.json shape for the editor", async () => {
    const browser = await signedInWithNetlify();
    const store = new Store(env.DB);
    const user = await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null });
    await store.forUser(user.id).putProjectDoc("repo:jane/shop", "analysis", { key: "repo:jane/shop", copy: { title: { en: "Shop" } } });
    const state = await body(browser.request("/api/state"));
    expect(state.analysis).toMatchObject({ version: 1, locales: ["en"], projects: [{ key: "repo:jane/shop" }] });
  });
});

describe("AI quota and own key", () => {
  const put = (browser: Browser, json: unknown) =>
    browser.request("/api/llm", { method: "PUT", headers: { Origin: APP_URL, "Content-Type": "application/json" }, body: JSON.stringify(json) });
  const generate = (browser: Browser, keys: string[]) =>
    browser.request("/api/generate", { method: "POST", headers: { Origin: APP_URL, "Content-Type": "application/json" }, body: JSON.stringify({ keys }) });

  async function setup(used: number) {
    env.JAPS_FREE_GENERATIONS = "3";
    env.PROJECT_JOBS = { create: async () => ({ id: "x" }), createBatch: async (b: unknown[]) => b.map(() => ({ id: "x" })) } as Env["PROJECT_JOBS"];
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const store = new Store(env.DB);
    const user = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null })).id);
    await user.putDocument("projects", { projects: ["a", "b", "c", "d"].map((k) => ({ key: `repo:jane/${k}` })) });
    await user.addUsage(new Date().toISOString().slice(0, 7), { generations: used, inputTokens: 0, outputTokens: 0 });
    return { browser, user };
  }

  it("reports usage, the limit and the install link in /api/me", async () => {
    env.GITHUB_APP_SLUG = "japs-portfolio";
    const { browser } = await setup(1);
    const me = await body(browser.request("/api/me"));
    expect(me.quota).toMatchObject({ used: 1, limit: 3, remaining: 2, ownKey: null, shared: true });
    expect(me.githubAppInstallUrl).toBe("https://github.com/apps/japs-portfolio/installations/new");
  });

  it("refuses more projects than the free generations left", async () => {
    const { browser } = await setup(2);
    const res = await generate(browser, ["repo:jane/a", "repo:jane/b"]);
    expect(res.status).toBe(402);
    expect((await body(res)).error).toContain("only 1 left");
    expect((await generate(browser, ["repo:jane/a"])).status).toBe(202);
  });

  it("stores an own key encrypted, never returns it, and lifts the limit", async () => {
    const { browser, user } = await setup(3);
    expect((await put(browser, { provider: "ollama", apiKey: "x" })).status).toBe(400);
    expect((await put(browser, { provider: "gemini", apiKey: "g-key" })).status).toBe(400); // gemini has no default model
    expect((await put(browser, { provider: "openai", apiKey: "sk-user-own-key" })).status).toBe(200);

    const stored = await user.getConnection("llm");
    expect(stored?.meta).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect(await decrypt(stored!.accessToken, env.ENCRYPTION_KEY)).toBe("sk-user-own-key");
    const me = await body(browser.request("/api/me"));
    expect(JSON.stringify(me)).not.toContain("sk-user-own-key");
    expect(me.quota.ownKey).toEqual({ provider: "openai", model: "gpt-5-mini" });
    expect((await generate(browser, ["repo:jane/a", "repo:jane/b", "repo:jane/c", "repo:jane/d"])).status).toBe(202);

    const del = await browser.request("/api/connections/llm", { method: "DELETE", headers: { Origin: APP_URL } });
    expect(del.status).toBe(200);
    expect((await generate(browser, ["repo:jane/a"])).status).toBe(402);
  });
});

describe("account deletion", () => {
  const del = (browser: Browser, json: unknown, origin = APP_URL) =>
    browser.request("/api/account", { method: "DELETE", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(json) });
  const count = async (table: string) =>
    ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()) as { n: number }).n;

  it("needs the GitHub login typed and our origin", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    expect((await del(browser, { confirm: "janedoe" }, "https://evil.example")).status).toBe(403);
    expect((await del(browser, {})).status).toBe(400);
    expect((await del(browser, { confirm: "johndoe" })).status).toBe(400);
    expect((await browser.request("/api/me")).status).toBe(200);
  });

  it("revokes the GitHub authorization and deletes only this user's data", async () => {
    const { fetch, calls } = fakeProviders({ "code-jane": { id: 1, login: "janedoe" }, "code-john": { id: 2, login: "johndoe" } });
    const jane = new Browser(createApp({ fetch }));
    const john = new Browser(createApp({ fetch }));
    await jane.signIn("code-jane");
    await john.signIn("code-john");
    const store = new Store(env.DB);
    for (const login of ["janedoe", "johndoe"]) {
      const user = store.forUser((await store.upsertGithubUser({ githubId: login === "janedoe" ? 1 : 2, login, name: null, avatarUrl: null })).id);
      await user.putDocument("config", { version: 1 });
      await user.putProjectDoc("repo:x/y", "facts", { key: "repo:x/y" });
      await user.addUsage("2026-10", { generations: 1, inputTokens: 1, outputTokens: 1 });
    }

    const res = await del(jane, { confirm: "janedoe" });
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({ ok: true, githubRevoked: true });
    expect(calls).toContain("DELETE https://api.github.com/applications/gh-client/grant");
    expect((await jane.request("/api/me")).status).toBe(401);

    for (const table of ["users", "sessions", "connections", "documents", "project_docs", "usage"]) {
      expect(await count(table), table).toBe(1);
    }
    expect((await body(john.request("/api/me"))).user.login).toBe("johndoe");
  });
});

describe("screenshots API", () => {
  async function twoUsers() {
    const { bucket, objects } = fakeBucket();
    env.SHOTS = bucket;
    const { fetch } = fakeProviders({ "code-jane": { id: 1, login: "janedoe" }, "code-john": { id: 2, login: "johndoe" } });
    const jane = new Browser(createApp({ fetch }));
    const john = new Browser(createApp({ fetch }));
    await jane.signIn("code-jane");
    await john.signIn("code-john");
    const store = new Store(env.DB);
    const janeId = (await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null })).id;
    const johnId = (await store.upsertGithubUser({ githubId: 2, login: "johndoe", name: null, avatarUrl: null })).id;
    objects.set(`${janeId}/shop-desktop.jpg`, new Uint8Array([0xff, 0xd8, 1]));
    await store.forUser(janeId).putScreenshot({ key: "site:s1", viewport: "desktop", file: "shop-desktop.jpg", url: "https://shop.example.dev", takenAt: "2026-10-05T00:00:00.000Z" });
    return { jane, john, objects, janeId, johnId };
  }

  it("serves a user's own images only, and lists them in the state", async () => {
    const { jane, john } = await twoUsers();
    const own = await jane.request("/api/screenshots/shop-desktop.jpg");
    expect(own.status).toBe(200);
    expect(own.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 1]));

    expect((await john.request("/api/screenshots/shop-desktop.jpg")).status).toBe(404);
    expect((await jane.request("/api/screenshots/..%2Fother.jpg")).status).toBe(404);
    expect((await new Browser(createApp()).request("/api/screenshots/shop-desktop.jpg")).status).toBe(401);

    expect((await body(jane.request("/api/state"))).screenshots.shots).toEqual([expect.objectContaining({ key: "site:s1", file: "shop-desktop.jpg" })]);
    expect((await body(john.request("/api/state"))).screenshots).toEqual({ version: 1, shots: [] });
  });

  it("deletes a user's images with the account", async () => {
    const { jane, objects, johnId } = await twoUsers();
    objects.set(`${johnId}/blog-desktop.jpg`, new Uint8Array([1]));
    const res = await jane.request("/api/account", { method: "DELETE", headers: { Origin: APP_URL, "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "janedoe" }) });
    expect(res.status).toBe(200);
    expect([...objects.keys()]).toEqual([`${johnId}/blog-desktop.jpg`]);
  });

  it("starts screenshots for the projects whose texts are generated", async () => {
    const shots: unknown[] = [];
    env.PROJECT_JOBS = { create: async () => ({ id: "x" }), createBatch: async (b: unknown[]) => b.map(() => ({ id: "x" })) } as Env["PROJECT_JOBS"];
    env.SHOT_JOBS = { create: async (o: { params: unknown }) => (shots.push(o.params), { id: "s" }), createBatch: async () => [] } as Env["SHOT_JOBS"];
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const store = new Store(env.DB);
    const user = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null })).id);
    await user.putDocument("projects", { projects: [{ key: "site:s1" }] });
    const res = await browser.request("/api/generate", { method: "POST", headers: { Origin: APP_URL, "Content-Type": "application/json" }, body: JSON.stringify({ keys: ["site:s1"] }) });
    expect(res.status).toBe(202);
    expect(shots).toEqual([{ userId: expect.any(String), keys: ["site:s1"] }]);
  });
});

describe("Cloudflare connect (ADR 0012)", () => {
  const enable = () => {
    env.CLOUDFLARE_CLIENT_ID = "cf-client";
    env.CLOUDFLARE_CLIENT_SECRET = "cf-secret";
  };

  it("is not offered without an OAuth client on the server", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    expect((await body(browser.request("/api/me"))).cloudflareAvailable).toBe(false);
    expect((await browser.request("/auth/cloudflare/connect")).headers.get("Location")).toMatch(/auth_error/);
  });

  it("asks for Pages access, stores the tokens encrypted, and lets a Cloudflare-only user import", async () => {
    enable();
    const started: unknown[] = [];
    env.SYNC_JOBS = { create: async (o: { params: unknown }) => (started.push(o.params), { id: "w" }), createBatch: async () => [] } as Env["SYNC_JOBS"];
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();

    const start = await browser.request("/auth/cloudflare/connect");
    const location = new URL(start.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe("https://dash.cloudflare.com/oauth2/auth");
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP_URL}/auth/cloudflare/callback`);
    expect(location.searchParams.get("scope")?.split(" ")).toEqual(expect.arrayContaining(["page.read", "page.write", "offline_access"]));

    // A state from another provider can't be replayed here.
    const nf = new URL((await browser.request("/auth/netlify/connect")).headers.get("Location")!).searchParams.get("state")!;
    expect((await browser.request(`/auth/cloudflare/callback?code=cf-code&state=${nf}`)).headers.get("Location")).toMatch(/auth_error/);

    const again = new URL((await browser.request("/auth/cloudflare/connect")).headers.get("Location")!).searchParams.get("state")!;
    expect((await browser.request(`/auth/cloudflare/callback?code=cf-code&state=${again}`)).headers.get("Location")).toBe("/");

    const me = await body(browser.request("/api/me"));
    expect(me.connections).toContainEqual(expect.objectContaining({ provider: "cloudflare", accountLogin: "jane@example.com" }));
    expect(JSON.stringify(me)).not.toContain("cf_access");
    const store = new Store(env.DB);
    const jane = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null })).id);
    const stored = await jane.getConnection("cloudflare");
    expect(await decrypt(stored!.accessToken, env.ENCRYPTION_KEY)).toBe("cf_access");
    expect(await decrypt(stored!.refreshToken!, env.ENCRYPTION_KEY)).toBe("cf_refresh");

    // Netlify isn't needed any more to import.
    const sync = await browser.request("/api/jobs/sync", { method: "POST", headers: { Origin: APP_URL } });
    expect(sync.status).toBe(202);
    expect(started).toHaveLength(1);
  });

  it("revokes the token on disconnect", async () => {
    enable();
    const { fetch, calls } = fakeProviders();
    const browser = new Browser(createApp({ fetch }));
    await browser.signIn();
    const state = new URL((await browser.request("/auth/cloudflare/connect")).headers.get("Location")!).searchParams.get("state")!;
    await browser.request(`/auth/cloudflare/callback?code=cf-code&state=${state}`);

    const res = await browser.request("/api/connections/cloudflare", { method: "DELETE", headers: { Origin: APP_URL } });
    expect(res.status).toBe(200);
    expect(calls).toContain("POST https://dash.cloudflare.com/oauth2/revoke");
    expect((await body(browser.request("/api/me"))).connections.map((c: { provider: string }) => c.provider)).not.toContain("cloudflare");
  });
});

describe("cookies on a shared domain (portfolios on subdomains)", () => {
  it("sets the session as a __Host- cookie, which no subdomain can set or overwrite", async () => {
    const res = await new Browser(createApp({ fetch: fakeProviders().fetch })).signIn();
    const session = res.headers.getSetCookie().find((c) => c.startsWith("__Host-japs_session="));
    expect(session).toMatch(/Path=\/;.*HttpOnly.*Secure.*SameSite=Lax/i);
    expect(session).not.toMatch(/Domain=/i);
  });

  it("ignores a session under the unprefixed name, as a subdomain could plant it", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const token = browser.cookies.get("__Host-japs_session")!;
    const planted = await createApp().request("/api/me", { headers: { Cookie: `japs_session=${token}` } }, env);
    expect(planted.status).toBe(401);
  });

  it("ignores an unprefixed OAuth state cookie, so a planted state can't complete a callback", async () => {
    const { fetch, calls } = fakeProviders();
    const browser = new Browser(createApp({ fetch }));
    const start = await browser.request("/auth/github/login");
    const state = new URL(start.headers.get("Location")!).searchParams.get("state")!;
    const signed = browser.cookies.get("__Host-japs_oauth_state")!;
    const res = await createApp({ fetch }).request(
      `/auth/github/callback?code=code-jane&state=${state}`,
      { headers: { Cookie: `japs_oauth_state=${signed}` } },
      env,
    );
    expect(res.headers.get("Location")).toMatch(/^\/\?auth_error=Sign-in%20expired/);
    expect(calls).toEqual([]);
  });

  it("uses the plain names on http://localhost, where browsers refuse __Host- cookies", async () => {
    env.APP_URL = "http://localhost:8787";
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    const res = await browser.signIn();
    const session = res.headers.getSetCookie().find((c) => c.startsWith("japs_session="));
    expect(session).toMatch(/Path=\/;.*HttpOnly/i);
    expect(session).not.toMatch(/Secure/i);
    expect((await browser.request("/api/me")).status).toBe(200);
  });

  it("logs out by expiring the __Host- session cookie", async () => {
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const res = await browser.request("/auth/logout", { method: "POST", headers: { Origin: APP_URL } });
    expect(res.headers.getSetCookie().find((c) => c.startsWith("__Host-japs_session="))).toMatch(/Max-Age=0.*Path=\/;.*Secure/i);
    expect(browser.cookies.has("__Host-japs_session")).toBe(false);
    expect((await browser.request("/api/me")).status).toBe(401);
  });
});
