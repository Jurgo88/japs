import { serveSite, type SitesEnv } from "./serve.ts";

/**
 * The portfolio Worker (ADR 0013, wrangler.sites.jsonc): serves <handle>.japs.app and nothing
 * else. Deployed apart from the API on purpose, with only the database and the sites bucket.
 */
export default {
  fetch(request: Request, env: SitesEnv): Promise<Response> {
    return serveSite(request, env);
  },
};
