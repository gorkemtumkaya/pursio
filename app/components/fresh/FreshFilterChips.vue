<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { ChipView } from '#shared/utils/fresh-view'

/**
 * Filter_Chips with radio-group semantics (spec: fresh, Req 14.1, 14.8, 13.10): exactly one
 * chip is checked; Tab reaches the checked chip, arrow keys move and select, and Enter or Space
 * select the focused chip. Selecting never sends a request.
 */
const props = defineProps<{ chips: readonly ChipView[] }>()
const emit = defineEmits<{ select: [chip: ChipView] }>()

const buttons = ref<HTMLButtonElement[]>([])

function move(index: number, delta: number): void {
  const count = props.chips.length
  if (count === 0) return
  const next = (index + delta + count) % count
  const chip = props.chips[next]
  if (!chip) return
  emit('select', chip)
  void nextTick(() => buttons.value[next]?.focus())
}

function onKeydown(event: KeyboardEvent, index: number): void {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault()
    move(index, 1)
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(index, -1)
  } else if (event.key === 'Home') {
    event.preventDefault()
    move(0, 0)
  } else if (event.key === 'End') {
    event.preventDefault()
    move(props.chips.length - 1, 0)
  }
}
</script>

<template>
  <div role="radiogroup" aria-label="Filter videos" class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
    <button
      v-for="(chip, index) in chips"
      :key="chip.key"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="chip.selected"
      :tabindex="chip.selected ? 0 : -1"
      class="min-h-11 shrink-0 rounded-full border-2 px-4 font-head text-sm font-extrabold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      :class="chip.selected ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink hover:bg-surface-2'"
      @click="emit('select', chip)"
      @keydown="onKeydown($event, index)"
    >
      {{ chip.label }}
    </button>
  </div>
</template>
