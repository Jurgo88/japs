import type { PostHog } from "posthog-js";
import { ref } from "vue";

/**
 * Session recording on japs.app (ADR 0016). It runs until the visitor presses No thanks, with a
 * notice on screen. The key is set by the deploy, so `japs edit` never records anything.
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

export type RecordingChoice = "accepted" | "denied";

function storedChoice(): RecordingChoice | null {
  try {
    const value = localStorage.getItem(CHOICE);
    return value === "accepted" || value === "denied" ? value : null;
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
    if (!posthog.has_opted_out_capturing()) return;
    posthog.set_config({ disable_persistence: false });
    posthog.opt_in_capturing();
    posthog.startSessionRecording();
    return;
  }
  posthog = (await import("posthog-js")).default;
  posthog.init(KEY!, {
    api_host: API_HOST,
    // Nothing on the device, no visitor profiles, and only page views besides the recording.
    persistence: "memory",
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
  if (choice === "accepted") void start();
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

/** On page load: records everyone except a visitor who said no or whose browser asks not to be tracked. */
export function resumeRecording(): void {
  const dnt = navigator.doNotTrack === "1" || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  if (recordingAvailable && !dnt && storedChoice() !== "denied") void start();
}
