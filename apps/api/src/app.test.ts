import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { base64url, decrypt } from "./crypto.ts";
import { Store } from "./db.ts";
import type { Env } from "./env.ts";
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
    expect(res.headers.get("Set-Cookie")).toMatch(/japs_oauth_state=.*HttpOnly.*Secure.*SameSite=Lax/i);
  });

  it("signs in, stores tokens encrypted, and serves /api/me", async () => {
    const { fetch } = fakeProviders();
    const browser = new Browser(createApp({ fetch }));
    const res = await browser.signIn();
    expect(res.headers.get("Location")).toBe("/");
    expect(browser.cookies.get("japs_session")).toMatch(/^[A-Za-z0-9_-]{43}$/);

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
    expect(browser.cookies.has("japs_session")).toBe(false);
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

  it("refuses to import before Netlify is connected", async () => {
    fakeWorkflows();
    const browser = new Browser(createApp({ fetch: fakeProviders().fetch }));
    await browser.signIn();
    const res = await post(browser, "/api/jobs/sync");
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Connect Netlify first.");
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

  it("generates texts for one project only after an import", async () => {
    const started = fakeWorkflows();
    const browser = await signedInWithNetlify();
    expect((await post(browser, "/api/generate", { key: "repo:jane/shop" })).status).toBe(400);

    const store = new Store(env.DB);
    const user = await store.upsertGithubUser({ githubId: 1, login: "janedoe", name: null, avatarUrl: null });
    await store.forUser(user.id).putDocument("projects", { version: 1, projects: [] });
    expect((await post(browser, "/api/generate", { nope: 1 })).status).toBe(400);
    const res = await post(browser, "/api/generate", { key: "repo:jane/shop" });
    expect(res.status).toBe(202);
    expect(started.at(-1)).toMatchObject({ binding: "project", params: { key: "repo:jane/shop" } });
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
