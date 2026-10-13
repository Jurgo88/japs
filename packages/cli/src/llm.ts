import { LLM_PRESETS, OpenAiCompatibleClient } from "@japs/core";

/** Resolves the LLM client from environment variables (ADR 0006). Throws with a fix-it message. */
export function llmFromEnv(env: NodeJS.ProcessEnv): OpenAiCompatibleClient {
  const provider = (env.JAPS_LLM_PROVIDER || "openai").toLowerCase();
  const preset = LLM_PRESETS[provider];
  const baseUrl = env.JAPS_LLM_BASE_URL || preset?.baseUrl;
  if (!baseUrl) {
    throw new Error(
      `Unknown JAPS_LLM_PROVIDER "${provider}". Use one of ${Object.keys(LLM_PRESETS).join(", ")}, or set JAPS_LLM_BASE_URL to an OpenAI-compatible endpoint.`,
    );
  }

  const model = env.JAPS_LLM_MODEL || preset?.defaultModel;
  if (!model) throw new Error(`Set JAPS_LLM_MODEL in .env — provider "${provider}" has no default model.`);

  const keyEnv = preset?.apiKeyEnv ?? null;
  const apiKey = env.JAPS_LLM_API_KEY || (keyEnv ? env[keyEnv] : undefined) || null;
  if (!apiKey && keyEnv) throw new Error(`Set ${keyEnv} (or JAPS_LLM_API_KEY) in .env for provider "${provider}".`);

  return new OpenAiCompatibleClient({ provider, baseUrl, apiKey, model });
}
