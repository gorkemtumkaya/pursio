<script setup lang="ts">
import { computed } from 'vue'

/** XP progress bar: `bg-locked` track with a `bg-done` fill (Req 11.3, 11.4). */
const props = withDefaults(defineProps<{ percent: number; label?: string }>(), {
  label: 'Level progress',
})

const value = computed(() => {
  const n = Number.isFinite(props.percent) ? Math.round(props.percent) : 0
  return Math.min(100, Math.max(0, n))
})
</script>

<template>
  <div
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="value"
    aria-valuemin="0"
    aria-valuemax="100"
    class="h-3 overflow-hidden rounded-full bg-locked"
  >
    <div class="h-full rounded-full bg-done" :style="{ width: `${value}%` }" />
  </div>
</template>
