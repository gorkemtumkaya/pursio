<script setup lang="ts">
import { computed } from 'vue'

/** Loading skeleton or error message shown in place of the path (Req 5.11). */
const props = defineProps<{ state: 'loading' | 'error'; message?: string }>()

const text = computed(() => {
  if (props.message) return props.message
  return props.state === 'loading' ? 'Loading your path…' : 'This path could not be drawn.'
})

/** Horizontal offsets for the skeleton nodes, echoing the winding path. */
const SKELETON_OFFSETS = ['translate-x-0', '-translate-x-15', '-translate-x-22', '-translate-x-15', 'translate-x-0']
</script>

<template>
  <div v-if="state === 'loading'" role="status" class="flex flex-col items-center gap-10 px-4 py-14">
    <span class="sr-only">{{ text }}</span>
    <span
      v-for="(offset, index) in SKELETON_OFFSETS"
      :key="index"
      aria-hidden="true"
      class="size-18 rounded-node bg-locked motion-safe:animate-pulse"
      :class="offset"
    />
  </div>
  <div v-else class="px-4 py-14">
    <p
      role="alert"
      class="mx-auto max-w-md rounded-2xl border-2 border-line bg-surface px-5 py-4 text-center text-[15px] font-bold text-ink"
    >
      {{ text }}
    </p>
  </div>
</template>
