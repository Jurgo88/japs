import { base64url } from "../crypto.ts";
import { ACTIONS_ISSUER } from "../oidc.ts";

/** A fake GitHub Actions OIDC issuer: its own RSA key, a JWKS response and signed tokens. */
export async function fakeIssuer() {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const jwks = { keys: [{ kid: "k1", kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", use: "sig" }] };

  const enc = (v: unknown) => base64url(new TextEncoder().encode(JSON.stringify(v)));
  async function token(claims: Record<string, unknown> = {}, kid = "k1"): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const body = `${enc({ alg: "RS256", kid, typ: "JWT" })}.${enc({
      iss: ACTIONS_ISSUER,
      aud: "https://japs.example.dev",
      exp: now + 300,
      nbf: now - 10,
      repository: "jane/japs",
      ref: "refs/heads/main",
      workflow_ref: "jane/japs/.github/workflows/publish.yml@refs/heads/main",
      run_id: "1001",
      ...claims,
    })}`;
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(body)));
    return `${body}.${base64url(sig)}`;
  }

  /** Answers the JWKS URL; returns null for anything else so callers can chain fakes. */
  const handle = (url: string): Response | null =>
    url === `${ACTIONS_ISSUER}/.well-known/jwks` ? new Response(JSON.stringify(jwks), { status: 200 }) : null;
  return { token, handle };
}
