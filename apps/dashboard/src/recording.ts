import type { PostHog } from "posthog-js";
import { ref } from "vue";

/**
 * Session recording on japs.app (ADR 0016), only after the visitor agrees. PostHog isn't even
 * downloaded before that. The key is set by the deploy, so `japs edit` never records anything.
 */

const KEY = import.meta.env.VITE_POSTHOG_KEY;
const CHOICE = "japs-recording-consent";
const API_HOST = "https://eu.i.posthog.com";

/**
 * What a recording may keep of an element: enough to draw the layout, nothing that can name a
 * project. Project titles and domains sit in aria-label, title, href, id, for and placeholder,
 * so this lists what stays rather than what goes.
 */
const LAYOUT_ATTRIBUTES = new Set(["class", "style", "rel", "type", "role", "disabled", "hidden", "rows", "aria-hidden", "aria-checked", "aria-pressed", "_cssText"]);

export function maskAttribute(name: string, value: string, element?: Element): string {
  const stylesheet = element?.tagName === "LINK" && name === "href";
  const layout = LAYOUT_ATTRIBUTES.has(name) || name.startsWith("data-v-");
  if (name === "style" && value.includes("url(")) return "*";
  return stylesheet || layout ? value : "*";
}

export type RecordingChoice = "granted" | "denied";

function storedChoice(): RecordingChoice | null {
  try {
    const value = localStorage.getItem(CHOICE);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

function storeChoice(choice: RecordingChoice): void {
  try {
    localStorage.setItem(CHOICE, choice);
  } catch {
    // Private mode: the choice lasts until the tab closes, and the question comes back.
  }
}

/** PostHog keeps its state under ph_* and __ph_*; withdrawing consent leaves nothing behind. */
function forgetPosthog(): void {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of Object.keys(storage)) {
        if (/^(__)?ph_/.test(key)) storage.removeItem(key);
      }
    }
  } catch {
    // Nothing to remove.
  }
}

export const recordingAvailable = Boolean(KEY);
export const askForRecording = ref(recordingAvailable && storedChoice() === null);

let posthog: PostHog | null = null;

async function start(): Promise<void> {
  if (posthog) {
    posthog.set_config({ disable_persistence: false });
    posthog.opt_in_capturing();
    posthog.startSessionRecording();
    return;
  }
  posthog = (await import("posthog-js")).default;
  posthog.init(KEY!, {
    api_host: API_HOST,
    // No cookies, no visitor profiles, and only page views besides the recording itself.
    persistence: "localStorage",
    person_profiles: "never",
    autocapture: false,
    rageclick: false,
    capture_pageleave: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    mask_personal_data_properties: true,
    // The editor shows private repositories and client names: a recording keeps only the
    // layout. Text masking leaves images and attributes alone, so they're handled as well.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskAttributeFn: maskAttribute,
      blockSelector: "img",
      recordHeaders: false,
      recordBody: false,
    },
  });
}

export function chooseRecording(choice: RecordingChoice): void {
  storeChoice(choice);
  askForRecording.value = false;
  if (choice === "granted") void start();
  else if (posthog) {
    // In this order: opting out first drops what the recorder still has in its buffer, and
    // without persistence PostHog can't write its state back after it's cleared.
    posthog.opt_out_capturing();
    posthog.stopSessionRecording();
    posthog.set_config({ disable_persistence: true });
    forgetPosthog();
  }
}

/** Shows the question again, so the choice can be changed as easily as it was made. */
export function reviewRecording(): void {
  askForRecording.value = true;
}

/** On page load: goes on recording only for a visitor who already agreed. */
export function resumeRecording(): void {
  if (recordingAvailable && storedChoice() === "granted") void start();
}
