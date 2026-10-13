import { describe, expect, it } from "vitest";
import { LlmError, OpenAiCompatibleClient } from "./llm.ts";

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Captured[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const next = responses[calls.length - 1] ?? responses.at(-1)!;
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const completion = (content: string, finish = "stop") => ({
  choices: [{ finish_reason: finish, message: { content } }],
  usage: { prompt_tokens: 1200, completion_tokens: 300 },
});

const request = {
  system: "sys",
  messages: [{ role: "user" as const, content: "facts" }],
  schemaName: "project_copy",
  schema: { type: "object" },
};

const client = (impl: typeof fetch, apiKey: string | null = "k") =>
  new OpenAiCompatibleClient({ provider: "openai", baseUrl: "https://api.example/v1/", apiKey, model: "m-1", fetch: impl });

describe("OpenAiCompatibleClient", () => {
  it("sends a strict json_schema request and returns parsed JSON with usage", async () => {
    const { impl, calls } = fakeFetch([{ body: completion('{"title":"x"}') }]);
    const res = await client(impl).generateJson(request);

    expect(res).toEqual({ json: { title: "x" }, text: '{"title":"x"}', usage: { input: 1200, output: 300 } });
    expect(calls[0]?.url).toBe("https://api.example/v1/chat/completions");
    expect(calls[0]?.headers.Authorization).toBe("Bearer k");
    expect(calls[0]?.body).toEqual({
      model: "m-1",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "facts" },
      ],
      response_format: { type: "json_schema", json_schema: { name: "project_copy", strict: true, schema: { type: "object" } } },
    });
  });

  it("omits the Authorization header without a key (Ollama)", async () => {
    const { impl, calls } = fakeFetch([{ body: completion("{}") }]);
    await client(impl, null).generateJson(request);
    expect(calls[0]?.headers.Authorization).toBeUndefined();
  });

  it("falls back to json_object once when json_schema is rejected, and remembers it", async () => {
    const { impl, calls } = fakeFetch([
      { status: 400, body: { error: { message: "response_format json_schema is not supported" } } },
      { body: completion("{}") },
      { body: completion("{}") },
    ]);
    const llm = client(impl);
    await llm.generateJson(request);
    await llm.generateJson(request);

    expect(calls.map((c) => (c.body.response_format as { type: string }).type)).toEqual([
      "json_schema",
      "json_object",
      "json_object",
    ]);
    expect((calls[1]?.body.messages as { content: string }[])[0]?.content).toContain("JSON Schema");
  });

  it("returns undefined json for non-JSON text, so the caller can retry", async () => {
    const { impl } = fakeFetch([{ body: completion("Sure! Here you go") }]);
    expect((await client(impl).generateJson(request)).json).toBeUndefined();
  });

  it.each([
    [{ status: 401, body: { error: { message: "Incorrect API key provided" } } }, "openai 401: Incorrect API key provided"],
    [{ body: completion("{}", "length") }, "output was cut off"],
    [{ body: { choices: [{ message: { content: null, refusal: "I can't help" } }] } }, "refused: I can't help"],
  ])("throws a readable LlmError (%#)", async (response, message) => {
    const { impl } = fakeFetch([response]);
    const promise = client(impl).generateJson(request);
    await expect(promise).rejects.toBeInstanceOf(LlmError);
    await expect(promise).rejects.toThrow(message);
  });
});
