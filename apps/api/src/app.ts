import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  exchangeGithubCode,
  exchangeNetlifyCode,
  fetchGithubUser,
  fetchNetlifyUser,
  GITHUB_AUTHORIZE,
  NETLIFY_AUTHORIZE,
  OAuthError,
} from "./auth/oauth.ts";
import { encrypt, randomToken, sha256, sign, unsign } from "./crypto.ts";
import { type Job, Store, type User } from "./db.ts";
import { wrapAnalysis } from "./pipeline.ts";
import { type Env, REQUIRED_SECRETS } from "./env.ts";
import { JapsConfig, type ProjectAnalysis } from "@japs/schema";

/**
 * Hosted JAPS API (ADR 0009): GitHub sign-in, Netlify connect, sessions.
 * `deps` lets tests replace the network and the clock.
 */

const SESSION_COOKIE = "japs_session";
const STATE_COOKIE = "japs_oauth_state";
const SESSION_DAYS = 30;

type Vars = { user: User | null; store: Store };
type AppContext = Context<{ Bindings: Env; Variables: Vars }>;

export interface AppDeps {
  fetch?: typeof fetch;
  now?: () => Date;
}

const secure = (env: Env) => !env.APP_URL.startsWith("http://localhost") && !env.APP_URL.startsWith("http://127.0.0.1");

