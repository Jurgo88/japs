import { beforeEach, describe, expect, it } from "vitest";
import { Store } from "./db.ts";
import { testDb } from "./testing/sqlite.ts";

let now = new Date("2026-10-14T10:00:00Z");
let store: Store;
beforeEach(() => {
  now = new Date("2026-10-14T10:00:00Z");
  store = new Store(testDb(), () => now);
});

const jane = { githubId: 1, login: "janedoe", name: "Jane", avatarUrl: null };
const john = { githubId: 2, login: "johndoe", name: "John", avatarUrl: null };

describe("users and sessions", () => {
  it("creates a user once and refreshes the login on later sign-ins", async () => {
    const first = await store.upsertGithubUser(jane);
    const again = await store.upsertGithubUser({ ...jane, login: "jane-renamed" });
    expect(again).toEqual({ ...first, githubLogin: "jane-renamed" });
  });

  it("resolves a session until it expires, and not after logout", async () => {
    const user = await store.upsertGithubUser(jane);
    await store.createSession(user.id, "hash-1", 30);
    expect((await store.sessionUser("hash-1"))?.id).toBe(user.id);
    expect(await store.sessionUser("unknown")).toBeNull();

    now = new Date("2026-11-14T10:00:01Z");
    expect(await store.sessionUser("hash-1")).toBeNull();

    now = new Date("2026-10-14T10:00:00Z");
    await store.deleteSession("hash-1");
    expect(await store.sessionUser("hash-1")).toBeNull();
  });
});

describe("isolation between users", () => {
  it("never shows one user's connections, documents or usage to another", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    const b = store.forUser((await store.upsertGithubUser(john)).id);

    await a.setConnection({
      provider: "netlify",
      accountLogin: "jane@example.com",
      accessToken: "v1:secret",
      refreshToken: null,
      expiresAt: null,
      meta: null,
    });
    await a.putDocument("config", { version: 1, profile: { name: "Jane" } });
    await a.addUsage("2026-10", { generations: 3, inputTokens: 100, outputTokens: 50 });

    expect(await b.getConnection("netlify")).toBeNull();
    expect(await b.listConnections()).toEqual([]);
    expect(await b.getDocument("config")).toBeNull();
    expect(await b.getUsage("2026-10")).toEqual({ generations: 0, inputTokens: 0, outputTokens: 0 });

    // b's writes don't touch a's rows.
    await b.putDocument("config", { version: 1 });
    await b.deleteConnection("netlify");
    expect(await a.getDocument("config")).toEqual({ version: 1, profile: { name: "Jane" } });
    expect((await a.getConnection("netlify"))?.accessToken).toBe("v1:secret");
  });

  it("lists connections without tokens", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    await a.setConnection({ provider: "github", accountLogin: "janedoe", accessToken: "v1:x", refreshToken: "v1:y", expiresAt: null, meta: null });
    const listed = await a.listConnections();
    expect(listed).toEqual([{ provider: "github", accountLogin: "janedoe", updatedAt: "2026-10-14T10:00:00.000Z" }]);
    expect(JSON.stringify(listed)).not.toContain("v1:");
  });
});

describe("documents and usage", () => {
  it("replaces a document and accumulates usage per month", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    await a.putDocument("projects", { n: 1 });
    await a.putDocument("projects", { n: 2 });
    expect(await a.getDocument("projects")).toEqual({ n: 2 });

    await a.addUsage("2026-10", { generations: 1, inputTokens: 10, outputTokens: 5 });
    await a.addUsage("2026-10", { generations: 2, inputTokens: 20, outputTokens: 10 });
    expect(await a.getUsage("2026-10")).toEqual({ generations: 3, inputTokens: 30, outputTokens: 15 });
  });

  it("deleting the account removes everything the user owns", async () => {
    const user = await store.upsertGithubUser(jane);
    const a = store.forUser(user.id);
    await store.createSession(user.id, "hash-1");
    await a.putDocument("config", { version: 1 });
    await a.setConnection({ provider: "netlify", accountLogin: null, accessToken: "v1:x", refreshToken: null, expiresAt: null, meta: null });

    await a.deleteAccount();
    expect(await store.sessionUser("hash-1")).toBeNull();
    expect(await a.getDocument("config")).toBeNull();
    expect(await a.getConnection("netlify")).toBeNull();
  });
});

describe("jobs and project documents", () => {
  it("completes a job when every project has reported, keeping problems", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    const id = await a.createJob("sync");
    await a.planJob(id, 3, null);
    await a.reportJobProject(id, { ok: true });
    await a.reportJobProject(id, { ok: false, problem: "repo:x: GitHub 500" });
    expect(await a.getJob(id)).toMatchObject({ status: "running", total: 3, done: 1, failed: 1 });
    await a.reportJobProject(id, { ok: true });
    expect(await a.getJob(id)).toMatchObject({ status: "complete", done: 2, failed: 1, problems: ["repo:x: GitHub 500"] });
  });

  it("completes an empty plan right away and keeps a failed job failed", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    const empty = await a.createJob("sync");
    await a.planJob(empty, 0, "Nothing to do");
    expect((await a.getJob(empty))?.status).toBe("complete");

    const failing = await a.createJob("sync");
    await a.failJob(failing, "Import failed: Connect Netlify first.");
    await a.reportJobProject(failing, { ok: true });
    expect(await a.getJob(failing)).toMatchObject({ status: "failed", message: "Import failed: Connect Netlify first." });
    expect((await a.latestJob())?.id).toBe(failing);
  });

  it("keeps jobs and project documents per user", async () => {
    const a = store.forUser((await store.upsertGithubUser(jane)).id);
    const b = store.forUser((await store.upsertGithubUser(john)).id);
    const id = await a.createJob("sync", 1);
    await a.putProjectDoc("repo:x/y", "facts", { n: 1 });

    expect(await b.getJob(id)).toBeNull();
    expect(await b.latestJob()).toBeNull();
    await b.reportJobProject(id, { ok: true });
    expect((await a.getJob(id))?.done).toBe(0);
    expect(await b.getProjectDoc("repo:x/y", "facts")).toBeNull();
    expect(await b.listProjectDocs("facts")).toEqual([]);
    expect(await a.listProjectDocs("facts")).toEqual([{ key: "repo:x/y", body: { n: 1 } }]);
  });
});
