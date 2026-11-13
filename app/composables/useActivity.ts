import type { ComputedRef } from 'vue'
import { streakDays, weekDays, weekSummary } from '#shared/utils/streak'
import { DEMO_STREAK, DEMO_WEEK, DEMO_WEEK_SUMMARY, type CardDay } from '~/utils/demo-placeholders'

export interface Activity {
  streak: ComputedRef<number>
  week: ComputedRef<readonly CardDay[]>
  weekSummary: ComputedRef<string>
}

/**
 * Streak and "This week" from the Completion_Timestamps of all the learner's
 * paths, archived ones included (spec: accounts-cloud-save, Req 6.8). They are
 * recomputed whenever a timestamp changes, so a completion, a delete and an
 * Undo show in the same render (Req 6.9). Demo_Mode shows the demo values and
 * reads nothing.
 */
export function useActivity(demo: boolean, completionTimes: () => readonly number[]): Activity {
  const streak = computed(() => (demo ? DEMO_STREAK : streakDays(completionTimes(), Date.now())))
  const week = computed<readonly CardDay[]>(() => (demo ? DEMO_WEEK : weekDays(completionTimes(), Date.now())))
  const summary = computed(() => (demo ? DEMO_WEEK_SUMMARY : weekSummary(weekDays(completionTimes(), Date.now()))))

  return { streak, week, weekSummary: summary }
}
