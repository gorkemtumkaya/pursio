<script setup lang="ts">
import type { ChipView } from '#shared/utils/fresh-view'

/**
 * Filter_Chips (spec: fresh-v2, Req 2.1, 2.3 to 2.5, 2.8): one row that scrolls sideways and
 * never wraps. Each chip is a toggle button (`aria-pressed`), reached with Tab and activated
 * with Enter or Space; exactly one is pressed. A Hobby_Chip shows a dot in its hobby color
 * and, when the hobby has new videos, a badge with their number, which its accessible name
 * repeats as "<hobby>, <n> new". Selecting never sends a request.
 */
defineProps<{ chips: readonly ChipView[] }>()
const emit = defineEmits<{ select: [chip: ChipView] }>()
</script>

<template>
  <div role="group" aria-label="Filter videos" class="scrollbar-themed -mx-4 flex gap-2 overflow-x-auto px-4 pt-1 pb-2 lg:mx-0 lg:px-1">
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      :aria-pressed="chip.selected"
      :aria-label="chip.newCount > 0 ? `${chip.label}, ${chip.newCount} new` : undefined"
      :data-hobby-slot="chip.colorSlot ?? undefined"
      class="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border-2 px-4 font-head text-sm font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      :class="chip.selected ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-surface-2'"
      @click="emit('select', chip)"
    >
      <span
        v-if="chip.colorSlot !== null"
        class="size-2.5 shrink-0 rounded-full border-2 bg-hobby-deep"
        :class="chip.selected ? 'border-surface' : 'border-hobby-deep'"
        aria-hidden="true"
      />
      <span>{{ chip.label }}</span>
      <span
        v-if="chip.newCount > 0"
        class="rounded-full bg-primary px-1.5 py-0.5 text-xs leading-none text-primary-ink"
        aria-hidden="true"
      >
        {{ chip.newCount }}
      </span>
    </button>
  </div>
</template>
