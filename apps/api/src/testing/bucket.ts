import type { Bucket } from "../env.ts";

/** In-memory R2 with paging, so deletion has to follow cursors. */
export function fakeBucket(pageSize = 2) {
  const objects = new Map<string, Uint8Array>();
  const bucket: Bucket = {
    put: async (key, value) => void objects.set(key, value),
    get: async (key) => (objects.has(key) ? { body: new Response(objects.get(key)).body! } : null),
    list: async ({ prefix, cursor }) => {
      const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const start = cursor ? Number(cursor) : 0;
      const page = keys.slice(start, start + pageSize);
      const truncated = start + pageSize < keys.length;
      return { objects: page.map((key) => ({ key })), truncated, cursor: truncated ? String(start + pageSize) : undefined };
    },
    delete: async (keys) => keys.forEach((k) => objects.delete(k)),
  };
  return { bucket, objects };
}
