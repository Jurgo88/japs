import { beforeEach, describe, expect, it } from "vitest";
import { base64url, decrypt, encrypt } from "./crypto.ts";
import { Store, type UserStore } from "./db.ts";
import type { Env } from "./env.ts";
import { runDiscovery, runProject } from "./pipeline.ts";
import { testDb } from "./testing/sqlite.ts";
import { ConnectionError } from "./tokens.ts";

const NOW = new Date("2026-10-15T10:00:00Z");
let env: Env;
let user: UserStore;

const copy = {
  title: { en: "Shop" },
  summary: { en: "An online shop." },
  description: { en: "Sells things online." },
  role: { en: "Full-stack development" },
  tags: ["TypeScript", "Netlify"],
};

/** Fake Netlify + GitHub + OpenAI + live site; records requests. */
function fakeWorld() {
  const calls: string[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
    if (url.startsWith("https://api.netlify.com/api/v1/sites?")) {
      return json([
        {
          id: "s1",
          name: "shop",
          url: "http://shop.netlify.app",
          ssl_url: "https://shop.netlify.app",
          custom_domain: null,
          build_settings: { repo_url: "https://github.com/jane/shop" },
          published_deploy: { id: "d1", context: "production", published_at: "2026-10-01T00:00:00Z", committer: "jane" },
        },
      ]);
    }
    if (url === "https://api.netlify.com/api/v1/deploys/d1") return json({ id: "d1", title: "Ship it", committer: "jane", available_functions: [] });
    if (url === "https://github.com/login/oauth/access_token") {
      return json({ access_token: "gho_fresh", refresh_token: "ghr_fresh", expires_in: 28800 });
    }
    if (url === "https://api.github.com/user") return json({ login: "jane" });
    if (url.startsWith("https://api.github.com/user/repos")) {
      return json([
        {
          full_name: "jane/shop",
          html_url: "https://github.com/jane/shop",
          owner: { type: "User" },
          private: false,
          fork: false,
          language: "TypeScript",
          pushed_at: "2026-10-01T00:00:00Z",
        },
      ]);
    }
    if (url.endsWith("/repos/jane/shop/languages")) return json({ TypeScript: 1000 });
    if (url.includes("/repos/jane/shop/commits")) return json([{ commit: { author: { date: "2026-09-01T00:00:00Z" } } }]);
    if (url.includes("/repos/jane/shop/pulls")) return json([]);
    if (url === "https://shop.netlify.app") {
      return new Response("<html lang=en><head><title>Shop</title></head></html>", { headers: { "content-type": "text/html" } });
    }
    if (url === "https://api.openai.com/v1/chat/completions") {
      return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(copy) } }], usage: { prompt_tokens: 900, completion_tokens: 300 } });
    }
    return json({ message: "Not Found" }, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

beforeEach(async () => {
  env = {
    DB: testDb(),
    APP_URL: "https://japs.example.dev",
    GITHUB_CLIENT_ID: "gh",
    GITHUB_CLIENT_SECRET: "gh-secret",
    NETLIFY_CLIENT_ID: "nf",
    NETLIFY_CLIENT_SECRET: "nf-secret",
    SESSION_SECRET: "s",
    ENCRYPTION_KEY: base64url(new Uint8Array(32).fill(9)),
    OPENAI_API_KEY: "sk-owner",
  };
  const store = new Store(env.DB, () => NOW);
  user = store.forUser((await store.upsertGithubUser({ githubId: 1, login: "jane", name: "Jane", avatarUrl: null })).id);
  const token = (t: string) => encrypt(t, env.ENCRYPTION_KEY);
  await user.setConnection({ provider: "github", accountLogin: "jane", accessToken: await token("gho_old"), refreshToken: await token("ghr_old"), expiresAt: "2026-10-15T18:00:00Z", meta: null });
  await user.setConnection({ provider: "netlify", accountLogin: "jane@example.com", accessToken: await token("nf_token"), refreshToken: null, expiresAt: null, meta: null });
});

describe("hosted pipeline", () => {
  it("imports projects without facts or LLM calls, then generates texts for a picked project", async () => {
    const { fetch, calls } = fakeWorld();
    const found = await runDiscovery(user, { env, fetch, now: () => NOW });
    // A first import only lists: nothing is refreshed until the user picks projects.
    expect(found).toEqual({ projects: 1, refresh: [] });
    expect(calls.some((c) => c.includes("openai.com") || c.includes("/languages"))).toBe(false);
    expect(await user.getDocument("projects")).toMatchObject({ account: { github: "jane" }, projects: [{ key: "repo:jane/shop" }] });

    const result = await runProject(user, "repo:jane/shop", { env, fetch, now: () => NOW });
    expect(result).toMatchObject({ generated: true, usage: { input: 900, output: 300 } });
    expect(await user.getProjectDoc("repo:jane/shop", "facts")).toMatchObject({
      key: "repo:jane/shop",
      repos: [{ languages: { TypeScript: 100 }, commits: { count: 1 } }],
      sites: [{ live: { title: "Shop" } }],
    });
    expect(await user.getProjectDoc("repo:jane/shop", "analysis")).toMatchObject({ copy: { title: { en: "Shop" }, tags: ["TypeScript", "Netlify"] } });
    expect(await user.getUsage("2026-10")).toEqual({ generations: 1, inputTokens: 900, outputTokens: 300 });

    // Once it has texts and is shown, a later import refreshes it.
    expect(await runDiscovery(user, { env, fetch, now: () => NOW })).toEqual({ projects: 1, refresh: ["repo:jane/shop"] });
  });

  it("doesn't refresh a project the user has hidden since", async () => {
    const { fetch } = fakeWorld();
    await runDiscovery(user, { env, fetch, now: () => NOW });
    await runProject(user, "repo:jane/shop", { env, fetch, now: () => NOW });
    await user.putDocument("config", { version: 1, projects: { "repo:jane/shop": { hidden: true } } });
    expect((await runDiscovery(user, { env, fetch, now: () => NOW })).refresh).toEqual([]);
  });

  it("doesn't call the LLM again when the facts are unchanged", async () => {
    const first = fakeWorld();
    await runDiscovery(user, { env, fetch: first.fetch, now: () => NOW });
    await runProject(user, "repo:jane/shop", { env, fetch: first.fetch, now: () => NOW });

    const second = fakeWorld();
    const result = await runProject(user, "repo:jane/shop", { env, fetch: second.fetch, now: () => NOW });
    expect(result.generated).toBe(false);
    expect(second.calls.some((c) => c.includes("openai.com"))).toBe(false);
  });

  it("refreshes an expiring GitHub token and stores the new one encrypted", async () => {
    const soon = new Date("2026-10-15T17:58:00Z");
    const { fetch, calls } = fakeWorld();
    await runDiscovery(user, { env, fetch, now: () => soon });
    expect(calls).toContain("POST https://github.com/login/oauth/access_token");
    const stored = await user.getConnection("github");
    expect(await decrypt(stored!.accessToken, env.ENCRYPTION_KEY)).toBe("gho_fresh");
    expect(await decrypt(stored!.refreshToken!, env.ENCRYPTION_KEY)).toBe("ghr_fresh");
    expect(stored!.expiresAt).toBe("2026-10-16T01:58:00.000Z");
  });

  it("asks to connect Netlify when it isn't", async () => {
    await user.deleteConnection("netlify");
    await expect(runDiscovery(user, { env, fetch: fakeWorld().fetch, now: () => NOW })).rejects.toBeInstanceOf(ConnectionError);
  });

  it("only imports facts when no LLM key is configured", async () => {
    env.OPENAI_API_KEY = undefined;
    const { fetch } = fakeWorld();
    await runDiscovery(user, { env, fetch, now: () => NOW });
    const result = await runProject(user, "repo:jane/shop", { env, fetch, now: () => NOW });
    expect(result).toMatchObject({ generated: false, warnings: ["No LLM configured on the server."] });
    expect(await user.getProjectDoc("repo:jane/shop", "facts")).not.toBeNull();
  });
});
