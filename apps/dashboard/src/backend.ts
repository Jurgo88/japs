import type { AnalysisFile, JapsConfigInput, ProjectsFile, ScreenshotsManifest } from "@japs/schema";

/** Everything the editor needs, as one snapshot. */
export interface EditorState {
  /** "cloud" when served by the hosted API (ADR 0009); the local `japs edit` server omits it. */
  mode?: "local" | "cloud";
  configExists: boolean;
  config: JapsConfigInput;
  projects: ProjectsFile | null;
  analysis: AnalysisFile | null;
  screenshots: ScreenshotsManifest | null;
  built: boolean;
  /** Hosted only: the latest import / generation job. */
  job?: CloudJob | null;
}

/** A background job in the hosted version (#32). */
export interface CloudJob {
  id: string;
  kind: "sync" | "generate";
  status: "running" | "complete" | "failed";
  total: number;
  done: number;
  failed: number;
  message: string | null;
  problems: string[];
}

/** A publish to the user's Netlify (#34). Local publishes finish in one request. */
export interface PublishStatus {
  id: string;
  status: "building" | "deploying" | "live" | "failed";
  /** Absent from older servers: Netlify. */
  target?: "netlify" | "cloudflare" | "japs";
  draft: boolean;
  siteUrl: string;
  url: string | null;
  message: string | null;
  createdAt: string;
}

export interface BuildSummary {
  projects: number;
  screenshots: number;
  warnings: string[];
}

export interface GenerateSummary {
  generated: number;
  usage: { input: number; output: number };
  dropped: { locale: string; text: string }[];
  warnings: string[];
  model: string;
}

/** Local settings from .env (japs edit): only whether tokens are set, never their values. */
export interface LocalEnvironment {
  tokens: { github: boolean; netlify: boolean; cloudflare: boolean };
  llm: { provider: string; model: string | null; ready: boolean; problem: string | null };
}

/** The portfolio's address on the hosted domain, <handle>.japs.app (ADR 0013). */
export interface SiteInfo {
  /** False when this server doesn't host portfolios. */
  available: boolean;
  domain?: string;
  site?: { handle: string; url: string; live: boolean; nextChangeAt: string | null } | null;
  /** The GitHub login, while there is no address yet and it's free. */
  suggestion?: string | null;
}

export interface HandleCheck {
  handle: string;
  available: boolean;
  problem: string | null;
}

/** The signed-in user in the hosted version. */
export interface Account {
  user: { login: string; name: string | null; avatarUrl: string | null };
  connections: { provider: "github" | "netlify" | "cloudflare" | "llm"; accountLogin: string | null }[];
  /** The server offers "Connect Cloudflare" (ADR 0012). */
  cloudflareAvailable?: boolean;
  /** AI generations on the shared key this month (#35). */
  quota: { used: number; limit: number; remaining: number; ownKey: { provider: string; model: string } | null; shared: boolean };
  /** Install the GitHub App on repositories, so private ones become readable. */
  githubAppInstallUrl: string | null;
}

/**
 * Data layer of the editor (ADR 0007, 0009). The local `japs edit` server and the hosted API
 * expose the same endpoints, so one HTTP implementation serves both; components only see this.
 */
