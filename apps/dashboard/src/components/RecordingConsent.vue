<script setup lang="ts">
import { askForRecording, chooseRecording } from "../recording.ts";

/** The notice that this session is being recorded, and the way to stop it (ADR 0016). */
</script>

<template>
  <aside v-if="askForRecording" class="consent" role="dialog" aria-label="Session recording">
    <p>
      <strong>Help us make JAPS better.</strong>
      We look at how people use this site so we can improve it. Anything you type stays hidden.
      <a href="/privacy" target="_blank">Privacy</a>
    </p>
    <div class="actions">
      <button class="btn primary" type="button" @click="chooseRecording('denied')">No thanks</button>
      <button class="btn" type="button" @click="chooseRecording('accepted')">OK</button>
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
