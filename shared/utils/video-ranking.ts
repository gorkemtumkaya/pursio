/**
 * Pure ranking scores shared by the pool ranking (server) and the Fresh_Score
 * (Client and server). No server imports, so it is safe in the browser bundle.
 */
import type { GoalClass, PoolVideo } from '../types/video'

/** Goal rerank bonus. Must stay within 0..0.2 (Req 11.7). */
export const GOAL_BONUS = 0.1

const SHORT_SECONDS = 900

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** teaches_this_skill * level_fit, inputs and result clamped to 0..1 (Req 11.1). */
export function baseScore(v: { teachesThisSkill: number; levelFit: number }): number {
  return clamp01(clamp01(v.teachesThisSkill) * clamp01(v.levelFit))
}

/** 0 or GOAL_BONUS. Unknown goal values count as 'none' (Req 11.4 to 11.7). */
export function goalAdjustment(
  v: Pick<PoolVideo, 'style' | 'durationSeconds'>,
  goal: GoalClass,
): number {
  if (goal === 'targeted') {
    return v.style === 'drill' || v.style === 'technique' ? GOAL_BONUS : 0
  }
  if (goal === 'casual') {
    return v.style === 'approachable' || v.durationSeconds <= SHORT_SECONDS ? GOAL_BONUS : 0
  }
  return 0
}
