import { describe, expect, it } from "vitest";
import { GitHubClient } from "./github.ts";

function fakeFetch(body: (url: string) => unknown) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return new Response(JSON.stringify(body(url)), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

const rawRepo = (fullName: string, ownerType: string) => ({
  full_name: fullName,
  html_url: `https://github.com/${fullName}`,
  owner: { login: fullName.split("/")[0], type: ownerType },
  private: false,
  fork: false,
});

describe("GitHubClient", () => {
  it("lists owner and collaborator repos by default", async () => {
    const { impl, calls } = fakeFetch(() => [rawRepo("janedoe/site", "User")]);
    const repos = await new GitHubClient({ token: "t", fetch: impl }).listRepoInputs();
    expect(calls[0]).toContain("affiliation=owner,collaborator&");
    expect(repos[0]).toMatchObject({ fullName: "janedoe/site", ownerType: "user", topics: [], archived: false });
  });

  it("adds organization repos on request and marks their owner type", async () => {
    const { impl, calls } = fakeFetch(() => [rawRepo("acme-agency/landing", "Organization")]);
    const repos = await new GitHubClient({ token: "t", fetch: impl }).listRepoInputs({ includeOrgRepos: true });
    expect(calls[0]).toContain("affiliation=owner,collaborator,organization_member&");
    expect(repos[0]?.ownerType).toBe("organization");
  });

  it("paginates until a short page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => rawRepo(`janedoe/r${i}`, "User"));
    const { impl, calls } = fakeFetch((url) => (/[?&]page=1$/.test(url) ? full : []));
    const repos = await new GitHubClient({ token: "t", fetch: impl }).listRepoInputs();
    expect(repos).toHaveLength(100);
    expect(calls).toHaveLength(2);
  });

  it("reads the token owner's login", async () => {
    const { impl, calls } = fakeFetch(() => ({ login: "JaneDoe", id: 1 }));
    expect(await new GitHubClient({ token: "t", fetch: impl }).getLogin()).toBe("JaneDoe");
    expect(calls).toEqual(["https://api.github.com/user"]);
  });

  it("throws a readable error without leaking the query", async () => {
    const impl = (async () => new Response("nope", { status: 401, statusText: "Unauthorized" })) as typeof fetch;
    await expect(new GitHubClient({ token: "bad", fetch: impl }).listRepoInputs()).rejects.toThrow(
      "GitHub /user/repos failed: 401 Unauthorized",
    );
  });
});
