import { beforeEach, describe, expect, it } from "vitest";
import { resetJwksCache, verifyActionsToken } from "./oidc.ts";
import { fakeIssuer } from "./testing/oidc.ts";

let issuer: Awaited<ReturnType<typeof fakeIssuer>>;
const fetch = (async (input: string | URL | Request) => issuer.handle(String(input)) ?? new Response("{}", { status: 404 })) as typeof globalThis.fetch;
const verify = (token: string) => verifyActionsToken(token, { audience: "https://japs.example.dev", repository: "jane/japs", fetch });

beforeEach(async () => {
  resetJwksCache();
  issuer = await fakeIssuer();
});

describe("GitHub Actions OIDC", () => {
  it("accepts the publish workflow on main and returns its run", async () => {
    expect(await verify(await issuer.token())).toEqual({ runId: "1001" });
  });

  it.each([
    ["another repository (a fork)", { repository: "mallory/japs", workflow_ref: "mallory/japs/.github/workflows/publish.yml@refs/heads/main" }, /repository/],
    ["another workflow", { workflow_ref: "jane/japs/.github/workflows/ci.yml@refs/heads/main" }, /workflow/],
    ["another branch", { ref: "refs/heads/feature", workflow_ref: "jane/japs/.github/workflows/publish.yml@refs/heads/feature" }, /workflow/],
    ["another audience", { aud: "https://evil.example" }, /audience/],
    ["another issuer", { iss: "https://evil.example" }, /issuer/],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 600 }, /expired/],
  ])("refuses %s", async (_, claims, error) => {
    await expect(verify(await issuer.token(claims))).rejects.toThrow(error);
  });

  it("refuses a token signed by someone else or tampered with", async () => {
    const other = await fakeIssuer();
    await expect(verify(await other.token())).rejects.toThrow(/signature/);

    const [h, , s] = (await issuer.token()).split(".");
    const forged = Buffer.from(JSON.stringify({ repository: "jane/japs" })).toString("base64url");
    await expect(verify(`${h}.${forged}.${s}`)).rejects.toThrow(/Malformed|signature/);
    await expect(verify("not-a-jwt")).rejects.toThrow(/Malformed/);
  });
});
