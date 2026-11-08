<script setup lang="ts">
import type { CardDay, CardDayStatus } from '~/utils/demo-placeholders'

/**
 * "This week" card under the Node_Detail on desktop (Req 12.6). Days come from
 * the Completion_Log, or the demo week in Demo_Mode (spec: local-progress-data, Req 2).
 */
defineProps<{ days: readonly CardDay[]; summary: string }>()

const DOT_CLASS: Record<CardDayStatus, string> = {
  done: 'bg-done',
  missed: 'bg-locked',
  upcoming: 'border-2 border-line bg-surface',
  planned: 'border-2 border-dashed border-primary bg-primary-soft',
}

const STATUS_TEXT: Record<CardDayStatus, string> = {
  done: 'skill completed',
  missed: 'no skill completed',
  upcoming: 'still ahead',
  planned: 'session planned',
}
</script>

<template>
  <section
    aria-labelledby="week-card-title"
    class="flex flex-col gap-3.5 rounded-3xl border-2 border-line bg-surface px-6 py-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="week-card-title" class="text-xl font-extrabold text-ink">This week</h2>
      <p class="text-sm font-bold text-muted">{{ summary }}</p>
    </div>
    <ul class="grid grid-cols-7 gap-2">
      <li
        v-for="day in days"
        :key="day.name"
        class="flex flex-col items-center gap-1.5 text-xs font-extrabold text-muted"
      >
        <span aria-hidden="true" class="size-8 rounded-node" :class="DOT_CLASS[day.status]" />
        <span aria-hidden="true">{{ day.short }}</span>
        <span class="sr-only">{{ day.name }}, {{ STATUS_TEXT[day.status] }}</span>
      </li>
    </ul>
  </section>
</template>
