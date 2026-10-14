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

/** The signed-in user in the hosted version. */
export interface Account {
  user: { login: string; name: string | null; avatarUrl: string | null };
  connections: { provider: "github" | "netlify" | "llm"; accountLogin: string | null }[];
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
  /** Hosted only: texts for one project in the background. */
  startGenerate(key: string): Promise<CloudJob>;
  latestJob(): Promise<CloudJob | null>;
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

  async startGenerate(key: string): Promise<CloudJob> {
    return (await this.call<{ job: CloudJob }>("/api/generate", { method: "POST", body: JSON.stringify({ key }) })).job;
  }

  async latestJob(): Promise<CloudJob | null> {
    return (await this.call<{ job: CloudJob | null }>("/api/jobs/latest")).job;
  }
}
