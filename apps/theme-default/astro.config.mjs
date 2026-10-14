// @ts-check
import { japsAstroConfig } from "@japs/theme-kit/astro";
import { defineConfig } from "astro/config";

export default defineConfig({ ...japsAstroConfig(import.meta.url) });
