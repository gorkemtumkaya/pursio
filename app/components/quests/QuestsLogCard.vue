<script setup lang="ts">
import type { LogBox } from '~/utils/quests-view'

/**
 * Quest log of the current week: seven boxes Monday to Sunday
 * (spec: quests-page, Req 9.1, 9.7, 9.8, 15.7). No logic: everything comes from `boxes`.
 */
defineProps<{ boxes: readonly LogBox[] }>()

const BOX_CLASS: Record<LogBox['style'], string> = {
  done: 'bg-done text-done-ink',
  missed: 'bg-locked text-locked-ink',
  today: 'border-2 border-primary bg-primary-soft text-ink',
  upcoming: 'border-2 border-line bg-surface text-muted',
}
</script>

<template>
  <section
    aria-labelledby="quests-log-title"
    class="flex min-w-0 flex-col gap-3.5 rounded-3xl border-2 border-line bg-surface px-5 py-5 lg:px-6"
  >
    <h2 id="quests-log-title" class="text-xl font-extrabold text-ink">Quest log</h2>
    <ul class="grid grid-cols-7 gap-2">
      <li
        v-for="box in boxes"
        :key="box.date"
        class="flex flex-col items-center gap-1.5 text-xs font-extrabold text-muted"
      >
        <span
          aria-hidden="true"
          class="flex size-9 items-center justify-center rounded-node text-sm font-extrabold"
          :class="BOX_CLASS[box.style]"
        >
          {{ box.display }}
        </span>
        <span aria-hidden="true">{{ box.short }}</span>
        <span class="sr-only">{{ box.label }}</span>
      </li>
    </ul>
    <p class="text-xs font-semibold text-muted">Number = quests finished that day</p>
  </section>
</template>
