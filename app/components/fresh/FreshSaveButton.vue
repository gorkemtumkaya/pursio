<script setup lang="ts">
import { computed } from 'vue'

/**
 * Save toggle of a Fresh card or the Hero_Card (spec: fresh, Req 12.6, 13.2, 13.11).
 * The state shows visibly ("Save" or "Saved") and in `aria-pressed`. Never rendered in
 * Demo_Mode (decision D13).
 */
const props = withDefaults(
  defineProps<{
    saved: boolean
    /** Video title, for the accessible name. */
    title: string
    /** `large` sits next to the Hero_Card's Watch button. */
    size?: 'small' | 'large'
  }>(),
  { size: 'small' },
)

const emit = defineEmits<{ toggle: [] }>()

const label = computed(() => (props.saved ? 'Saved' : 'Save'))
const sizeClass = computed(() =>
  props.size === 'large' ? 'min-h-12 px-5 text-[15px]' : 'min-h-11 px-3 text-sm',
)
</script>

<template>
  <button
    type="button"
    :aria-pressed="saved"
    :aria-label="`Save ${title}`"
    class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 font-head font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    :class="[sizeClass, saved ? 'border-primary bg-primary-soft text-accent-text' : 'border-line bg-surface text-ink hover:bg-surface-2']"
    @click="emit('toggle')"
  >
    <PathIcon name="bookmark" class="size-4.5" />
    <span>{{ label }}</span>
  </button>
</template>
