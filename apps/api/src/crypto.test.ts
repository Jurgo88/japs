import { describe, expect, it } from "vitest";
import { base64url, decrypt, encrypt, randomToken, sha256, sign, unsign } from "./crypto.ts";

const key = base64url(new Uint8Array(32).fill(7));
const otherKey = base64url(new Uint8Array(32).fill(8));

describe("encrypt / decrypt", () => {
  it("round-trips, with a fresh IV each time", async () => {
    const a = await encrypt("gho_secret", key);
    const b = await encrypt("gho_secret", key);
    expect(a).toMatch(/^v1:/);
    expect(a).not.toBe(b);
    expect(a).not.toContain("gho_secret");
    expect(await decrypt(a, key)).toBe("gho_secret");
  });

  it("fails with the wrong key or tampered data", async () => {
    const ct = await encrypt("gho_secret", key);
    await expect(decrypt(ct, otherKey)).rejects.toThrow();
    const tampered = ct.slice(0, -2) + (ct.endsWith("A") ? "BB" : "AA");
    await expect(decrypt(tampered, key)).rejects.toThrow();
  });

  it("rejects a key of the wrong length", async () => {
    await expect(encrypt("x", base64url(new Uint8Array(16)))).rejects.toThrow("32 bytes");
  });
});

describe("sign / unsign", () => {
  it("returns the value only with a valid signature", async () => {
    const signed = await sign("state-123", "session-secret");
    expect(await unsign(signed, "session-secret")).toBe("state-123");
    expect(await unsign(signed, "other-secret")).toBeNull();
    expect(await unsign(signed.replace("state-123", "state-124"), "session-secret")).toBeNull();
    expect(await unsign("garbage", "session-secret")).toBeNull();
  });
});

describe("tokens", () => {
  it("are random, URL-safe and hash deterministically", async () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    expect(await sha256("abc")).toBe(await sha256("abc"));
    expect(await sha256("abc")).not.toBe(await sha256("abd"));
  });
});
