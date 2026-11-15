<script setup lang="ts">
import { ref } from 'vue'

/**
 * Fresh_Page header (spec: fresh, Req 11.2 to 11.6): the filter label and, when known,
 * "Updated <relative time>" above the title "Fresh". Below `lg` it shows the "Sources" button
 * that opens the Sources sheet; the page moves focus back to it when the sheet closes.
 */
defineProps<{
  filterLabel: string
  /** "2h ago" style text, or null to hide "Updated" (Req 11.6). */
  updated: string | null
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
  <header class="flex items-start justify-between gap-3">
    <div class="flex min-w-0 flex-col gap-0.5">
      <p
        v-if="filterLabel || updated"
        class="font-head text-[13px] font-extrabold tracking-wider text-muted uppercase"
      >
        <span>{{ filterLabel }}</span>
        <template v-if="updated">
          <span v-if="filterLabel" aria-hidden="true"> · </span>
          <span>Updated {{ updated }}</span>
        </template>
      </p>
      <h1 class="font-display text-4xl leading-none text-ink lg:text-5xl">Fresh</h1>
    </div>
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
