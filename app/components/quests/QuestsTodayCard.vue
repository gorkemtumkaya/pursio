<script setup lang="ts">
import type { QuestId } from '#shared/types/progress'
import type { TodayView } from '~/utils/quests-view'

/**
 * Today's quests as one card: the header (ring, bonus hint, reset time) and the quest rows
 * it counts, so the counter and its quests read as one section (spec: quests-page,
 * Req 5.1–5.7, 4.9). When every quest comes from the same skill, the skill is named once
 * above the rows and not on each row. No logic: everything comes from `view`.
 */
defineProps<{ view: TodayView }>()
const emit = defineEmits<{ toggle: [quest: QuestId] }>()
</script>

<template>
  <section
    aria-labelledby="quests-today-title"
    class="flex min-w-0 flex-col gap-4 rounded-3xl border-2 border-line bg-surface px-5 py-5 shadow-raised-line lg:px-6"
  >
    <div class="flex items-center gap-4">
      <QuestsRing
        v-if="!view.caughtUp"
        :done="view.done"
        :total="view.total"
        :degrees="view.ringDegrees"
        :label="view.ringLabel"
      />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="quests-today-title" class="font-display text-2xl font-semibold text-ink">Today's quests</h2>
        <p v-if="view.hint === 'bonus'" class="text-[15px] font-bold text-ink">Finish all 3 for +20 bonus XP</p>
        <p v-else-if="view.hint === 'earned'" class="text-[15px] font-bold text-ink">Bonus earned: +20 XP</p>
        <p class="text-xs font-extrabold tracking-[0.06em] text-muted">{{ view.resets }}</p>
      </div>
    </div>

    <p v-if="view.caughtUp" class="rounded-2xl bg-surface-2 px-4 py-3.5 text-[15px] font-bold text-ink">
      You're all caught up on this path
    </p>
    <div v-else class="flex flex-col gap-2.5 border-t-2 border-line pt-4">
      <p v-if="view.sharedNodeTitle !== null" class="flex flex-wrap items-baseline gap-x-2 text-[15px] font-extrabold text-ink">
        <span class="text-xs tracking-[0.06em] text-muted">FROM</span>
        <span class="min-w-0">{{ view.sharedNodeTitle }}</span>
      </p>
      <ul class="flex flex-col gap-2.5">
        <li v-for="row in view.rows" :key="row.key">
          <PathQuestItem
            :text="row.text"
            :checked="row.ticked"
            :subtitle="view.sharedNodeTitle === null ? row.nodeTitle : undefined"
            badge="+10 XP"
            :aria-label="row.ariaLabel"
            @toggle="emit('toggle', row.quest)"
          />
        </li>
      </ul>
    </div>
  </section>
</template>
