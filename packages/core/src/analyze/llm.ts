import { z } from "zod";
import type { TokenUsage } from "@japs/schema";

/** Provider-neutral LLM interface (ADR 0006). Analysis only depends on this. */
export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  /** Returns the parsed JSON object the model produced for `schema`. */
  generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse>;
}

export interface LlmJsonRequest {
  system: string;
  /** Conversation after the system prompt; a retry appends the failed answer and the error. */
  messages: { role: "user" | "assistant"; content: string }[];
  schemaName: string;
  /** JSON Schema of the expected object (strict: every property required, no extras). */
  schema: Record<string, unknown>;
}

export interface LlmJsonResponse {
  json: unknown;
  /** Raw text, for the retry message when validation fails. */
  text: string;
  usage: TokenUsage;
}

export interface LlmPreset {
  baseUrl: string;
  /** Environment variable holding the key; null for local servers. */
  apiKeyEnv: string | null;
  /** Default model, or null when the user must choose one (model names change too often). */
  defaultModel: string | null;
}

/** OpenAI-compatible endpoints. Only base URL, key and model differ. */
export const LLM_PRESETS: Record<string, LlmPreset> = {
  openai: { baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", defaultModel: "gpt-5-mini" },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyEnv: "GEMINI_API_KEY",
    defaultModel: null,
  },
  groq: { baseUrl: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY", defaultModel: null },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY", defaultModel: null },
  ollama: { baseUrl: "http://localhost:11434/v1", apiKeyEnv: null, defaultModel: null },
};

const ChatCompletion = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullish(),
        message: z.object({ content: z.string().nullish(), refusal: z.string().nullish() }),
      }),
    )
    .min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }).nullish(),
});

export interface OpenAiCompatibleOptions {
  provider: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  fetch?: typeof fetch;
  /** Per request. Reasoning models can take a while. Default 120 s. */
  timeoutMs?: number;
}

export class LlmError extends Error {}

/**
 * Chat Completions with `response_format: json_schema`. Some compatible servers reject
 * json_schema; then it falls back once to `json_object` with the schema in the prompt.
 */
export class OpenAiCompatibleClient implements LlmClient {
  readonly provider: string;
  readonly model: string;
  private readonly options: OpenAiCompatibleOptions;
  private schemaUnsupported = false;

  constructor(options: OpenAiCompatibleOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.options = options;
  }

  async generateJson(request: LlmJsonRequest): Promise<LlmJsonResponse> {
    if (!this.schemaUnsupported) {
      const res = await this.post(request, {
        type: "json_schema",
        json_schema: { name: request.schemaName, strict: true, schema: request.schema },
      });
      if (res.status !== 400 || !/response_format|json_schema/i.test(res.body)) return this.parse(res);
      this.schemaUnsupported = true;
    }
    const withSchema = {
      ...request,
      system: `${request.system}\n\nRespond with a single JSON object matching this JSON Schema:\n${JSON.stringify(request.schema)}`,
    };
    return this.parse(await this.post(withSchema, { type: "json_object" }));
  }

  private async post(request: LlmJsonRequest, responseFormat: unknown): Promise<{ status: number; body: string }> {
    const { baseUrl, apiKey, fetch: fetchImpl = globalThis.fetch, timeoutMs = 120_000 } = this.options;
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: request.system }, ...request.messages],
        response_format: responseFormat,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, body: await res.text() };
  }

  private parse({ status, body }: { status: number; body: string }): LlmJsonResponse {
    if (status < 200 || status >= 300) {
      throw new LlmError(`${this.provider} ${status}: ${errorDetail(body)}`);
    }
    const completion = ChatCompletion.parse(JSON.parse(body));
    const choice = completion.choices[0]!;
    if (choice.message.refusal) throw new LlmError(`${this.provider} refused: ${choice.message.refusal}`);
    if (choice.finish_reason === "length") throw new LlmError(`${this.provider}: output was cut off (length limit)`);
    const text = choice.message.content ?? "";
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return {
      json,
      text,
      usage: { input: completion.usage?.prompt_tokens ?? 0, output: completion.usage?.completion_tokens ?? 0 },
    };
  }
}

/** The provider's error message without echoing the whole body. */
function errorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } | string };
    const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    if (message) return message;
  } catch {
    // not JSON
  }
  return body.slice(0, 200);
}
