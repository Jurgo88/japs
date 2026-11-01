import { createApp } from "vue";
import App from "./App.vue";
import { resumeRecording } from "./recording.ts";
import "./style.css";

createApp(App).mount("#app");
resumeRecording();

// Page views of japs.app itself (ADR 0015). Set only by the deploy, so `japs edit` never loads it.
const beacon = import.meta.env.VITE_CF_BEACON_TOKEN;
if (beacon) {
  const script = document.createElement("script");
  script.defer = true;
  script.src = "https://static.cloudflareinsights.com/beacon.min.js";
  script.dataset.cfBeacon = JSON.stringify({ token: beacon });
  document.head.append(script);
}
