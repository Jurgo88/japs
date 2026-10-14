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

export type Provider = "github" | "netlify" | "llm";
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

  /** Account deletion (#36): the user row cascades to sessions, connections, documents and usage. */
  async deleteAccount(): Promise<void> {
    await this.db.prepare("DELETE FROM users WHERE id = ?").bind(this.userId).run();
  }
}
