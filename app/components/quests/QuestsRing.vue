<script setup lang="ts">
import { computed } from 'vue'

/**
 * Round ring with "1/3" in the middle, for the Today card (Req 5.1, 15.7).
 * `degrees` is the filled part (360 * done / total); `label` is the screen reader text.
 * The inner disc is dark (`ink` with `bg` text) and the open part of the ring uses `line`,
 * so it reads on the light card surface.
 */
const props = defineProps<{ done: number; total: number; degrees: number; label: string }>()

const style = computed(() => ({ '--ring-deg': `${props.degrees}deg` }))
</script>

<template>
  <span
    role="img"
    :aria-label="label"
    class="quests-ring flex size-16 shrink-0 items-center justify-center rounded-full lg:size-18"
    :style="style"
  >
    <span aria-hidden="true" class="flex size-12 items-center justify-center rounded-full bg-ink font-head text-lg font-semibold text-bg lg:size-14">
      {{ done }}/{{ total }}
    </span>
  </span>
</template>

<style scoped>
.quests-ring {
  background: conic-gradient(var(--pursio-primary) 0 var(--ring-deg), var(--pursio-line) 0);
}
</style>
