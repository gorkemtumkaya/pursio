<script setup lang="ts">
import { ref } from 'vue'

/**
 * Fresh_Page header (spec: fresh-v2, Req 1.2 to 1.5): the eyebrow "Updated <relative time>"
 * (hidden when no check time is known) above the title "Fresh". From `lg` up the new-today
 * text shows right-aligned, and is left out when nothing is new. Below `lg` the "Sources"
 * button opens the Sources sheet; the page moves focus back to it when the sheet closes.
 */
defineProps<{
  /** "2h ago" style text, or null to hide the eyebrow. */
  updated: string | null
  /** "4 new videos today across 2 hobbies", or null to hide it (Req 1.5). */
  newToday: string | null
  /** False while there is nothing to list (no paths, loading, error). */
  showSources: boolean
  sourcesOpen: boolean
}>()

const emit = defineEmits<{ openSources: [] }>()

const sourcesButton = ref<HTMLButtonElement | null>(null)

defineExpose({
  focusSources(): void {
    sourcesButton.value?.focus()
  },
})
</script>

<template>
  <header class="flex items-end justify-between gap-3">
    <div class="flex min-w-0 flex-col gap-0.5">
      <p v-if="updated" class="font-head text-[13px] font-extrabold tracking-wider text-muted uppercase">
        Updated {{ updated }}
      </p>
      <h1 class="font-display text-4xl leading-none text-ink lg:text-5xl">Fresh</h1>
    </div>
    <p v-if="newToday" class="hidden text-right text-sm font-bold text-muted lg:block">{{ newToday }}</p>
    <button
      v-if="showSources"
      ref="sourcesButton"
      type="button"
      class="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border-2 border-line bg-surface px-3 font-head text-sm font-extrabold text-ink shadow-raised-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
      aria-haspopup="dialog"
      :aria-expanded="sourcesOpen"
      @click="emit('openSources')"
    >
      <PathIcon name="feed" class="size-5" />
      <span>Sources</span>
    </button>
  </header>
</template>
