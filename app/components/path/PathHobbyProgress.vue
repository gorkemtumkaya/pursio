<script setup lang="ts">
/**
 * Hobby name, percent and progress bar inside a hobby list entry. `percent` is
 * 0 to 100. `reserveAction` keeps room at the end of the name row for the
 * card's "⋯" button, so the percent does not move when the button appears.
 */
withDefaults(defineProps<{ hobby: string; percent: number; reserveAction?: boolean }>(), { reserveAction: false })
</script>

<template>
  <span class="flex items-baseline gap-2" :class="reserveAction ? 'pr-8' : ''">
    <span class="min-w-0 flex-1 truncate text-[15px] font-extrabold">{{ hobby }}</span>
    <span class="shrink-0 text-xs font-extrabold text-muted">{{ percent }}%<span class="sr-only">{{ ' complete' }}</span></span>
  </span>
  <span aria-hidden="true" class="block h-2 w-full overflow-hidden rounded-full bg-locked">
    <span class="block h-full bg-done" :style="{ width: `${percent}%` }" />
  </span>
</template>
