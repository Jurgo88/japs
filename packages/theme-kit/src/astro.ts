import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Anonymized sample shipped with the kit, so every theme runs without an account. */
export const SAMPLE_DIR = fileURLToPath(new URL("../sample", import.meta.url));

/** The bits of Vite's dev server the reload plugin touches (the kit doesn't depend on Vite). */
interface DevServer {
  watcher: { add(path: string): void; on(event: "change", listener: (path: string) => void): void };
  environments: Record<string, { name: string; hot: { send(event: string, data: unknown): void } }>;
  ws: { send(payload: { type: "full-reload" }): void };
}

/**
 * Directory with portfolio.json and its screenshots (output of `japs build`).
 * JAPS_PORTFOLIO_DIR overrides; otherwise the repo's out/, or the sample when that's missing.
 */
export function resolvePortfolioDir(themeDir: string, env: NodeJS.ProcessEnv = process.env): string {
  // Relative to where the command was run: pnpm --filter switches cwd but keeps INIT_CWD.
  if (env.JAPS_PORTFOLIO_DIR) return resolve(env.INIT_CWD ?? process.cwd(), env.JAPS_PORTFOLIO_DIR);
  const out = resolve(themeDir, "../../out");
  if (existsSync(resolve(out, "portfolio.json"))) return out;
  console.warn("[japs] out/portfolio.json not found — using the sample portfolio. Run `pnpm japs build` for yours.");
  return SAMPLE_DIR;
}

/** In `astro dev`, reload the browser when `japs build` (or the editor) rewrites portfolio.json. */
function reloadOnPortfolioChange(dir: string) {
  const file = resolve(dir, "portfolio.json");
  return {
    name: "japs-portfolio-reload",
    configureServer(server: DevServer) {
      server.watcher.add(file);
      server.watcher.on("change", (changed) => {
        if (resolve(changed) !== file) return;
        // getStaticPaths() results are cached in dev; a new project would 404 until restart.
        // Astro clears that cache on its (internal) content-changed event, as for content collections.
        for (const environment of Object.values(server.environments)) {
          if (environment.name !== "client") environment.hot.send("astro:content-changed", {});
        }
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}

/**
 * The inline script of a portfolio published from the hosted version (ADR 0015): one small POST
 * per page view, without cookies. text/plain keeps the cross-origin beacon free of a preflight.
 */
export function analyticsScript(url: string, key: string): string {
  const json = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
  return `(function(){if(navigator.globalPrivacyControl||navigator.doNotTrack==="1")return;var r="";try{r=new URL(document.referrer).hostname}catch(e){}navigator.sendBeacon(${json(url)},new Blob([JSON.stringify({k:${json(key)},p:location.pathname,r:r})],{type:"text/plain"}))})();`;
}

/**
 * The session recording of the owner's own portfolio (ADR 0016). It starts on load, with a notice
 * on screen, and No thanks stops it for good. The portfolio is public, so its text stays visible
 * in a recording; inputs don't. Nothing goes on the device except the visitor's answer.
 */
export function recordingScript(key: string): string {
  const css =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;box-sizing:border-box;width:min(360px,calc(100vw - 32px));padding:14px;background:#fff;color:#111;border:1px solid #bbb;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.2);font:14px/1.45 system-ui,sans-serif";
  return `(function(){var K="japs-recording";function get(){try{return localStorage.getItem(K)}catch(e){return null}}function set(v){try{localStorage.setItem(K,v)}catch(e){}}if(navigator.globalPrivacyControl||navigator.doNotTrack==="1"||get()==="denied")return;var stopped=false;function clean(){try{Object.keys(localStorage).forEach(function(k){if(/^(__)?ph_/.test(k))localStorage.removeItem(k)})}catch(e){}}function stop(){stopped=true;set("denied");var p=window.posthog;if(p&&p.__loaded){p.opt_out_capturing();p.stopSessionRecording();p.set_config({disable_persistence:true})}clean()}var s=document.createElement("script");s.async=true;s.src="https://eu-assets.i.posthog.com/static/array.js";s.onload=function(){if(stopped)return;window.posthog.init(${JSON.stringify(key).replace(/</g, "\\u003c")},{api_host:"https://eu.i.posthog.com",persistence:"memory",person_profiles:"never",autocapture:false,rageclick:false,capture_pageleave:false,capture_dead_clicks:false,capture_heatmaps:false,capture_exceptions:false,capture_performance:false,disable_surveys:true,mask_personal_data_properties:true,session_recording:{maskAllInputs:true,recordHeaders:false,recordBody:false}})};document.head.appendChild(s);function notice(){if(get())return;var b=document.createElement("aside");b.setAttribute("role","dialog");b.setAttribute("aria-label","Session recording");b.style.cssText=${JSON.stringify(css)};var p=document.createElement("p");p.style.margin="0 0 10px";p.textContent="This visit is being recorded to see how the portfolio is used. Your IP address and anything you type are not kept. ";var a=document.createElement("a");a.href="https://japs.app/privacy";a.target="_blank";a.rel="noopener";a.style.color="inherit";a.textContent="Privacy";p.appendChild(a);b.appendChild(p);[["No thanks",stop],["OK",function(){set("accepted")}]].forEach(function(c){var d=document.createElement("button");d.type="button";d.textContent=c[0];d.style.cssText="margin-right:8px;padding:6px 12px;font:inherit;color:#111;background:#f2f2f2;border:1px solid #999;border-radius:6px;cursor:pointer";d.onclick=function(){c[1]();b.remove()};b.appendChild(d)});document.body.appendChild(b)}if(document.body)notice();else document.addEventListener("DOMContentLoaded",notice)})();`;
}

/** Adds the scripts of a hosted build when it asks for them. Local builds never do. */
function hostedScripts(env: NodeJS.ProcessEnv) {
  const { JAPS_ANALYTICS_URL: url, JAPS_ANALYTICS_KEY: key, JAPS_RECORDING_KEY: recording } = env;
  const scripts = [...(url && key ? [analyticsScript(url, key)] : []), ...(recording ? [recordingScript(recording)] : [])];
  if (!scripts.length) return [];
  return [
    {
      name: "japs-hosted-scripts",
      hooks: {
        "astro:config:setup": ({ injectScript }: { injectScript(stage: "head-inline", content: string): void }) => {
          for (const script of scripts) injectScript("head-inline", script);
        },
      },
    },
  ];
}

/**
 * Astro config for a JAPS theme. Spread it into defineConfig():
 *   export default defineConfig({ ...japsAstroConfig(import.meta.url) });
 * Screenshots are served straight from the portfolio directory: no copying, no hotlinks.
 */
export function japsAstroConfig(configUrl: string) {
  const dir = resolvePortfolioDir(dirname(fileURLToPath(configUrl)));
  process.env.JAPS_PORTFOLIO_DIR = dir;
  return {
    publicDir: dir,
    site: process.env.JAPS_SITE_URL,
    integrations: hostedScripts(process.env),
    vite: { plugins: [reloadOnPortfolioChange(dir)] },
  };
}
