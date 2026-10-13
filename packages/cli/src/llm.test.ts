import { describe, expect, it } from "vitest";
import { llmFromEnv } from "./llm.ts";

describe("llmFromEnv", () => {
  it("defaults to OpenAI with gpt-5-mini", () => {
    const llm = llmFromEnv({ OPENAI_API_KEY: "sk" });
    expect([llm.provider, llm.model]).toEqual(["openai", "gpt-5-mini"]);
  });

  it("uses the preset's key variable and requires a model where there is no default", () => {
    expect(() => llmFromEnv({ JAPS_LLM_PROVIDER: "gemini", GEMINI_API_KEY: "g" })).toThrow("Set JAPS_LLM_MODEL");
    const llm = llmFromEnv({ JAPS_LLM_PROVIDER: "Gemini", GEMINI_API_KEY: "g", JAPS_LLM_MODEL: "gemini-flash" });
    expect([llm.provider, llm.model]).toEqual(["gemini", "gemini-flash"]);
  });

  it("needs no key for Ollama", () => {
    expect(llmFromEnv({ JAPS_LLM_PROVIDER: "ollama", JAPS_LLM_MODEL: "qwen3" }).provider).toBe("ollama");
  });

  it("explains a missing key and an unknown provider", () => {
    expect(() => llmFromEnv({})).toThrow("Set OPENAI_API_KEY (or JAPS_LLM_API_KEY)");
    expect(() => llmFromEnv({ JAPS_LLM_PROVIDER: "acme" })).toThrow('Unknown JAPS_LLM_PROVIDER "acme"');
  });

  it("accepts a custom endpoint for an unknown provider name", () => {
    const llm = llmFromEnv({
      JAPS_LLM_PROVIDER: "lmstudio",
      JAPS_LLM_BASE_URL: "http://localhost:1234/v1",
      JAPS_LLM_MODEL: "local",
    });
    expect([llm.provider, llm.model]).toEqual(["lmstudio", "local"]);
  });
});
