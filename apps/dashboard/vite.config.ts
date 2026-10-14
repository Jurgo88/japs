import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// `pnpm --filter @japs/dashboard dev` talks to a running `japs edit` (default port 4310).
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: { "/api": { target: `http://localhost:${process.env.JAPS_EDIT_PORT ?? 4310}`, headers: { host: "localhost" } } },
  },
});
