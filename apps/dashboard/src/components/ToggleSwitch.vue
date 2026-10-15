<script setup lang="ts">
/** An on/off switch with a label and an optional hint; a real button with role="switch". */
const props = defineProps<{ modelValue: boolean; label: string; hint?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <div class="toggle" :class="{ disabled: props.disabled }">
    <button
      type="button"
      role="switch"
      :aria-checked="props.modelValue"
      :aria-label="props.label"
      :disabled="props.disabled"
      class="switch"
      :class="{ on: props.modelValue }"
      @click="emit('update:modelValue', !props.modelValue)"
    >
      <span class="knob" />
    </button>
    <span class="text" @click="!props.disabled && emit('update:modelValue', !props.modelValue)">
      <span class="label">{{ props.label }}</span>
      <span v-if="props.hint" class="hint muted">{{ props.hint }}</span>
    </span>
    <!-- Extra controls (e.g. a client label) sit below, outside the clickable label. -->
    <div v-if="$slots.default" class="extra"><slot /></div>
  </div>
</template>

<style scoped>
.toggle { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; align-items: start; }
.switch {
  position: relative;
  width: 36px;
  height: 20px;
  margin-top: 1px;
  border: 0;
  border-radius: 999px;
  background: var(--border);
  cursor: pointer;
  transition: background 0.15s;
}
.switch.on { background: var(--accent); }
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
  transition: transform 0.15s;
}
.switch.on .knob { transform: translateX(16px); }
.text { display: grid; gap: 2px; cursor: pointer; }
.extra { grid-column: 2; display: grid; gap: 10px; margin-top: 4px; }
.label { font-weight: 600; }
.hint { font-size: 13px; }
.disabled { opacity: 0.55; }
.disabled .switch, .disabled .text { cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .switch, .knob { transition: none; }
}
</style>