export function createApp(deps: AppDeps = {}) {
  const fetchImpl = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Bindings: Env; Variables: Vars }>();

  app.use("*", async (c, next) => {
    const missing = REQUIRED_SECRETS.filter((k) => !c.env[k]);
    if (missing.length) return c.json({ error: `Server is not configured: missing ${missing.join(", ")}` }, 500);

    const store = new Store(c.env.DB, now);
    c.set("store", store);
    const token = getCookie(c, SESSION_COOKIE);
    c.set("user", token ? await store.sessionUser(await sha256(token)) : null);
    await next();
  });

  // CSRF: state-changing requests must come from our own origin (cookies are SameSite=Lax too).
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("Origin");
      if (origin !== new URL(c.env.APP_URL).origin) return c.json({ error: "Cross-origin request refused" }, 403);
    }
    await next();
  });

  const redirectUri = (c: AppContext, provider: "github" | "netlify") =>
    new URL(`/auth/${provider}/callback`, c.env.APP_URL).toString();

  /** Random state in a signed, short-lived cookie; the callback must bring the same value back. */
  async function startOAuth(c: AppContext, provider: "github" | "netlify"): Promise<string> {
    const state = randomToken(16);
    setCookie(c, STATE_COOKIE, await sign(`${provider}:${state}`, c.env.SESSION_SECRET), {
      httpOnly: true,
      secure: secure(c.env),
      sameSite: "Lax",
      path: "/auth",
      maxAge: 600,
    });
    return state;
  }

  async function checkState(c: AppContext, provider: "github" | "netlify"): Promise<boolean> {
    const cookie = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/auth" });
    const expected = cookie ? await unsign(cookie, c.env.SESSION_SECRET) : null;
    const state = c.req.query("state");
    return expected !== null && state !== undefined && expected === `${provider}:${state}`;
  }

  const fail = (c: AppContext, message: string) => c.redirect(`/?auth_error=${encodeURIComponent(message)}`);

  app.get("/auth/github/login", async (c) => {
    const url = new URL(GITHUB_AUTHORIZE);
    url.searchParams.set("client_id", c.env.GITHUB_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri(c, "github"));
    url.searchParams.set("state", await startOAuth(c, "github"));
    return c.redirect(url.toString());
  });

  app.get("/auth/github/callback", async (c) => {
    // Installing the app on GitHub redirects here with a code but without our state. That code
    // isn't bound to this browser, so it's not used: a normal sign-in starts instead, which
    // completes at once because the user has just authorized the app.
    if (c.req.query("setup_action") && !c.req.query("state")) return c.redirect("/auth/github/login");
    if (!(await checkState(c, "github"))) return fail(c, "Sign-in expired or was tampered with. Please try again.");
    const code = c.req.query("code");
    if (!code) return fail(c, c.req.query("error_description") ?? "GitHub sign-in was cancelled.");
    try {
      const tokens = await exchangeGithubCode(fetchImpl, {
        clientId: c.env.GITHUB_CLIENT_ID,
        clientSecret: c.env.GITHUB_CLIENT_SECRET,
        code,
        redirectUri: redirectUri(c, "github"),
      }, now());
      const profile = await fetchGithubUser(fetchImpl, tokens.accessToken);
      const store = c.get("store");
      const user = await store.upsertGithubUser(profile);
      await store.forUser(user.id).setConnection({
        provider: "github",
        accountLogin: profile.login,
        accessToken: await encrypt(tokens.accessToken, c.env.ENCRYPTION_KEY),
        refreshToken: tokens.refreshToken ? await encrypt(tokens.refreshToken, c.env.ENCRYPTION_KEY) : null,
        expiresAt: tokens.expiresAt,
        meta: null,
      });

      const session = randomToken();
      await store.createSession(user.id, await sha256(session), SESSION_DAYS);
      setCookie(c, SESSION_COOKIE, session, {
        httpOnly: true,
        secure: secure(c.env),
        sameSite: "Lax",
        path: "/",
        maxAge: SESSION_DAYS * 86_400,
      });
      return c.redirect("/");
    } catch (err) {
      if (err instanceof OAuthError) return fail(c, err.message);
      throw err;
    }
  });

  app.post("/auth/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await c.get("store").deleteSession(await sha256(token));
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.get("/auth/netlify/connect", async (c) => {
    if (!c.get("user")) return c.redirect("/auth/github/login");
    const url = new URL(NETLIFY_AUTHORIZE);
    url.searchParams.set("client_id", c.env.NETLIFY_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri(c, "netlify"));
    url.searchParams.set("state", await startOAuth(c, "netlify"));
    return c.redirect(url.toString());
  });

  app.get("/auth/netlify/callback", async (c) => {
    const user = c.get("user");
    if (!user) return fail(c, "Sign in first, then connect Netlify.");
    if (!(await checkState(c, "netlify"))) return fail(c, "Netlify connection expired or was tampered with. Please try again.");
    const code = c.req.query("code");
    if (!code) return fail(c, "Netlify connection was cancelled.");
    try {
      const token = await exchangeNetlifyCode(fetchImpl, {
        clientId: c.env.NETLIFY_CLIENT_ID,
        clientSecret: c.env.NETLIFY_CLIENT_SECRET,
        code,
        redirectUri: redirectUri(c, "netlify"),
      });
      const account = await fetchNetlifyUser(fetchImpl, token);
      await c.get("store").forUser(user.id).setConnection({
        provider: "netlify",
        accountLogin: account.login,
        accessToken: await encrypt(token, c.env.ENCRYPTION_KEY),
        refreshToken: null,
        expiresAt: null,
        meta: null,
      });
      return c.redirect("/");
    } catch (err) {
      if (err instanceof OAuthError) return fail(c, err.message);
      throw err;
    }
  });

  // --- API (signed-in users only) ---

  app.use("/api/*", async (c, next) => {
    if (!c.get("user")) return c.json({ error: "Not signed in" }, 401);
    await next();
  });

  app.get("/api/me", async (c) => {
    const user = c.get("user")!;
    return c.json({
      user: { login: user.githubLogin, name: user.name, avatarUrl: user.avatarUrl },
      connections: await c.get("store").forUser(user.id).listConnections(),
    });
  });

  // GitHub is the sign-in itself; only Netlify and an own LLM key can be disconnected.
  app.delete("/api/connections/:provider", async (c) => {
    const provider = c.req.param("provider");
    if (provider !== "netlify" && provider !== "llm") return c.json({ error: "Cannot disconnect this provider" }, 400);
    await c.get("store").forUser(c.get("user")!.id).deleteConnection(provider);
    return c.json({ ok: true });
  });

  // --- Editor API: same shape as the local `japs edit` server, so one dashboard serves both ---

  /** A first config for a new user: their GitHub name and profile link prefilled. */
  const starterConfig = (user: User) => ({
    version: 1,
    locales: ["en"],
    defaultLocale: "en",
    profile: {
      name: user.name ?? user.githubLogin,
      headline: { en: "" },
      bio: { en: "" },
      location: null,
      links: [{ label: "GitHub", url: `https://github.com/${user.githubLogin}` }],
    },
  });

  app.get("/api/state", async (c) => {
    const user = c.get("user")!;
    const store = c.get("store").forUser(user.id);
    const config = await store.getDocument("config");
    const analysis = await store.listProjectDocs("analysis");
    return c.json({
      mode: "cloud",
      configExists: config !== null,
      config: config ?? starterConfig(user),
      projects: await store.getDocument("projects"),
      // Stored per project (#32); the dashboard reads the analysis.json shape.
      analysis: analysis.length
        ? wrapAnalysis(analysis.map((a) => a.body as ProjectAnalysis), (config as { locales?: string[] } | null)?.locales ?? ["en"], now())
        : null,
      screenshots: await store.getDocument("screenshots"),
      built: false,
      job: await store.latestJob(),
    });
  });

  app.put("/api/config", async (c) => {
    const body: unknown = await c.req.json().catch(() => undefined);
    const parsed = JapsConfig.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
      return c.json({ error: "Invalid config", issues }, 400);
    }
    // Stored as sent (minimal, ADR 0007), not the parsed form with defaults.
    await c.get("store").forUser(c.get("user")!.id).putDocument("config", body);
    return c.json({ ok: true });
  });

  // --- Background jobs (#32): import + texts run in Workflows, the dashboard polls ---

  /** A job counts as running only while it reports progress; a stuck one doesn't block forever. */
  const isActive = (job: Job | null) =>
    job !== null && job.status === "running" && now().getTime() - Date.parse(job.updatedAt) < 15 * 60_000;

  app.post("/api/jobs/sync", async (c) => {
    const user = c.get("user")!;
    const store = c.get("store").forUser(user.id);
    if (!c.env.SYNC_JOBS) return c.json({ error: "Background jobs are not configured on this server." }, 501);
    if (!(await store.getConnection("netlify"))) return c.json({ error: "Connect Netlify first." }, 400);
    const running = await store.latestJob();
    if (isActive(running)) return c.json({ job: running }, 409);

    const jobId = await store.createJob("sync", 0, "Importing sites and repositories…");
    await c.env.SYNC_JOBS.create({ params: { userId: user.id, jobId } });
    return c.json({ job: await store.getJob(jobId) }, 202);
  });

  /** Max projects per generation request (createBatch takes 100; also caps a single click's cost). */
  const MAX_GENERATE = 100;

  /**
   * Facts + texts for the projects the user picked (the editor's "Generate texts"). Only these
   * are processed; an import never generates texts for projects nobody chose.
   */
  app.post("/api/generate", async (c) => {
    const user = c.get("user")!;
    const store = c.get("store").forUser(user.id);
    if (!c.env.PROJECT_JOBS) return c.json({ error: "Background jobs are not configured on this server." }, 501);
    const { keys } = (await c.req.json().catch(() => ({}))) as { keys?: unknown };
    const valid = Array.isArray(keys) && keys.length > 0 && keys.every((k) => typeof k === "string");
    if (!valid) return c.json({ error: 'Expected { "keys": ["<project key>", …] }' }, 400);
    const unique = [...new Set(keys as string[])];
    if (unique.length > MAX_GENERATE) return c.json({ error: `At most ${MAX_GENERATE} projects at once.` }, 400);

    const projects = (await store.getDocument("projects")) as { projects: { key: string }[] } | null;
    if (!projects) return c.json({ error: "Import your projects first." }, 400);
    const known = new Set(projects.projects.map((p) => p.key));
    const unknown = unique.filter((k) => !known.has(k));
    if (unknown.length) return c.json({ error: `Unknown projects: ${unknown.join(", ")}` }, 400);
    const running = await store.latestJob();
    if (isActive(running)) return c.json({ job: running }, 409);

    const jobId = await store.createJob("generate", unique.length, `Generating texts for ${unique.length} project(s)…`);
    await c.env.PROJECT_JOBS.createBatch(unique.map((key) => ({ params: { userId: user.id, jobId, key } })));
    return c.json({ job: await store.getJob(jobId) }, 202);
  });

  app.get("/api/jobs/latest", async (c) => {
    return c.json({ job: await c.get("store").forUser(c.get("user")!.id).latestJob() });
  });

  // Building and publishing come with #34.
  app.post("/api/build", (c) => c.json({ error: "Publishing from the hosted version is coming next." }, 501));

  // Everything else is the dashboard (static assets, client-side routing); unknown API paths are 404.
  app.notFound(async (c) => {
    if (c.env.ASSETS && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.env.ASSETS.fetch(c.req.raw);
    return c.json({ error: "Not found" }, 404);
  });
  return app;
}
