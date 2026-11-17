<script setup lang="ts">
import { computed } from 'vue'

/**
 * Save toggle of a Fresh card or the Hero_Card (spec: fresh-v2, Req 7.3; `fresh` Req 12.6).
 * `small` and `large` show the state as text ("Save" or "Saved"); `icon` is the small control
 * of a carousel card, whose name tells the state ("Save <title>" or "Remove <title> from
 * saved"). Every size sets `aria-pressed`. Never rendered in Demo_Mode (decision D13).
 */
const props = withDefaults(
  defineProps<{
    saved: boolean
    /** Video title, for the accessible name. */
    title: string
    /** `large` sits next to the Hero_Card's Watch button; `icon` has no text. */
    size?: 'small' | 'large' | 'icon'
  }>(),
  { size: 'small' },
)

const emit = defineEmits<{ toggle: [] }>()

const label = computed(() => (props.saved ? 'Saved' : 'Save'))
const name = computed(() => {
  if (props.size !== 'icon') return `Save ${props.title}`
  return props.saved ? `Remove ${props.title} from saved` : `Save ${props.title}`
})
const sizeClass = computed(() => {
  if (props.size === 'large') return 'min-h-12 px-5 text-[15px]'
  if (props.size === 'icon') return 'size-11'
  return 'min-h-11 px-3 text-sm'
})
</script>

<template>
  <button
    type="button"
    :aria-pressed="saved"
    :aria-label="name"
    class="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border-2 font-head font-extrabold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    :class="[sizeClass, saved ? 'border-primary bg-primary-soft text-accent-text' : 'border-line bg-surface text-ink hover:bg-surface-2']"
    @click="emit('toggle')"
  >
    <PathIcon name="bookmark" class="size-4.5" />
    <span v-if="size !== 'icon'">{{ label }}</span>
  </button>
</template>
