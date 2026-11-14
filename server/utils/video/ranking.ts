import type { GoalClass, PoolVideo } from '../../../shared/types/video'

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
export function goalAdjustment(v: PoolVideo, goal: GoalClass): number {
  if (goal === 'targeted') {
    return v.style === 'drill' || v.style === 'technique' ? GOAL_BONUS : 0
  }
  if (goal === 'casual') {
    return v.style === 'approachable' || v.durationSeconds <= SHORT_SECONDS ? GOAL_BONUS : 0
  }
  return 0
}

/** Full ranked copy of the pool: score descending, then id ascending (Req 11.2, 11.8, 11.9). */
export function rankVideos(pool: readonly PoolVideo[], goal: GoalClass): PoolVideo[] {
  return pool
    .map((v) => ({ v, score: baseScore(v) + goalAdjustment(v, goal) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.v.id < b.v.id ? -1 : a.v.id > b.v.id ? 1 : 0
    })
    .map((x) => x.v)
}
