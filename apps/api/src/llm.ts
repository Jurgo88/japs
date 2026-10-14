import { LLM_PRESETS, type LlmClient, OpenAiCompatibleClient } from "@japs/core";
import { decrypt } from "./crypto.ts";
import type { UserStore } from "./db.ts";
import type { Env } from "./env.ts";
import { ConnectionError } from "./tokens.ts";

/**
 * Who pays for the texts (#35, ADR 0009): the owner's shared key up to a monthly number of
 * generations per user, then the user's own key. Own keys are AES-GCM encrypted at rest.
 */

export const DEFAULT_FREE_GENERATIONS = 50;

/** Providers a user can bring a key for. Ollama is local-only, so not offered in the cloud. */
export const OWN_KEY_PROVIDERS = ["openai", "gemini", "groq", "openrouter"] as const;
export type OwnKeyProvider = (typeof OWN_KEY_PROVIDERS)[number];

export const monthOf = (now: Date) => now.toISOString().slice(0, 7);

export function freeGenerations(env: Env): number {
  const n = Number(env.JAPS_FREE_GENERATIONS);
  return env.JAPS_FREE_GENERATIONS !== undefined && Number.isInteger(n) && n >= 0 ? n : DEFAULT_FREE_GENERATIONS;
}

export interface Quota {
  /** Generations on the shared key this month. */
  used: number;
  limit: number;
  remaining: number;
  /** With an own key, the quota doesn't apply. */
  ownKey: { provider: string; model: string } | null;
  /** The server has a shared key at all. */
  shared: boolean;
}

export async function quotaFor(user: UserStore, env: Env, now: Date): Promise<Quota> {
  const own = await user.getConnection("llm");
  const used = (await user.getUsage(monthOf(now))).generations;
  const limit = freeGenerations(env);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    ownKey: own ? { provider: String(own.meta?.provider), model: String(own.meta?.model) } : null,
    shared: Boolean(env.OPENAI_API_KEY),
  };
}

export interface ChosenLlm {
  client: LlmClient;
  /** True for the owner's key: counts towards the quota. */
  shared: boolean;
}

/** The user's own key if set, else the shared key; null when neither exists. */
export async function llmFor(user: UserStore, env: Env, fetchImpl: typeof fetch): Promise<ChosenLlm | null> {
  const own = await user.getConnection("llm");
  if (own) {
    const provider = String(own.meta?.provider);
    const preset = LLM_PRESETS[provider];
    const model = String(own.meta?.model ?? "") || preset?.defaultModel;
    if (!preset || !model) throw new ConnectionError(`Your own AI key (${provider}) needs a model. Update it in your profile.`);
    return {
      shared: false,
      client: new OpenAiCompatibleClient({
        provider,
        baseUrl: preset.baseUrl,
        apiKey: await decrypt(own.accessToken, env.ENCRYPTION_KEY),
        model,
        fetch: fetchImpl,
      }),
    };
  }
  if (!env.OPENAI_API_KEY) return null;
  return {
    shared: true,
    client: new OpenAiCompatibleClient({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: env.OPENAI_API_KEY,
      model: env.JAPS_LLM_MODEL || "gpt-5-mini",
      fetch: fetchImpl,
    }),
  };
}
