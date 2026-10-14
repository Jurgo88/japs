import { describe, expect, it } from "vitest";
import { NetlifyClient } from "./netlify.ts";

function fakeFetch(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("NetlifyClient.listSiteInputs", () => {
  it("uses the embedded deploy when it has a commit, fetches the full deploy otherwise", async () => {
    const { impl, calls } = fakeFetch({
      "/sites?": [
        {
          id: "a",
          name: "with-commit",
          url: "http://with-commit.netlify.app",
          ssl_url: "https://with-commit.netlify.app",
          custom_domain: null,
          build_settings: {},
          published_deploy: {
            id: "d-a",
            commit_url: "https://github.com/u/a/commit/1",
            context: "production",
            published_at: "2026-10-01T00:00:00.000Z",
          },
        },
        {
          id: "b",
          name: "needs-fetch",
          url: "http://needs-fetch.netlify.app",
          custom_domain: "b.example",
          build_settings: null,
          published_deploy: { id: "d-b", context: "production" },
        },
        { id: "c", name: "never-deployed", url: "http://c.netlify.app", published_deploy: null },
      ],
      "/deploys/d-b": {
        id: "d-b",
        commit_url: "https://github.com/u/b/commit/2",
        framework: "nuxt",
        screenshot_url: "https://cdn.example/b.webp",
        context: "production",
        published_at: "2026-09-01T00:00:00.000Z",
      },
    });

    const inputs = await new NetlifyClient({ token: "t", fetch: impl }).listSiteInputs();

    expect(calls.filter((c) => c.includes("/deploys/"))).toEqual([
      "https://api.netlify.com/api/v1/deploys/d-b",
    ]);
    expect(inputs.map((s) => [s.id, s.deploy?.commitUrl ?? null])).toEqual([
      ["a", "https://github.com/u/a/commit/1"],
      ["b", "https://github.com/u/b/commit/2"],
      ["c", null],
    ]);
    expect(inputs[0]?.url).toBe("https://with-commit.netlify.app");
    expect(inputs[1]).toMatchObject({ customDomain: "b.example", deploy: { framework: "nuxt" } });
    expect(inputs[2]?.deploy).toBeNull();
  });

  it("throws a readable error on API failure", async () => {
    const impl = (async () => new Response("nope", { status: 401, statusText: "Unauthorized" })) as typeof fetch;
    await expect(new NetlifyClient({ token: "bad", fetch: impl }).listSites()).rejects.toThrow(
      "Netlify GET /sites failed: 401 Unauthorized — nope",
    );
  });
});
