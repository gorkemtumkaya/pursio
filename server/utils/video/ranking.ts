import type { GoalClass, PoolVideo } from '../../../shared/types/video'
import { baseScore, goalAdjustment } from '../../../shared/utils/video-ranking'

export { GOAL_BONUS, baseScore, goalAdjustment } from '../../../shared/utils/video-ranking'

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
