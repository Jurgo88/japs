import type { ScreenshotRecord } from "@japs/schema";

/**
 * The only place that talks SQL (ADR 0009). D1 has no row-level security, so isolation is
 * structural: everything user-owned is reached through `forUser(userId)`, whose methods all
 * filter by that id. Route handlers never write queries.
 */

/** The subset of D1Database we use; a node:sqlite adapter implements it in tests. */
export interface Db {
  prepare(sql: string): Statement;
}
export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export type Provider = "github" | "netlify" | "cloudflare" | "llm";
export type DocumentKind = "config" | "projects" | "facts" | "analysis" | "screenshots" | "publish";

export interface User {
  id: string;
  githubId: number;
  githubLogin: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Connection {
  provider: Provider;
  accountLogin: string | null;
  /** Ciphertext; decrypt only where the token is used. */
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  meta: Record<string, unknown> | null;
}

export type ProjectDocKind = "facts" | "analysis";
export type JobKind = "sync" | "generate";

export interface Job {
  id: string;
  kind: JobKind;
  status: "running" | "complete" | "failed";
  total: number;
  done: number;
  failed: number;
  message: string | null;
  problems: string[];
  createdAt: string;
  updatedAt: string;
}

type JobRow = {
  id: string;
  kind: JobKind;
  status: Job["status"];
  total: number;
  done: number;
  failed: number;
  message: string | null;
  problems: string;
  created_at: string;
  updated_at: string;
};
const toJob = (r: JobRow): Job => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  total: r.total,
  done: r.done,
  failed: r.failed,
  message: r.message,
  problems: JSON.parse(r.problems) as string[],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** One publish (#34, ADR 0011). `files` and `required` are the Netlify file-digest exchange. */
export type BuildStatus = "building" | "deploying" | "live" | "failed";
export interface Build {
  id: string;
  status: BuildStatus;
  /**
   * Netlify site or Cloudflare Pages project (ADR 0012), or the user's address on the hosted
   * domain (ADR 0013). For Pages, siteId is the project name; for japs, the handle.
   */
  target: "netlify" | "cloudflare" | "japs";
  accountId: string | null;
  theme: string;
  draft: boolean;
  siteId: string;
  siteUrl: string;
  runId: string | null;
  deployId: string | null;
  files: Record<string, string> | null;
  required: string[] | null;
  url: string | null;
  message: string | null;
  createdAt: string;
  updatedAt: string;
}
export type BuildUpdate = Partial<Pick<Build, "status" | "deployId" | "files" | "required" | "url" | "message">>;

type BuildRow = {
  id: string;
  status: BuildStatus;
  target: Build["target"];
  account_id: string | null;
  theme: string;
  draft: number;
  site_id: string;
  site_url: string;
  run_id: string | null;
  deploy_id: string | null;
  files: string | null;
  required: string | null;
  url: string | null;
  message: string | null;
  created_at: string;
  updated_at: string;
};
const toBuild = (r: BuildRow): Build => ({
  id: r.id,
  status: r.status,
  target: r.target,
  accountId: r.account_id,
  theme: r.theme,
  draft: r.draft === 1,
  siteId: r.site_id,
  siteUrl: r.site_url,
  runId: r.run_id,
  deployId: r.deploy_id,
  files: r.files ? (JSON.parse(r.files) as Record<string, string>) : null,
  required: r.required ? (JSON.parse(r.required) as string[]) : null,
  url: r.url,
  message: r.message,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** The user's portfolio on <handle>.japs.app (ADR 0013). Builds are ids of the `builds` rows. */
export interface HostedSite {
  handle: string;
  /** Null until the user changes the first address (a free first pick and one change). */
  handleChangedAt: string | null;
  liveBuild: string | null;
  draftBuild: string | null;
  draftKey: string | null;
}
type HostedSiteRow = {
  handle: string;
  handle_changed_at: string | null;
  live_build: string | null;
  draft_build: string | null;
  draft_key: string | null;
};
const toHostedSite = (r: HostedSiteRow): HostedSite => ({
  handle: r.handle,
  handleChangedAt: r.handle_changed_at,
  liveBuild: r.live_build,
  draftBuild: r.draft_build,
  draftKey: r.draft_key,
});

/** Why another user's claim blocks a handle; never who it is. */
export type HandleConflict = "taken" | "login" | "retired";

/** What the browser may see about a connection: never a token. */
export type PublicConnection = Pick<Connection, "provider" | "accountLogin"> & { updatedAt: string };

type UserRow = { id: string; github_id: number; github_login: string; name: string | null; avatar_url: string | null };
const toUser = (r: UserRow): User => ({
  id: r.id,
  githubId: r.github_id,
  githubLogin: r.github_login,
  name: r.name,
  avatarUrl: r.avatar_url,
});

export class Store {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private iso(): string {
    return this.now().toISOString();
  }

  /** Creates the user on first login; afterwards refreshes login/name/avatar (they can change on GitHub). */
  async upsertGithubUser(profile: { githubId: number; login: string; name: string | null; avatarUrl: string | null }): Promise<User> {
    const at = this.iso();
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, name, avatar_url, created_at, last_login_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(github_id) DO UPDATE SET github_login = excluded.github_login, name = excluded.name,
           avatar_url = excluded.avatar_url, last_login_at = excluded.last_login_at`,
      )
      .bind(crypto.randomUUID(), profile.githubId, profile.login, profile.name, profile.avatarUrl, at, at)
      .run();
    const row = await this.db
      .prepare("SELECT id, github_id, github_login, name, avatar_url FROM users WHERE github_id = ?")
      .bind(profile.githubId)
      .first<UserRow>();
    if (!row) throw new Error("User upsert failed");
    return toUser(row);
  }

  async createSession(userId: string, tokenHash: string, ttlDays = 30): Promise<{ expiresAt: string }> {
    const expiresAt = new Date(this.now().getTime() + ttlDays * 86_400_000).toISOString();
    await this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, userId, this.iso(), expiresAt)
      .run();
    return { expiresAt };
  }

  /** The session's user, or null when unknown or expired. */
  async sessionUser(tokenHash: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `SELECT u.id, u.github_id, u.github_login, u.name, u.avatar_url FROM sessions s
         JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .bind(tokenHash, this.iso())
      .first<UserRow>();
    return row ? toUser(row) : null;
  }

  /** Owner of a build, for the builder routes (OIDC, no session). Everything else goes through forUser. */
  async buildOwner(buildId: string): Promise<string | null> {
    const row = await this.db.prepare("SELECT user_id FROM builds WHERE id = ?").bind(buildId).first<{ user_id: string }>();
    return row?.user_id ?? null;
  }

  /**
   * The portfolio served at a handle, for the read-only portfolio Worker (ADR 0013). Handles
   * are public addresses, so this is a lookup across users like buildOwner.
   */
  async hostedSiteByHandle(handle: string): Promise<(HostedSite & { userId: string }) | null> {
    const row = await this.db
      .prepare("SELECT user_id, handle, handle_changed_at, live_build, draft_build, draft_key FROM hosted_sites WHERE handle = ?")
      .bind(handle)
      .first<HostedSiteRow & { user_id: string }>();
    return row ? { ...toHostedSite(row), userId: row.user_id } : null;
  }

  /** A handle given up recently: where its owner is now (null when the account is gone). */
  async retiredHandle(handle: string): Promise<{ currentHandle: string | null } | null> {
    const row = await this.db
      .prepare(
        `SELECT s.handle AS current FROM retired_handles r LEFT JOIN hosted_sites s ON s.user_id = r.user_id
         WHERE r.handle = ? AND r.until > ?`,
      )
      .bind(handle, this.iso())
      .first<{ current: string | null }>();
    return row ? { currentHandle: row.current } : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
  }

  forUser(userId: string): UserStore {
    return new UserStore(this.db, userId, () => this.iso());
  }
}

/** Everything one user owns. Every statement filters by `this.userId`. */
export class UserStore {
  constructor(
    private readonly db: Db,
    readonly userId: string,
    private readonly iso: () => string,
  ) {}

  async setConnection(c: Connection): Promise<void> {
    const at = this.iso();
    await this.db
      .prepare(
        `INSERT INTO connections (user_id, provider, account_login, access_token, refresh_token, expires_at, meta, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, provider) DO UPDATE SET account_login = excluded.account_login,
           access_token = excluded.access_token, refresh_token = excluded.refresh_token,
           expires_at = excluded.expires_at, meta = excluded.meta, updated_at = excluded.updated_at`,
      )
      .bind(
        this.userId,
        c.provider,
        c.accountLogin,
        c.accessToken,
        c.refreshToken,
        c.expiresAt,
        c.meta ? JSON.stringify(c.meta) : null,
        at,
        at,
      )
      .run();
  }

  async getConnection(provider: Provider): Promise<Connection | null> {
    const row = await this.db
      .prepare(
        `SELECT provider, account_login, access_token, refresh_token, expires_at, meta FROM connections
         WHERE user_id = ? AND provider = ?`,
      )
      .bind(this.userId, provider)
      .first<{
        provider: Provider;
        account_login: string | null;
        access_token: string;
        refresh_token: string | null;
        expires_at: string | null;
        meta: string | null;
      }>();
    if (!row) return null;
    return {
      provider: row.provider,
      accountLogin: row.account_login,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      expiresAt: row.expires_at,
      meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
    };
  }

  /** For the UI: provider and login only, no tokens. */
  async listConnections(): Promise<PublicConnection[]> {
    const { results } = await this.db
      .prepare("SELECT provider, account_login, updated_at FROM connections WHERE user_id = ? ORDER BY provider")
      .bind(this.userId)
      .all<{ provider: Provider; account_login: string | null; updated_at: string }>();
    return results.map((r) => ({ provider: r.provider, accountLogin: r.account_login, updatedAt: r.updated_at }));
  }

  async deleteConnection(provider: Provider): Promise<void> {
    await this.db.prepare("DELETE FROM connections WHERE user_id = ? AND provider = ?").bind(this.userId, provider).run();
  }

  async getDocument(kind: DocumentKind): Promise<unknown> {
    const row = await this.db
      .prepare("SELECT body FROM documents WHERE user_id = ? AND kind = ?")
      .bind(this.userId, kind)
      .first<{ body: string }>();
    return row ? (JSON.parse(row.body) as unknown) : null;
  }

  async putDocument(kind: DocumentKind, body: unknown): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO documents (user_id, kind, body, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, kind) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(this.userId, kind, JSON.stringify(body), this.iso())
      .run();
  }

  async addUsage(month: string, used: { generations: number; inputTokens: number; outputTokens: number }): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO usage (user_id, month, generations, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, month) DO UPDATE SET generations = generations + excluded.generations,
           input_tokens = input_tokens + excluded.input_tokens, output_tokens = output_tokens + excluded.output_tokens`,
      )
      .bind(this.userId, month, used.generations, used.inputTokens, used.outputTokens)
      .run();
  }

  async getUsage(month: string): Promise<{ generations: number; inputTokens: number; outputTokens: number }> {
    const row = await this.db
      .prepare("SELECT generations, input_tokens, output_tokens FROM usage WHERE user_id = ? AND month = ?")
      .bind(this.userId, month)
      .first<{ generations: number; input_tokens: number; output_tokens: number }>();
    return { generations: row?.generations ?? 0, inputTokens: row?.input_tokens ?? 0, outputTokens: row?.output_tokens ?? 0 };
  }

  // --- Per-project facts and analysis (#32) ---

  async getProjectDoc(key: string, kind: ProjectDocKind): Promise<unknown> {
    const row = await this.db
      .prepare("SELECT body FROM project_docs WHERE user_id = ? AND project_key = ? AND kind = ?")
      .bind(this.userId, key, kind)
      .first<{ body: string }>();
    return row ? (JSON.parse(row.body) as unknown) : null;
  }

  async putProjectDoc(key: string, kind: ProjectDocKind, body: unknown): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO project_docs (user_id, project_key, kind, body, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, project_key, kind) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
      )
      .bind(this.userId, key, kind, JSON.stringify(body), this.iso())
      .run();
  }

  /** Keys only, without parsing bodies (cheap on CPU). */
  async listProjectDocKeys(kind: ProjectDocKind): Promise<string[]> {
    const { results } = await this.db
      .prepare("SELECT project_key FROM project_docs WHERE user_id = ? AND kind = ?")
      .bind(this.userId, kind)
      .all<{ project_key: string }>();
    return results.map((r) => r.project_key);
  }

  /** All of one kind, for assembling facts.json / analysis.json shapes. */
  async listProjectDocs(kind: ProjectDocKind): Promise<{ key: string; body: unknown }[]> {
    const { results } = await this.db
      .prepare("SELECT project_key, body FROM project_docs WHERE user_id = ? AND kind = ? ORDER BY project_key")
      .bind(this.userId, kind)
      .all<{ project_key: string; body: string }>();
    return results.map((r) => ({ key: r.project_key, body: JSON.parse(r.body) as unknown }));
  }

  // --- Screenshots (#33): the manifest; images are in R2 ---

  async listScreenshots(): Promise<ScreenshotRecord[]> {
    const { results } = await this.db
      .prepare("SELECT project_key, viewport, file, url, taken_at FROM screenshots WHERE user_id = ? ORDER BY project_key, viewport")
      .bind(this.userId)
      .all<{ project_key: string; viewport: ScreenshotRecord["viewport"]; file: string; url: string; taken_at: string }>();
    return results.map((r) => ({ key: r.project_key, viewport: r.viewport, file: r.file, url: r.url, takenAt: r.taken_at }));
  }

  async putScreenshot(shot: ScreenshotRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO screenshots (user_id, project_key, viewport, file, url, taken_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, project_key, viewport) DO UPDATE SET file = excluded.file, url = excluded.url, taken_at = excluded.taken_at`,
      )
      .bind(this.userId, shot.key, shot.viewport, shot.file, shot.url, shot.takenAt)
      .run();
  }

  // --- Builds (#34) ---

  async createBuild(build: {
    theme: string;
    draft: boolean;
    siteId: string;
    siteUrl: string;
    target?: Build["target"];
    accountId?: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    const at = this.iso();
    await this.db
      .prepare(
        `INSERT INTO builds (id, user_id, status, theme, draft, site_id, site_url, target, account_id, created_at, updated_at)
         VALUES (?, ?, 'building', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, this.userId, build.theme, build.draft ? 1 : 0, build.siteId, build.siteUrl, build.target ?? "netlify", build.accountId ?? null, at, at)
      .run();
    return id;
  }

  async getBuild(id: string): Promise<Build | null> {
    const row = await this.db.prepare("SELECT * FROM builds WHERE user_id = ? AND id = ?").bind(this.userId, id).first<BuildRow>();
    return row ? toBuild(row) : null;
  }

  async latestBuild(): Promise<Build | null> {
    const row = await this.db
      .prepare("SELECT * FROM builds WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .bind(this.userId)
      .first<BuildRow>();
    return row ? toBuild(row) : null;
  }

  async countBuildsSince(iso: string): Promise<number> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS n FROM builds WHERE user_id = ? AND created_at >= ?")
      .bind(this.userId, iso)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }

  async updateBuild(id: string, patch: BuildUpdate): Promise<void> {
    const columns: Record<keyof BuildUpdate, string> = {
      status: "status",
      deployId: "deploy_id",
      files: "files",
      required: "required",
      url: "url",
      message: "message",
    };
    const entries = (Object.keys(patch) as (keyof BuildUpdate)[]).filter((k) => patch[k] !== undefined);
    if (!entries.length) return;
    const value = (k: keyof BuildUpdate) => (k === "files" || k === "required" ? JSON.stringify(patch[k]) : patch[k]);
    await this.db
      .prepare(`UPDATE builds SET ${entries.map((k) => `${columns[k]} = ?`).join(", ")}, updated_at = ? WHERE user_id = ? AND id = ?`)
      .bind(...entries.map(value), this.iso(), this.userId, id)
      .run();
  }

  /**
   * Binds the build to the GitHub Actions run that asks first; afterwards only that run may
   * act on it. One statement, so two runs can't both win.
   */
  async claimBuildRun(id: string, runId: string): Promise<boolean> {
    await this.db
      .prepare("UPDATE builds SET run_id = ? WHERE user_id = ? AND id = ? AND run_id IS NULL")
      .bind(runId, this.userId, id)
      .run();
    return (await this.getBuild(id))?.runId === runId;
  }

  // --- Jobs (#32) ---

  async createJob(kind: JobKind, total = 0, message: string | null = null): Promise<string> {
    const id = crypto.randomUUID();
    const at = this.iso();
    await this.db
      .prepare(
        `INSERT INTO jobs (id, user_id, kind, status, total, done, failed, message, created_at, updated_at)
         VALUES (?, ?, ?, 'running', ?, 0, 0, ?, ?, ?)`,
      )
      .bind(id, this.userId, kind, total, message, at, at)
      .run();
    return id;
  }

  async getJob(id: string): Promise<Job | null> {
    const row = await this.db.prepare("SELECT * FROM jobs WHERE user_id = ? AND id = ?").bind(this.userId, id).first<JobRow>();
    return row ? toJob(row) : null;
  }

  async latestJob(): Promise<Job | null> {
    const row = await this.db
      .prepare("SELECT * FROM jobs WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .bind(this.userId)
      .first<JobRow>();
    return row ? toJob(row) : null;
  }

  /** Sets the plan of a job; a job with nothing to do is complete right away. */
  async planJob(id: string, total: number, message: string | null): Promise<void> {
    await this.db
      .prepare(
        `UPDATE jobs SET total = ?, message = ?, status = CASE WHEN ? = 0 THEN 'complete' ELSE status END, updated_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .bind(total, message, total, this.iso(), this.userId, id)
      .run();
  }

  async failJob(id: string, message: string): Promise<void> {
    await this.db
      .prepare("UPDATE jobs SET status = 'failed', message = ?, updated_at = ? WHERE user_id = ? AND id = ?")
      .bind(message, this.iso(), this.userId, id)
      .run();
  }

  /**
   * One project finished (ok or not). A single statement, because per-project workflow
   * instances finish concurrently; the job completes when every project has reported.
   */
  async reportJobProject(id: string, outcome: { ok: true } | { ok: false; problem: string }): Promise<void> {
    const ok = outcome.ok ? 1 : 0;
    const bad = outcome.ok ? 0 : 1;
    const problem = outcome.ok ? null : outcome.problem.slice(0, 300);
    await this.db
      .prepare(
        `UPDATE jobs SET done = done + ?, failed = failed + ?,
           problems = CASE WHEN ? IS NULL OR json_array_length(problems) >= 50 THEN problems ELSE json_insert(problems, '$[#]', ?) END,
           status = CASE WHEN status = 'running' AND done + ? + failed + ? >= total THEN 'complete' ELSE status END,
           updated_at = ?
         WHERE user_id = ? AND id = ?`,
      )
      .bind(ok, bad, problem, problem, ok, bad, this.iso(), this.userId, id)
      .run();
  }

  // --- Address on the hosted domain (ADR 0013) ---

  async githubLogin(): Promise<string | null> {
    const row = await this.db.prepare("SELECT github_login FROM users WHERE id = ?").bind(this.userId).first<{ github_login: string }>();
    return row?.github_login ?? null;
  }

  async getHostedSite(): Promise<HostedSite | null> {
    const row = await this.db
      .prepare("SELECT handle, handle_changed_at, live_build, draft_build, draft_key FROM hosted_sites WHERE user_id = ?")
      .bind(this.userId)
      .first<HostedSiteRow>();
    return row ? toHostedSite(row) : null;
  }

  /**
   * Whether someone else blocks `handle`: their address, their GitHub login (every JAPS user's
   * login stays reserved for them), or a name they gave up recently. Own claims never conflict.
   */
  async handleConflict(handle: string): Promise<HandleConflict | null> {
    const site = await this.db
      .prepare("SELECT 1 AS hit FROM hosted_sites WHERE handle = ? AND user_id != ?")
      .bind(handle, this.userId)
      .first();
    if (site) return "taken";
    const login = await this.db
      .prepare("SELECT 1 AS hit FROM users WHERE lower(github_login) = ? AND id != ?")
      .bind(handle, this.userId)
      .first();
    if (login) return "login";
    const retired = await this.db
      .prepare("SELECT 1 AS hit FROM retired_handles WHERE handle = ? AND until > ? AND (user_id IS NULL OR user_id != ?)")
      .bind(handle, this.iso(), this.userId)
      .first();
    return retired ? "retired" : null;
  }

  /** The first address. False when another user got the handle first (it's UNIQUE). */
  async claimHandle(handle: string): Promise<boolean> {
    const at = this.iso();
    await this.db
      .prepare("INSERT OR IGNORE INTO hosted_sites (user_id, handle, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .bind(this.userId, handle, at, at)
      .run();
    const won = (await this.getHostedSite())?.handle === handle;
    if (won) await this.db.prepare("DELETE FROM retired_handles WHERE handle = ? AND user_id = ?").bind(handle, this.userId).run();
    return won;
  }

  /**
   * A new address. The old one is retired first, so nobody can grab it in between, and goes
   * back to normal if the new one turns out to be taken. False in that case.
   */
  async changeHandle(handle: string, retireUntil: string): Promise<boolean> {
    const current = await this.getHostedSite();
    if (!current) return this.claimHandle(handle);
    if (current.handle === handle) return true;
    const at = this.iso();
    await this.db
      .prepare(
        `INSERT INTO retired_handles (handle, user_id, until) VALUES (?, ?, ?)
         ON CONFLICT(handle) DO UPDATE SET user_id = excluded.user_id, until = excluded.until`,
      )
      .bind(current.handle, this.userId, retireUntil)
      .run();
    await this.db
      .prepare("UPDATE OR IGNORE hosted_sites SET handle = ?, handle_changed_at = ?, updated_at = ? WHERE user_id = ?")
      .bind(handle, at, at, this.userId)
      .run();
    if ((await this.getHostedSite())?.handle !== handle) {
      await this.db.prepare("DELETE FROM retired_handles WHERE handle = ? AND user_id = ?").bind(current.handle, this.userId).run();
      return false;
    }
    // Taking back an own retired name ends its quarantine.
    await this.db.prepare("DELETE FROM retired_handles WHERE handle = ? AND user_id = ?").bind(handle, this.userId).run();
    return true;
  }

  /** What <handle>.japs.app serves from now on, or the latest draft with its secret key. */
  async setHostedBuild(build: { live: string } | { draft: string; key: string }): Promise<void> {
    const at = this.iso();
    const statement =
      "live" in build
        ? this.db.prepare("UPDATE hosted_sites SET live_build = ?, updated_at = ? WHERE user_id = ?").bind(build.live, at, this.userId)
        : this.db
            .prepare("UPDATE hosted_sites SET draft_build = ?, draft_key = ?, updated_at = ? WHERE user_id = ?")
            .bind(build.draft, build.key, at, this.userId);
    await statement.run();
  }

  /**
   * Before account deletion: the current address and earlier ones stay blocked until `until`
   * and show that the portfolio is gone (user_id null), instead of passing to someone at once.
   */
  async retireHandlesForDeletion(until: string): Promise<void> {
    const site = await this.getHostedSite();
    if (site) {
      await this.db
        .prepare(
          `INSERT INTO retired_handles (handle, user_id, until) VALUES (?, NULL, ?)
           ON CONFLICT(handle) DO UPDATE SET user_id = NULL, until = excluded.until`,
        )
        .bind(site.handle, until)
        .run();
    }
    await this.db.prepare("UPDATE retired_handles SET user_id = NULL WHERE user_id = ?").bind(this.userId).run();
  }

  /** Account deletion (#36): the user row cascades to every table. R2 images are deleted by the caller. */
  async deleteAccount(): Promise<void> {
    await this.db.prepare("DELETE FROM users WHERE id = ?").bind(this.userId).run();
  }
}
