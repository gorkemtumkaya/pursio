// Pure reset and restore logic for progress (spec: reset-progress).
import type { ResetMode, ResetScope, ResetSnapshot, WeeklyReward } from '#shared/types/cloud'
import { emptyProgress } from '#shared/utils/progress-engine'
import type { CloudPath } from './cloud-library'
import { parseProgressRow } from './cloud-rows'

/** How long the Undo toast stays visible (Req 8.2). */
export const UNDO_WINDOW_MS = 8000

export interface ResetPlan {
  /** Completed_at and quest ticks are cleared too (Wipe everything). */
  clearsHistory: boolean
  /** The account-wide Weekly_Reward is cleared (all + wipe only, Req 4.1 to 4.3). */
  resetsReward: boolean
}

export function resetPlan(scope: ResetScope, mode: ResetMode): ResetPlan {
  const wipe = mode === 'wipe'
  return { clearsHistory: wipe, resetsReward: wipe && scope === 'all' }
}

/**
 * The paths after a reset. Every path of `scope` (all of them, archived ones
 * included, for 'all'; the one with `pathId` for 'path') gets empty Progress,
 * no Daily_Pick and a zero Daily_Bonus_Count; with 'wipe' also no
 * Completion_Timestamps and no Tick_Times. Other paths are returned as they are
 * (same object). Only progress fields change.
 */
export function withProgressReset(
  paths: readonly CloudPath[],
  scope: ResetScope,
  pathId: string | null,
  mode: ResetMode,
): CloudPath[] {
  const plan = resetPlan(scope, mode)
  return paths.map((path) => {
    if (scope === 'path' && path.pathId !== pathId) return path
    return {
      ...path,
      progress: emptyProgress(),
      dailyPick: null,
      dailyBonusCount: 0,
      completedAt: plan.clearsHistory ? {} : path.completedAt,
      questTicks: plan.clearsHistory ? {} : path.questTicks,
    }
  })
}

/** The Weekly_Reward after the reset: `{ week: null, count: 0 }` when the plan resets it, else unchanged. */
export function rewardAfterReset(reward: WeeklyReward | null, plan: ResetPlan): WeeklyReward | null {
  return plan.resetsReward ? { week: null, count: 0 } : reward
}

/**
 * Puts snapshot rows back. A row is read with `parseProgressRow` against the
 * tree of its path, so it follows the same rules as a page load. Rows of paths
 * that are no longer held are skipped.
 */
export function withRestoredProgress(paths: readonly CloudPath[], snapshot: ResetSnapshot): CloudPath[] {
  const rows = new Map(snapshot.rows.map((row) => [row.path_id, row]))
  return paths.map((path) => {
    const row = rows.get(path.pathId)
    return row ? { ...path, ...parseProgressRow(row, path.record.tree) } : path
  })
}

/** One sentence under a mode in the dialog (Req 3.3). */
export function resetModeDescription(scope: ResetScope, mode: ResetMode): string {
  if (scope === 'path') {
    return mode === 'wipe'
      ? 'Clears completed skills, quests and activity history of this path. Your streak can drop.'
      : 'Clears completed skills and quests of this path. Keeps your activity history, so your streak stays.'
  }
  return mode === 'wipe'
    ? 'Clears completed skills, quests, activity history and the weekly reward on every path. Your streak can drop.'
    : 'Clears completed skills and quests on every path. Keeps your activity history and weekly reward.'
}
