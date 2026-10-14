/**
 * Secrets at rest and session tokens (ADR 0009). Web Crypto only: runs in Workers and Node.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 256-bit random token, URL-safe. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

const VERSION = "v1";

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = fromBase64url(secret);
  if (raw.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64url-encoded");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM with a random 96-bit IV; "v1:" prefix leaves room for key rotation. */
export async function encrypt(plaintext: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), encoder.encode(plaintext)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `${VERSION}:${base64url(out)}`;
}

export async function decrypt(ciphertext: string, secret: string): Promise<string> {
  const [version, payload] = ciphertext.split(":");
  if (version !== VERSION || !payload) throw new Error("Unknown secret format");
  const data = fromBase64url(payload);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, await aesKey(secret), data.slice(12));
  return decoder.decode(plain);
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** `value.signature` for short-lived cookies (OAuth state). */
export async function sign(value: string, secret: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(value)));
  return `${value}.${base64url(sig)}`;
}

/** The value if the signature matches, else null (constant-time via subtle.verify). */
export async function unsign(signed: string, secret: string): Promise<string | null> {
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const value = signed.slice(0, dot);
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromBase64url(signed.slice(dot + 1));
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(value));
  return ok ? value : null;
}
