import type { AnalysisFile, JapsConfigInput, ProjectsFile, ScreenshotsManifest } from "@japs/schema";

/** Everything the editor needs, as one snapshot. */
export interface EditorState {
  configExists: boolean;
  config: JapsConfigInput;
  projects: ProjectsFile | null;
  analysis: AnalysisFile | null;
  screenshots: ScreenshotsManifest | null;
  built: boolean;
}

export interface BuildSummary {
  projects: number;
  screenshots: number;
  warnings: string[];
}

/**
 * Data layer of the editor (ADR 0007). Today: the local `japs edit` server.
 * Phase 3 adds a Supabase implementation; components only see this interface.
 */
export interface EditorBackend {
  load(): Promise<EditorState>;
  saveConfig(config: JapsConfigInput): Promise<void>;
  build(): Promise<BuildSummary>;
  /** Facts + LLM texts for one project (costs money: only on an explicit click). */
  generate(key: string): Promise<GenerateSummary>;
  screenshotUrl(file: string): string;
}

export class BackendError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

/** Talks to `japs edit`. Writes carry the session token the server put into the page. */
export class LocalBackend implements EditorBackend {
  private readonly token = document.querySelector<HTMLMetaElement>('meta[name="japs-token"]')?.content ?? "";

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Japs-Token": this.token, ...init.headers },
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] };
    if (!res.ok) throw new BackendError(body.error ?? `${res.status} ${res.statusText}`, body.issues);
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
}

export interface GenerateSummary {
  generated: number;
  usage: { input: number; output: number };
  dropped: { locale: string; text: string }[];
  warnings: string[];
  model: string;
}
