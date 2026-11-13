<script setup lang="ts">
import type { WeeklyView } from '~/utils/quests-view'

/**
 * Weekly challenge: four segments, progress text and days left
 * (spec: quests-page, Req 7.1, 7.3–7.6, 15.7). No logic: everything comes from `view`.
 */
defineProps<{ view: WeeklyView }>()
</script>

<template>
  <section
    aria-labelledby="quests-weekly-title"
    class="flex min-w-0 flex-col gap-3.5 rounded-3xl border-2 border-line bg-surface px-5 py-5 lg:px-6"
  >
    <h2 id="quests-weekly-title" class="text-xl font-extrabold text-ink">Practice on 4 days this week</h2>
    <div aria-hidden="true" class="grid grid-cols-4 gap-2">
      <span
        v-for="(filled, i) in view.segments"
        :key="i"
        class="h-3 rounded-full"
        :class="filled ? 'bg-done' : 'bg-locked'"
      />
    </div>
    <div class="flex items-center justify-between gap-3 text-sm font-bold">
      <p aria-hidden="true" class="text-ink">{{ view.text }}</p>
      <p class="shrink-0 text-muted">{{ view.daysLeft }}</p>
    </div>
    <p class="sr-only">{{ view.srText }}. {{ view.text }}</p>
  </section>
</template>
