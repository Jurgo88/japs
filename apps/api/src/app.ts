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
import { Store, type User } from "./db.ts";
import { type Env, REQUIRED_SECRETS } from "./env.ts";

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

  // Placeholder home until the dashboard is served here (#31): shows who is signed in.
  app.get("/", async (c) => {
    const user = c.get("user");
    const escape = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
    const error = c.req.query("auth_error");
    const connections = user ? await c.get("store").forUser(user.id).listConnections() : [];
    const body = user
      ? `<p>Signed in as <strong>${escape(user.githubLogin)}</strong>.</p>
         <ul>${connections.map((x) => `<li>${escape(x.provider)}: ${escape(x.accountLogin ?? "connected")}</li>`).join("")}</ul>
         ${connections.some((x) => x.provider === "netlify") ? "" : '<p><a href="/auth/netlify/connect">Connect Netlify</a></p>'}
         <form method="post" action="/auth/logout" onsubmit="event.preventDefault();fetch('/auth/logout',{method:'POST'}).then(()=>location.reload())"><button>Sign out</button></form>`
      : '<p><a href="/auth/github/login">Sign in with GitHub</a></p>';
    return c.html(`<!doctype html><meta charset="utf-8"><title>JAPS</title>
      <body style="font:16px system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
      <h1>JAPS</h1>${error ? `<p style="color:#b42318">${escape(error)}</p>` : ""}${body}</body>`);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
