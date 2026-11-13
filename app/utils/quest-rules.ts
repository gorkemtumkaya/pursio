// The state transition behind a tick (spec: quests-page). Pure, no Nuxt imports.
import type { WeeklyReward } from '#shared/types/cloud'
import type { Progress, QuestId } from '#shared/types/progress'
import { dailyBonusDue, needsNewPick, newDailyPick } from '#shared/utils/daily-pick'
import { isQuestTicked } from '#shared/utils/progress-engine'
import { activeDaysInWeek, localDayKey, weekKeyOf } from '#shared/utils/streak'
import { questTickTimes, stampCompletions, stampQuestTicks, type CloudPath } from './cloud-library'

/** Active days in a week needed for the weekly reward. */
export const WEEKLY_TARGET_DAYS = 4

export interface ProgressChange {
  paths: CloudPath[]
  weeklyReward: WeeklyReward | null
  /** What to queue for this path. */
  write: Pick<CloudPath, 'progress' | 'completedAt' | 'questTicks' | 'dailyPick' | 'dailyBonusCount'>
  grantedDailyBonus: boolean
  grantedWeeklyReward: boolean
}

/** Quests ticked in `after` that were not ticked in `before`. */
function newlyTicked(before: Progress, after: Progress): QuestId[] {
  const result: QuestId[] = []
  for (const id of Object.keys(after.quests)) {
    for (const index of [0, 1, 2] as const) {
      const quest: QuestId = { id, index }
      if (isQuestTicked(after, quest) && !isQuestTicked(before, quest)) result.push(quest)
    }
  }
  return result
}

/**
 * True when the learner was active on at least WEEKLY_TARGET_DAYS days this week,
 * the account's weekly values are loaded, and this week has not been rewarded yet.
 */
export function weeklyRewardDue(tickTimes: readonly number[], weekly: WeeklyReward | null, now: number): boolean {
  if (weekly === null) return false
  if (weekly.week === weekKeyOf(now)) return false
  return activeDaysInWeek(tickTimes, now) >= WEEKLY_TARGET_DAYS
}

/** `null` when `pathId` is unknown. */
export function applyProgressChange(
  paths: readonly CloudPath[],
  weekly: WeeklyReward | null,
  pathId: string,
  next: Progress,
  now: number,
): ProgressChange | null {
  const path = paths.find((p) => p.pathId === pathId)
  if (!path) return null

  const completedAt = stampCompletions(path.completedAt, next, now)
  const questTicks = stampQuestTicks(path.questTicks, path.progress, next, now)

  let dailyPick = path.dailyPick
  let dailyBonusCount = path.dailyBonusCount
  const grantedDailyBonus =
    dailyPick !== null && dailyBonusDue(dailyPick, localDayKey(now), newlyTicked(path.progress, next), next)
  if (grantedDailyBonus && dailyPick !== null) {
    dailyPick = { ...dailyPick, bonus: true }
    dailyBonusCount += 1
  }

  const write: ProgressChange['write'] = { progress: next, completedAt, questTicks, dailyPick, dailyBonusCount }
  const nextPaths = paths.map((p) => (p.pathId === pathId ? { ...p, ...write } : p))

  const grantedWeeklyReward = weeklyRewardDue(questTickTimes(nextPaths), weekly, now)
  const weeklyReward: WeeklyReward | null =
    grantedWeeklyReward && weekly !== null ? { week: weekKeyOf(now), count: weekly.count + 1 } : weekly

  return { paths: nextPaths, weeklyReward, write, grantedDailyBonus, grantedWeeklyReward }
}

/**
 * Stores a pick for the local day when the path has none for it and there is a
 * candidate. `null` when nothing changes. Never touches progress, ticks or the bonus count.
 */
export function withDailyPick(paths: readonly CloudPath[], pathId: string, now: number): CloudPath[] | null {
  const path = paths.find((p) => p.pathId === pathId)
  if (!path) return null
  const day = localDayKey(now)
  if (!needsNewPick(path.dailyPick, day)) return null
  const pick = newDailyPick(path.record.tree, path.progress, day)
  if (pick === null) return null
  return paths.map((p) => (p.pathId === pathId ? { ...p, dailyPick: pick } : p))
}
