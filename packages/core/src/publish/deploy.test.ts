import { describe, expect, it } from "vitest";
import { NetlifyClient } from "../discovery/netlify.ts";
import { createSite, deploySite, findSite, sha1Hex } from "./deploy.ts";

const bytes = (text: string) => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;

type Call = { method: string; url: string; body: unknown };

/** Fake Netlify: answers by "METHOD path" prefix; records calls. */
function fakeNetlify(routes: Record<string, (body: unknown, calls: Call[]) => { status?: number; body?: unknown }>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace("https://api.netlify.com/api/v1", "");
    const method = init?.method ?? "GET";
    const raw = init?.body;
    const body = typeof raw === "string" ? JSON.parse(raw) : raw instanceof Uint8Array ? new TextDecoder().decode(raw) : raw;
    calls.push({ method, url, body });
    const key = Object.keys(routes).find((k) => `${method} ${url}`.startsWith(k));
    if (!key) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404, statusText: "Not Found" });
    const res = routes[key]!(body, calls);
    return new Response(res.body === undefined ? "" : JSON.stringify(res.body), { status: res.status ?? 200 });
  }) as typeof fetch;
  return { netlify: new NetlifyClient({ token: "t", fetch: impl }), calls };
}

const noWait = async () => {};

describe("deploySite", () => {
  it("sends digests, uploads only required content once, and waits until ready", async () => {
    const index = bytes("<h1>Home</h1>");
    const shot = bytes("JPEG");
    const indexSha = await sha1Hex(index);
    let polls = 0;
    const { netlify, calls } = fakeNetlify({
      "POST /sites/site-1/deploys": () => ({ body: { id: "d1", state: "uploading", required: [indexSha] } }),
      "PUT /deploys/d1/files/": () => ({ body: {} }),
      "GET /deploys/d1": () => ({
        body: polls++ < 1 ? { id: "d1", state: "processing" } : { id: "d1", state: "ready", ssl_url: "https://jane.netlify.app" },
      }),
    });

    const result = await deploySite(
      netlify,
      "site-1",
      [
        { path: "/index.html", content: index },
        { path: "/sk/index.html", content: index },
        { path: "/screenshots/a b.jpg", content: shot },
      ],
      { wait: noWait },
    );

    expect(calls[0]).toMatchObject({
      method: "POST",
      body: { files: { "/index.html": indexSha, "/sk/index.html": indexSha, "/screenshots/a b.jpg": await sha1Hex(shot) }, draft: false },
    });
    const uploads = calls.filter((c) => c.method === "PUT");
    expect(uploads).toEqual([{ method: "PUT", url: "/deploys/d1/files/index.html", body: "<h1>Home</h1>" }]);
    expect(result).toEqual({ deployId: "d1", url: "https://jane.netlify.app", uploaded: 1, total: 3 });
  });

  it("encodes paths and returns the preview URL for a draft", async () => {
    const shot = bytes("JPEG");
    const { netlify, calls } = fakeNetlify({
      "POST /sites/s/deploys": () => ({ body: { id: "d2", state: "uploading", required: [] } }),
      "GET /deploys/d2": () => ({ body: { id: "d2", state: "ready", deploy_ssl_url: "https://d2--jane.netlify.app" } }),
    });
    const result = await deploySite(netlify, "s", [{ path: "/a b.jpg", content: shot }], { draft: true, wait: noWait });
    expect(calls[0]?.body).toMatchObject({ draft: true });
    expect(result.url).toBe("https://d2--jane.netlify.app");
  });

  it("surfaces a failed deploy with Netlify's message", async () => {
    const { netlify } = fakeNetlify({
      "POST /sites/s/deploys": () => ({ body: { id: "d3", state: "error", error_message: "Quota exceeded" } }),
    });
    await expect(deploySite(netlify, "s", [], { wait: noWait })).rejects.toThrow("Netlify deploy failed: Quota exceeded");
  });
});

describe("sites", () => {
  it("creates a site and reports a taken name readably", async () => {
    const { netlify } = fakeNetlify({
      "POST /sites": (body) =>
        (body as { name: string }).name === "taken"
          ? { status: 422, body: { message: "Validation failed: subdomain must be unique" } }
          : { body: { id: "new", name: "jane-portfolio", url: "http://jane-portfolio.netlify.app", ssl_url: "https://jane-portfolio.netlify.app" } },
    });
    expect(await createSite(netlify, "jane-portfolio")).toEqual({
      id: "new",
      name: "jane-portfolio",
      url: "https://jane-portfolio.netlify.app",
      adminUrl: null,
    });
    await expect(createSite(netlify, "taken")).rejects.toThrow("subdomain must be unique");
  });

  it("returns null for a site that was deleted", async () => {
    const { netlify } = fakeNetlify({});
    expect(await findSite(netlify, "gone")).toBeNull();
  });
});
