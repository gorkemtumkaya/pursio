import type { ComputedRef } from 'vue'
import { appendCompletion, streakDays, weekDays, weekSummary } from '#shared/utils/streak'
import { createActivityStore } from '~/utils/activity-store'
import { DEMO_STREAK, DEMO_WEEK, DEMO_WEEK_SUMMARY, type CardDay } from '~/utils/demo-placeholders'
import { browserStorage } from '~/utils/progress-store'

export interface Activity {
  streak: ComputedRef<number>
  week: ComputedRef<readonly CardDay[]>
  weekSummary: ComputedRef<string>
  /** Appends a completion now; a no-op in Demo_Mode (Req 1.1, 1.5). */
  record(): void
}

/**
 * Streak and "This week" from the Completion_Log (Req 1, 2). Loads after mount,
 * like Progress, so SSR and hydration match. Demo_Mode shows the demo values
 * and never touches storage.
 */
export function useActivity(demo: boolean): Activity {
  const completions = shallowRef<readonly number[]>([])
  const store = createActivityStore(browserStorage)

  onMounted(() => {
    if (!demo) completions.value = store.load()
  })

  const streak = computed(() => (demo ? DEMO_STREAK : streakDays(completions.value, Date.now())))
  const week = computed<readonly CardDay[]>(() => (demo ? DEMO_WEEK : weekDays(completions.value, Date.now())))
  const summary = computed(() => (demo ? DEMO_WEEK_SUMMARY : weekSummary(weekDays(completions.value, Date.now()))))

  function record(): void {
    if (demo) return
    const next = appendCompletion(completions.value, Date.now())
    completions.value = next
    store.save(next)
  }

  return { streak, week, weekSummary: summary, record }
}