export interface EditorBackend {
  load(): Promise<EditorState>;
  saveConfig(config: JapsConfigInput): Promise<void>;
  build(): Promise<BuildSummary>;
  /** Facts + LLM texts for one project (costs money: only on an explicit click). */
  generate(key: string): Promise<GenerateSummary>;
  screenshotUrl(file: string): string;
  /** Hosted only: who is signed in. */
  account(): Promise<Account>;
  signOut(): Promise<void>;
  /** Hosted only: import projects (+ facts and texts) in the background. */
  startSync(): Promise<CloudJob>;
  /** Hosted only: facts + texts for the picked projects, in the background. */
  startGenerate(keys: string[]): Promise<CloudJob>;
  latestJob(): Promise<CloudJob | null>;
  /** Hosted only: the user's own AI key (stored encrypted on the server). */
  saveAiKey(provider: string, model: string, apiKey: string): Promise<void>;
  removeAiKey(): Promise<void>;
  /** Builds the portfolio with the chosen theme and deploys it to the user's own Netlify site. */
  publish(draft: boolean): Promise<PublishStatus>;
  latestPublish(): Promise<PublishStatus | null>;
  /** Hosted only: deletes the account and all its data; `confirm` is the GitHub login. */
  deleteAccount(confirm: string): Promise<void>;
  /** Local only: which tokens .env provides and the LLM in use. */
  environment(): Promise<LocalEnvironment>;
  /** Hosted only: removes a Netlify or Cloudflare connection (revoked where possible). */
  disconnect(provider: "netlify" | "cloudflare"): Promise<void>;
  /** Hosted only: the address on japs.app, whether a name is free, and picking one. */
  site(): Promise<SiteInfo>;
  checkHandle(handle: string): Promise<HandleCheck>;
  saveHandle(handle: string): Promise<SiteInfo>;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

/**
 * Same-origin HTTP. Locally, writes carry the session token `japs edit` put into the page;
 * hosted, the session cookie goes along automatically.
 */
export class HttpBackend implements EditorBackend {
  private readonly token = document.querySelector<HTMLMetaElement>('meta[name="japs-token"]')?.content ?? "";

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { "X-Japs-Token": this.token } : {}),
        ...init.headers,
      },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
    if (!res.ok) throw new BackendError(body.error ?? `${res.status} ${res.statusText}`, res.status, body.issues);
    return body as T;
  }

  load(): Promise<EditorState> {
    return this.call("/api/state");
  }

  async saveConfig(config: JapsConfigInput): Promise<void> {
    await this.call("/api/config", { method: "PUT", body: JSON.stringify(config) });
  }

  build(): Promise<BuildSummary> {
    return this.call("/api/build", { method: "POST" });
  }

  generate(key: string): Promise<GenerateSummary> {
    return this.call("/api/generate", { method: "POST", body: JSON.stringify({ key }) });
  }

  screenshotUrl(file: string): string {
    return `/api/screenshots/${encodeURIComponent(file)}`;
  }

  account(): Promise<Account> {
    return this.call("/api/me");
  }

  async signOut(): Promise<void> {
    await this.call("/auth/logout", { method: "POST" });
  }

  async startSync(): Promise<CloudJob> {
    return (await this.call<{ job: CloudJob }>("/api/jobs/sync", { method: "POST" })).job;
  }

  async startGenerate(keys: string[]): Promise<CloudJob> {
    return (await this.call<{ job: CloudJob }>("/api/generate", { method: "POST", body: JSON.stringify({ keys }) })).job;
  }

  async latestJob(): Promise<CloudJob | null> {
    return (await this.call<{ job: CloudJob | null }>("/api/jobs/latest")).job;
  }

  async publish(draft: boolean): Promise<PublishStatus> {
    return (await this.call<{ publish: PublishStatus }>("/api/publish", { method: "POST", body: JSON.stringify({ draft }) })).publish;
  }

  async latestPublish(): Promise<PublishStatus | null> {
    return (await this.call<{ publish: PublishStatus | null }>("/api/publish/latest")).publish;
  }

  environment(): Promise<LocalEnvironment> {
    return this.call("/api/environment");
  }

  async disconnect(provider: "netlify" | "cloudflare"): Promise<void> {
    await this.call(`/api/connections/${provider}`, { method: "DELETE" });
  }

  async deleteAccount(confirm: string): Promise<void> {
    await this.call("/api/account", { method: "DELETE", body: JSON.stringify({ confirm }) });
  }

  async saveAiKey(provider: string, model: string, apiKey: string): Promise<void> {
    await this.call("/api/llm", { method: "PUT", body: JSON.stringify({ provider, model, apiKey }) });
  }

  async removeAiKey(): Promise<void> {
    await this.call("/api/connections/llm", { method: "DELETE" });
  }

  site(): Promise<SiteInfo> {
    return this.call("/api/site");
  }

  checkHandle(handle: string): Promise<HandleCheck> {
    return this.call(`/api/site/check?handle=${encodeURIComponent(handle)}`);
  }

  saveHandle(handle: string): Promise<SiteInfo> {
    return this.call("/api/site", { method: "PUT", body: JSON.stringify({ handle }) });
  }
}
