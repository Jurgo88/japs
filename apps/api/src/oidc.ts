import { z } from "zod";
import { fromBase64url } from "./crypto.ts";

/**
 * GitHub Actions OIDC (ADR 0011): the publish workflow proves who it is with a short-lived
 * token signed by GitHub. Only a run of `.github/workflows/publish.yml` on `main` of the JAPS
 * repo passes, so a fork or another workflow can never read a portfolio or deploy to a site.
 */

export const ACTIONS_ISSUER = "https://token.actions.githubusercontent.com";
export const BUILD_WORKFLOW = ".github/workflows/publish.yml";

export class OidcError extends Error {}

const Claims = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  nbf: z.number().optional(),
  repository: z.string(),
  ref: z.string(),
  workflow_ref: z.string(),
  run_id: z.string(),
});

const Jwks = z.object({
  keys: z.array(z.object({ kid: z.string(), kty: z.literal("RSA"), n: z.string(), e: z.string() }).passthrough()),
});

/** GitHub's signing keys, kept per isolate for an hour; a new kid triggers a refetch. */
let jwksCache: { keys: z.infer<typeof Jwks>["keys"]; until: number } | null = null;

async function signingKey(kid: string, fetchImpl: typeof fetch, now: number): Promise<CryptoKey> {
  const find = () => jwksCache?.keys.find((k) => k.kid === kid);
  if (!jwksCache || jwksCache.until < now || !find()) {
    const res = await fetchImpl(`${ACTIONS_ISSUER}/.well-known/jwks`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new OidcError(`Could not load GitHub's signing keys: ${res.status}`);
    jwksCache = { keys: Jwks.parse(await res.json()).keys, until: now + 3_600_000 };
  }
  const jwk = find();
  if (!jwk) throw new OidcError("Unknown signing key");
  return crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, [
    "verify",
  ]);
}

export interface ActionsIdentity {
  runId: string;
}

export async function verifyActionsToken(
  token: string,
  options: { audience: string; repository: string; fetch: typeof fetch; now?: Date },
): Promise<ActionsIdentity> {
  const now = (options.now ?? new Date()).getTime();
  const [rawHeader, rawPayload, rawSignature] = token.split(".");
  if (!rawHeader || !rawPayload || !rawSignature) throw new OidcError("Malformed token");

  const decode = (part: string): unknown => JSON.parse(new TextDecoder().decode(fromBase64url(part)));
  let header: { alg?: string; kid?: string };
  let claims: z.infer<typeof Claims>;
  try {
    header = decode(rawHeader) as { alg?: string; kid?: string };
    claims = Claims.parse(decode(rawPayload));
  } catch {
    throw new OidcError("Malformed token");
  }
  if (header.alg !== "RS256" || !header.kid) throw new OidcError("Unexpected token algorithm");

  const key = await signingKey(header.kid, options.fetch, now);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    fromBase64url(rawSignature),
    new TextEncoder().encode(`${rawHeader}.${rawPayload}`),
  );
  if (!valid) throw new OidcError("Bad signature");

  const seconds = now / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ACTIONS_ISSUER) throw new OidcError("Wrong issuer");
  if (!audiences.includes(options.audience)) throw new OidcError("Wrong audience");
  if (claims.exp < seconds - 30 || (claims.nbf !== undefined && claims.nbf > seconds + 30)) throw new OidcError("Token expired");
  if (claims.repository !== options.repository) throw new OidcError("Wrong repository");
  if (claims.ref !== "refs/heads/main" || claims.workflow_ref !== `${options.repository}/${BUILD_WORKFLOW}@refs/heads/main`) {
    throw new OidcError("Wrong workflow");
  }
  return { runId: claims.run_id };
}

/** Tests only: forget cached keys between cases. */
export function resetJwksCache(): void {
  jwksCache = null;
}
