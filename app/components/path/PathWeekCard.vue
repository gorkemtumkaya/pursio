<script setup lang="ts">
/** Static "This week" card under the Node_Detail on desktop (Req 12.6). */
type DayStatus = 'done' | 'planned' | 'rest'

interface Day {
  short: string
  name: string
  status: DayStatus
}

const DAYS: readonly Day[] = [
  { short: 'M', name: 'Monday', status: 'done' },
  { short: 'T', name: 'Tuesday', status: 'rest' },
  { short: 'W', name: 'Wednesday', status: 'done' },
  { short: 'T', name: 'Thursday', status: 'rest' },
  { short: 'F', name: 'Friday', status: 'done' },
  { short: 'S', name: 'Saturday', status: 'planned' },
  { short: 'S', name: 'Sunday', status: 'rest' },
]

const DOT_CLASS: Record<DayStatus, string> = {
  done: 'bg-done',
  planned: 'border-2 border-dashed border-primary bg-primary-soft',
  rest: 'bg-locked',
}

const STATUS_TEXT: Record<DayStatus, string> = {
  done: 'session done',
  planned: 'session planned',
  rest: 'no session',
}
</script>

<template>
  <section
    aria-labelledby="week-card-title"
    class="flex flex-col gap-3.5 rounded-3xl border-2 border-line bg-surface px-6 py-5"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 id="week-card-title" class="text-xl font-extrabold text-ink">This week</h2>
      <p class="text-sm font-bold text-muted">3 of 4 sessions</p>
    </div>
    <ul class="grid grid-cols-7 gap-2">
      <li
        v-for="day in DAYS"
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
