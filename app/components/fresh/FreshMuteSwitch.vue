<script setup lang="ts">
import { computed } from 'vue'

/**
 * Mute switch of one Channel_Source (spec: fresh, Req 2.1, 2.2, 2.9, 15.2, 15.10). On means
 * the channel's videos are shown; off means muted. A native button, so Enter and Space
 * toggle it; the accessible name holds the full channel name and the state.
 */
const props = defineProps<{ channelName: string; muted: boolean }>()
const emit = defineEmits<{ change: [muted: boolean] }>()

const on = computed(() => !props.muted)
const name = computed(() => `Videos from ${props.channelName}: ${on.value ? 'on' : 'off'}`)
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="on"
    :aria-label="name"
    class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    @click="emit('change', on)"
  >
    <span
      aria-hidden="true"
      class="flex h-7 w-12 items-center rounded-full border-2 p-0.5 transition-colors motion-reduce:transition-none"
      :class="on ? 'border-done-deep bg-done' : 'border-line bg-surface-2'"
    >
      <span
        class="size-5 rounded-full transition-transform motion-reduce:transition-none"
        :class="on ? 'translate-x-5 bg-done-ink' : 'translate-x-0 bg-muted'"
      />
    </span>
  </button>
</template>
