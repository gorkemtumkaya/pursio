<script setup lang="ts">
import { SAMPLE_COPY } from '~/utils/sample-copy'

/**
 * Sticky bottom bar on mobile (spec: sample-path, Req 9.4, 9.5): "Make it yours", "Free. No signup."
 * and the button that opens the Make it yours sheet. Below 380 px only the button shows, full width;
 * the sheet it opens repeats "Free to try. No signup." It keeps the device's bottom safe area.
 * The sheets sit above it (z-40 and z-50).
 */
const emit = defineEmits<{ open: [opener: HTMLElement] }>()

function onClick(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) emit('open', event.currentTarget)
}
</script>

<template>
  <div class="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-surface pb-[env(safe-area-inset-bottom)]">
    <div class="mx-auto flex max-w-160 items-center justify-between gap-2 px-4 py-3">
      <!-- Below 380 px the text and the button do not fit side by side: the button takes the bar. -->
      <div class="hidden min-w-0 flex-col whitespace-nowrap min-[380px]:flex">
        <span class="font-head text-[17px] leading-tight font-semibold text-ink">{{ SAMPLE_COPY.mineHeading }}</span>
        <span class="text-[13px] font-bold text-muted">{{ SAMPLE_COPY.barLine }}</span>
      </div>
      <AppButton size="md" class="w-full shrink-0 cursor-pointer min-[380px]:w-auto" @click="onClick">{{ SAMPLE_COPY.barButton }}</AppButton>
    </div>
  </div>
</template>
