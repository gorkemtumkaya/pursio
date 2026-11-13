<script setup lang="ts">
import type { QuestId } from '#shared/types/progress'
import type { TodayView } from '~/utils/quests-view'

/**
 * Today's three quests: dark banner (ring, bonus hint, reset time) and the quest rows
 * (spec: quests-page, Req 5.1–5.7, 4.9). No logic: everything comes from `view`.
 */
defineProps<{ view: TodayView }>()
const emit = defineEmits<{ toggle: [quest: QuestId] }>()
</script>

<template>
  <section aria-labelledby="quests-today-title" class="flex min-w-0 flex-col gap-3.5">
    <div
      class="flex items-center gap-4 rounded-3xl bg-banner px-5 py-4 text-banner-ink shadow-raised-banner lg:px-6 lg:py-5"
    >
      <QuestsRing
        v-if="!view.caughtUp"
        :done="view.done"
        :total="view.total"
        :degrees="view.ringDegrees"
        :label="view.ringLabel"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="quests-today-title" class="font-display text-2xl font-semibold">Today's quests</h2>
        <p v-if="view.hint === 'bonus'" class="text-[15px] font-bold">Finish all 3 for +20 bonus XP</p>
        <p v-else-if="view.hint === 'earned'" class="text-[15px] font-bold">Bonus earned: +20 XP</p>
        <p class="text-xs font-extrabold tracking-[0.06em] text-banner-muted">{{ view.resets }}</p>
      </div>
    </div>

    <p
      v-if="view.caughtUp"
      class="rounded-3xl border-2 border-line bg-surface px-5 py-4 text-[15px] font-bold text-ink"
    >
      You're all caught up on this path
    </p>
    <ul v-else class="flex flex-col gap-2.5">
      <li v-for="row in view.rows" :key="row.key">
        <PathQuestItem
          :text="row.text"
          :checked="row.ticked"
          :subtitle="row.nodeTitle"
          badge="+10 XP"
          :aria-label="row.ariaLabel"
          @toggle="emit('toggle', row.quest)"
        />
      </li>
    </ul>
  </section>
</template>
