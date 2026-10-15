<script setup lang="ts">
import { ref } from "vue";

/** Tags as chips: Enter or comma adds, × or Backspace in an empty field removes. */
const props = defineProps<{ modelValue: string[]; placeholder?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();
const draftTag = ref("");

function add(): void {
  const parts = draftTag.value.split(",").map((t) => t.trim()).filter(Boolean);
  draftTag.value = "";
  const next = [...props.modelValue];
  for (const part of parts) if (!next.some((t) => t.toLowerCase() === part.toLowerCase())) next.push(part);
  if (next.length !== props.modelValue.length) emit("update:modelValue", next);
}
function remove(index: number): void {
  emit("update:modelValue", props.modelValue.filter((_, i) => i !== index));
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    add();
  } else if (e.key === "Backspace" && !draftTag.value && props.modelValue.length) {
    remove(props.modelValue.length - 1);
  }
}
</script>

<template>
  <div class="tags" @click="($event.currentTarget as HTMLElement).querySelector('input')?.focus()">
    <span v-for="(tag, i) in props.modelValue" :key="tag" class="chip">
      {{ tag }}
      <button type="button" :aria-label="`Remove ${tag}`" @click.stop="remove(i)">×</button>
    </span>
    <input v-model="draftTag" type="text" :placeholder="props.modelValue.length ? '' : props.placeholder" @keydown="onKey" @blur="add" />
  </div>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  cursor: text;
}
.tags:focus-within { border-color: var(--accent); }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
}
.chip button { border: 0; background: none; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; padding: 0 4px; border-radius: 50%; }
.chip button:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
input { flex: 1; min-width: 120px; border: 0 !important; padding: 3px 4px !important; background: none !important; outline: none; }
</style>
