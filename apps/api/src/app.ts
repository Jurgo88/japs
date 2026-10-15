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
  revokeGithubGrant,
} from "./auth/oauth.ts";
import { encrypt, randomToken, sha256, sign, unsign } from "./crypto.ts";
import { type Job, Store, type User } from "./db.ts";
import { wrapAnalysis } from "./pipeline.ts";
import { OWN_KEY_PROVIDERS, quotaFor } from "./llm.ts";
import { LLM_PRESETS } from "@japs/core";
import { type Env, REQUIRED_SECRETS } from "./env.ts";
import { OidcError, verifyActionsToken } from "./oidc.ts";
import {
  createBuildDeploy,
  finishBuild,
  forwardBuildFile,
  inputKey,
  PublishError,
  refreshPublish,
  startPublish,
  toStatus,
} from "./publish.ts";
import { deleteUserImages, objectKey } from "./screenshots.ts";
import { ConnectionError, githubToken } from "./tokens.ts";
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
  // The builder routes use a bearer token, not cookies, so CSRF doesn't apply to them.
  app.use("*", async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && !c.req.path.startsWith("/builder/")) {
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
    const store = c.get("store").forUser(user.id);
    return c.json({
      user: { login: user.githubLogin, name: user.name, avatarUrl: user.avatarUrl },
      connections: await store.listConnections(),
      quota: await quotaFor(store, c.env, now()),
      // Private repositories are visible only where the GitHub App is installed (ADR 0009).
      githubAppInstallUrl: c.env.GITHUB_APP_SLUG
        ? `https://github.com/apps/${encodeURIComponent(c.env.GITHUB_APP_SLUG)}/installations/new`
        : null,
    });
  });

  /** The user's own AI key (#35): used instead of the shared key, no quota. Stored encrypted. */
  app.put("/api/llm", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { provider?: unknown; model?: unknown; apiKey?: unknown };
    const provider = String(body.provider ?? "");
    if (!(OWN_KEY_PROVIDERS as readonly string[]).includes(provider)) {
      return c.json({ error: `Provider must be one of ${OWN_KEY_PROVIDERS.join(", ")}` }, 400);
    }
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    if (!apiKey || apiKey.length > 500) return c.json({ error: "Enter the API key." }, 400);
    const model = (typeof body.model === "string" ? body.model.trim() : "") || LLM_PRESETS[provider]?.defaultModel || "";
    if (!model || model.length > 100) return c.json({ error: `Enter a model name for ${provider}.` }, 400);

    await c.get("store").forUser(c.get("user")!.id).setConnection({
      provider: "llm",
      accountLogin: `${provider} · ${model}`,
      accessToken: await encrypt(apiKey, c.env.ENCRYPTION_KEY),
      refreshToken: null,
      expiresAt: null,
      meta: { provider, model },
    });
    return c.json({ ok: true });
  });

  // GitHub is the sign-in itself; only Netlify and an own LLM key can be disconnected.
  app.delete("/api/connections/:provider", async (c) => {
    const provider = c.req.param("provider");
    if (provider !== "netlify" && provider !== "llm") return c.json({ error: "Cannot disconnect this provider" }, 400);
    await c.get("store").forUser(c.get("user")!.id).deleteConnection(provider);
    return c.json({ ok: true });
  });

  /**
   * Deletes the account and everything stored for it (#36). The user types their GitHub login to
   * confirm. The GitHub authorization is revoked first (best effort: the data goes either way).
   * Netlify has no revoke endpoint, so the page tells the user where to remove the app there.
   */
  app.delete("/api/account", async (c) => {
    const user = c.get("user")!;
    const body = (await c.req.json().catch(() => ({}))) as { confirm?: unknown };
    if (body.confirm !== user.githubLogin) {
      return c.json({ error: `Type your GitHub username (${user.githubLogin}) to confirm.` }, 400);
    }
    const store = c.get("store").forUser(user.id);
    let githubRevoked = false;
    try {
      githubRevoked = await revokeGithubGrant(fetchImpl, {
        clientId: c.env.GITHUB_CLIENT_ID,
        clientSecret: c.env.GITHUB_CLIENT_SECRET,
        accessToken: await githubToken(store, c.env, fetchImpl, now()),
      });
    } catch {
      // An expired or already revoked token: nothing left to revoke.
    }
    if (c.env.SHOTS) await deleteUserImages(c.env.SHOTS, user.id);
    await store.deleteAccount();
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true, githubRevoked });
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
      // Stored per shot (#33); the dashboard reads the screenshots/manifest.json shape.
      screenshots: { version: 1, shots: await store.listScreenshots() },
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

    // Refuse up front what the quota can't cover, instead of failing project by project.
    const quota = await quotaFor(store, c.env, now());
    if (!quota.ownKey) {
      if (!quota.shared) return c.json({ error: "No AI key available: add your own in your profile." }, 400);
      if (unique.length > quota.remaining) {
        const left = quota.remaining ? `only ${quota.remaining} left` : "none left";
        return c.json(
          { error: `Your free AI generations this month: ${quota.limit}, ${left}. Pick fewer projects or add your own AI key in your profile.` },
          402,
        );
      }
    }

    const running = await store.latestJob();
    if (isActive(running)) return c.json({ job: running }, 409);

    const jobId = await store.createJob("generate", unique.length, `Generating texts for ${unique.length} project(s)…`);
    await c.env.PROJECT_JOBS.createBatch(unique.map((key) => ({ params: { userId: user.id, jobId, key } })));
    // Screenshots of the same projects, paced separately (#33). Never blocks the texts.
    await c.env.SHOT_JOBS?.create({ params: { userId: user.id, keys: unique } }).catch((err: unknown) => {
      console.warn(`screenshots not started: ${err instanceof Error ? err.message : String(err)}`);
    });
    return c.json({ job: await store.getJob(jobId) }, 202);
  });

  app.get("/api/jobs/latest", async (c) => {
    return c.json({ job: await c.get("store").forUser(c.get("user")!.id).latestJob() });
  });

  /** The user's own screenshots from R2 (#33); only under their own prefix. */
  app.get("/api/screenshots/:file", async (c) => {
    const file = c.req.param("file");
    if (!c.env.SHOTS || !/^[\w.-]+\.jpg$/.test(file)) return c.json({ error: "Not found" }, 404);
    const object = await c.env.SHOTS.get(objectKey(c.get("user")!.id, file));
    if (!object) return c.json({ error: "Not found" }, 404);
    return new Response(object.body, {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300" },
    });
  });

  // --- Publishing (#34, ADR 0011) ---

  const publishDeps = (c: AppContext) => ({ env: c.env, fetch: fetchImpl, now: now() });
  const publishError = (c: AppContext, err: unknown) => {
    if (err instanceof PublishError) return c.json({ error: err.message }, err.status);
    if (err instanceof ConnectionError) return c.json({ error: err.message }, 400);
    throw err;
  };

  app.post("/api/publish", async (c) => {
    const user = c.get("user")!;
    const { draft } = (await c.req.json().catch(() => ({}))) as { draft?: unknown };
    try {
      const build = await startPublish(c.get("store").forUser(user.id), user.id, draft === true, publishDeps(c));
      return c.json({ publish: toStatus(build) }, 202);
    } catch (err) {
      return publishError(c, err);
    }
  });

  app.get("/api/publish/latest", async (c) => {
    const user = c.get("user")!;
    try {
      const build = await refreshPublish(c.get("store").forUser(user.id), publishDeps(c));
      return c.json({ publish: build ? toStatus(build) : null });
    } catch (err) {
      return publishError(c, err);
    }
  });

  /**
   * The GitHub Actions run of a build (ADR 0011): an OIDC token from the publish workflow on
   * main, and the run that claimed the build first. Returns the build's owner and the build.
   */
  async function builderAuth(c: AppContext) {
    const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !c.env.JAPS_BUILD_REPO) return null;
    let runId: string;
    try {
      ({ runId } = await verifyActionsToken(token, {
        audience: new URL(c.env.APP_URL).origin,
        repository: c.env.JAPS_BUILD_REPO,
        fetch: fetchImpl,
        now: now(),
      }));
    } catch (err) {
      if (err instanceof OidcError) return null;
      throw err;
    }
    const buildId = c.req.param("id") ?? "";
    const userId = await c.get("store").buildOwner(buildId);
    if (!userId) return null;
    const user = c.get("store").forUser(userId);
    if (!(await user.claimBuildRun(buildId, runId))) return null;
    const build = await user.getBuild(buildId);
    return build ? { userId, user, build } : null;
  }
  const denied = (c: AppContext) => c.json({ error: "Not allowed" }, 403);

  app.get("/builder/builds/:id/input", async (c) => {
    const auth = await builderAuth(c);
    if (!auth || !c.env.SHOTS) return denied(c);
    const object = await c.env.SHOTS.get(inputKey(auth.userId, auth.build.id));
    if (!object) return c.json({ error: "This build has no input any more." }, 410);
    return new Response(object.body, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  });

  app.get("/builder/builds/:id/screenshots/:file", async (c) => {
    const auth = await builderAuth(c);
    const file = c.req.param("file");
    if (!auth || !c.env.SHOTS) return denied(c);
    const object = /^[\w.-]+\.jpg$/.test(file) ? await c.env.SHOTS.get(objectKey(auth.userId, file)) : null;
    if (!object) return c.json({ error: "Not found" }, 404);
    return new Response(object.body, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } });
  });

  app.post("/builder/builds/:id/deploy", async (c) => {
    const auth = await builderAuth(c);
    if (!auth) return denied(c);
    const { files } = (await c.req.json().catch(() => ({}))) as { files?: unknown };
    try {
      return c.json({ required: await createBuildDeploy(auth.user, auth.build, files, publishDeps(c)) });
    } catch (err) {
      return publishError(c, err);
    }
  });

  app.put("/builder/builds/:id/files/*", async (c) => {
    const auth = await builderAuth(c);
    if (!auth) return denied(c);
    const prefix = `/builder/builds/${auth.build.id}/files`;
    const path = decodeURIComponent(c.req.path.slice(prefix.length));
    const content = new Uint8Array(await c.req.arrayBuffer());
    try {
      await forwardBuildFile(auth.user, auth.build, path, content, publishDeps(c));
      return c.json({ ok: true });
    } catch (err) {
      return publishError(c, err);
    }
  });

  app.post("/builder/builds/:id/finish", async (c) => {
    const auth = await builderAuth(c);
    if (!auth || !c.env.SHOTS) return denied(c);
    const body = (await c.req.json().catch(() => ({}))) as { ok?: unknown; message?: unknown };
    await finishBuild(auth.user, auth.userId, auth.build, { ok: body.ok === true, message: typeof body.message === "string" ? body.message : undefined }, c.env.SHOTS);
    return c.json({ ok: true });
  });

  // The local editor's build endpoint; in the cloud, Publish replaces it.
  app.post("/api/build", (c) => c.json({ error: "Use Publish in the hosted version." }, 501));

  // Everything else is the dashboard (static assets, client-side routing); unknown API paths are 404.
  app.notFound(async (c) => {
    if (c.env.ASSETS && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.env.ASSETS.fetch(c.req.raw);
    return c.json({ error: "Not found" }, 404);
  });
  return app;
}
