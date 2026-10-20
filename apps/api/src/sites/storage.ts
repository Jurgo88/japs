import { z } from "zod";
import type { Bucket } from "../env.ts";

/**
 * Hosted portfolios in R2 (ADR 0013, bucket japs-sites), per user:
 *   <user id>/files/<sha1>             content, stored once however many paths or publishes use it
 *   <user id>/deploys/<build id>.json  manifest of one publish: { "/path": "<sha1>" }
 * A publish uploads only content the user's storage doesn't have yet.
 */

export const fileKey = (userId: string, sha: string) => `${userId}/files/${sha}`;
export const manifestKey = (userId: string, buildId: string) => `${userId}/deploys/${buildId}.json`;

export const Manifest = z.object({ version: z.literal(1), files: z.record(z.string(), z.string()) });
export type Manifest = z.infer<typeof Manifest>;

export async function listKeys(bucket: Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix, cursor });
    keys.push(...page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/** Content hashes the user's storage already has. */
export async function storedFiles(bucket: Bucket, userId: string): Promise<Set<string>> {
  const prefix = `${userId}/files/`;
  return new Set((await listKeys(bucket, prefix)).map((key) => key.slice(prefix.length)));
}

export async function writeManifest(bucket: Bucket, userId: string, buildId: string, files: Record<string, string>): Promise<void> {
  const manifest: Manifest = { version: 1, files };
  await bucket.put(manifestKey(userId, buildId), new TextEncoder().encode(JSON.stringify(manifest)), {
    httpMetadata: { contentType: "application/json" },
  });
}

export async function readManifest(bucket: Bucket, userId: string, buildId: string): Promise<Manifest | null> {
  const object = await bucket.get(manifestKey(userId, buildId));
  if (!object) return null;
  return Manifest.safeParse(JSON.parse(await new Response(object.body).text())).data ?? null;
}

/**
 * Keeps the manifests of `keep` (what is live and the latest draft) and the content they use;
 * everything else goes. Only one build runs per user, so nothing in flight is removed. When a
 * kept manifest can't be read, nothing is deleted rather than risk the live site.
 */
export async function pruneSite(bucket: Bucket, userId: string, keep: string[]): Promise<void> {
  const used = new Set<string>();
  for (const buildId of keep) {
    const manifest = await readManifest(bucket, userId, buildId);
    if (!manifest) return;
    for (const sha of Object.values(manifest.files)) used.add(sha);
  }
  const kept = new Set(keep.map((id) => manifestKey(userId, id)));
  const files = `${userId}/files/`;
  const stale = [
    ...(await listKeys(bucket, `${userId}/deploys/`)).filter((key) => !kept.has(key)),
    ...(await listKeys(bucket, files)).filter((key) => !used.has(key.slice(files.length))),
  ];
  // R2 deletes up to 1000 keys a call.
  for (let i = 0; i < stale.length; i += 1000) await bucket.delete(stale.slice(i, i + 1000));
}
