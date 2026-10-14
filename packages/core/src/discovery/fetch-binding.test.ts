import { describe, expect, it } from "vitest";
import { GitHubClient } from "./github.ts";
import { NetlifyClient } from "./netlify.ts";

/**
 * Cloudflare Workers' fetch throws "Illegal invocation" when called as a method of another
 * object (`this.fetchImpl(url)`). Node doesn't, so this fake reproduces it.
 */
function workersLikeFetch(body: unknown) {
  return function (this: unknown) {
    if (this !== undefined && this !== globalThis) {
      throw new TypeError("Illegal invocation: function called with incorrect `this` reference.");
    }
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  } as unknown as typeof fetch;
}

describe("clients call fetch as a plain function (Workers)", () => {
  it("NetlifyClient", async () => {
    const client = new NetlifyClient({ token: "t", fetch: workersLikeFetch([]) });
    await expect(client.listSites()).resolves.toEqual([]);
  });

  it("GitHubClient", async () => {
    const client = new GitHubClient({ token: "t", fetch: workersLikeFetch({ login: "jane" }) });
    await expect(client.getLogin()).resolves.toBe("jane");
  });
});

describe("GitHub requests carry a User-Agent", () => {
  it("is set explicitly (GitHub answers 403 without one; Workers don't add it)", async () => {
    let headers: Record<string, string> = {};
    const fetchSpy = (async (_input: string | URL | Request, init?: RequestInit) => {
      headers = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ login: "jane" }), { status: 200 });
    }) as typeof fetch;
    await new GitHubClient({ token: "t", fetch: fetchSpy }).getLogin();
    expect(headers["User-Agent"]).toMatch(/^JAPS/);
  });
});
