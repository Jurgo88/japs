<script setup lang="ts">
import { askForRecording, chooseRecording } from "../recording.ts";

/** Asks before any session recording (ADR 0016). Neither answer is the default. */
</script>

<template>
  <aside v-if="askForRecording" class="consent" role="dialog" aria-label="Session recording">
    <p>
      <strong>May we record your session to improve JAPS?</strong>
      Text, inputs and images are hidden, so we only see the page layout, mouse movement and clicks. Recordings are
      stored by PostHog in the EU. <a href="/privacy" target="_blank">Privacy</a>
    </p>
    <div class="actions">
      <button class="btn primary" type="button" @click="chooseRecording('granted')">Allow</button>
      <button class="btn" type="button" @click="chooseRecording('denied')">No thanks</button>
    </div>
  </aside>
</template>

<style scoped>
.consent {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  display: grid;
  gap: 12px;
  width: min(420px, calc(100vw - 32px));
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.16);
}
p { margin: 0; font-size: 14px; }
strong { display: block; margin-bottom: 4px; }
.actions { display: flex; gap: 8px; }
</style>
