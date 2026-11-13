<script setup lang="ts">
import type { QuestId } from '#shared/types/progress'
import { localDayKey } from '#shared/utils/streak'
import { questTickTimes, type CloudPath } from '~/utils/cloud-library'
import { hobbyPath } from '~/utils/hobby-store'
import { logView, pathCards, todayView, weeklyView } from '~/utils/quests-view'

/**
 * Orchestration of the Quests page for one path (spec: quests-page).
 * Ticks run through the same `useSkillPath` + Cloud_Store save as the path page.
 * Ticked state is read from the Cloud_Store's copy of Progress. No Mark_Complete here.
 */
const props = defineProps<{ path: CloudPath }>()

const cloud = useCloudStore()
const toast = useToast()
const now = useNow()
const day = computed(() => localDayKey(now.value))

const tree = props.path.record.tree
const { toggleQuest } = useSkillPath(tree, cloud.progressStore(props.path.pathId))

// Creates the pick on arrival, at midnight rollover and when an empty pick can be filled (Req 4.1, 4.8).
watch(
  [day, () => props.path.progress.completed],
  () => cloud.ensureDailyPick(props.path.pathId, now.value),
  { immediate: true, flush: 'post' },
)

const todayPick = computed(() => (props.path.dailyPick?.day === day.value ? props.path.dailyPick : null))
const today = computed(() => todayView(tree, props.path.progress, todayPick.value, now.value))
const tickTimes = computed(() => questTickTimes(cloud.paths.value))
const weekly = computed(() => weeklyView(tickTimes.value, cloud.weeklyReward.value, now.value))
const log = computed(() => logView(tickTimes.value, now.value))
const cards = computed(() => pathCards(tree, props.path.progress))
const pathLink = computed(() => hobbyPath(props.path.record.id))
const hobbyName = computed(() => props.path.record.tree.hobby)

function onToggle(quest: QuestId): void {
  toggleQuest(quest.id, quest.index)
}

/** Grant toasts never replace a sticky one (e.g. a failed save with Retry). */
function showGrant(message: string): void {
  if (toast.toast.value?.sticky === true) return
  toast.show(message)
}

// Toasts fire on state transitions only, so loading the page never toasts (Req 6.6, 8.6).
watch(
  () => todayPick.value?.bonus,
  (isBonus, wasBonus) => {
    if (isBonus === true && wasBonus === false) showGrant('+20 bonus XP')
  },
)
watch(
  () => cloud.weeklyReward.value?.count,
  (count, previous) => {
    if (count !== undefined && previous !== undefined && count > previous) showGrant('+50 XP weekly reward')
  },
)
</script>

<template>
  <div class="grid min-w-0 gap-3.5 lg:grid-cols-[minmax(0,1fr)_clamp(320px,28vw,400px)] lg:gap-x-6 lg:gap-y-5">
    <QuestsHeader
      class="lg:col-start-1 lg:row-start-1"
      :hobby-name="hobbyName"
      :subtitle="`Small quests from ${hobbyName}`"
    />
    <QuestsTodayCard class="lg:col-start-1 lg:row-start-2" :view="today" @toggle="onToggle" />
    <div class="contents lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:flex lg:flex-col lg:gap-5">
      <QuestsWeeklyCard :view="weekly" />
      <QuestsLogCard :boxes="log" />
    </div>
    <QuestsPathSection class="lg:col-start-1 lg:row-start-3" :cards="cards" :to="pathLink" />
  </div>
</template>
