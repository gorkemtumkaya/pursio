import type { GoalClass, PoolVideo, RankedVideo, VideoPool } from '../../../shared/types/video'
import { rankVideos } from './ranking'

export const FALLBACK_MIN = 3
export const RESPONSE_LIMIT = 12

/** Fallback_Condition: language is not 'en' and the user pool holds fewer than 3 videos (Req 10.15). */
export function fallbackApplies(language: string, userPoolCount: number): boolean {
  return language !== 'en' && userPoolCount < FALLBACK_MIN
}

function toRanked(v: PoolVideo, poolLanguage: string): RankedVideo {
  return {
    id: v.id,
    title: v.title,
    channel: v.channel,
    thumbnailUrl: v.thumbnailUrl,
    durationSeconds: v.durationSeconds,
    style: v.style,
    matchedQuestText: v.matchedQuestText,
    poolLanguage,
  }
}

export interface ComposeInput {
  /** Language_Code of the user. */
  language: string
  /** 'none' for Signed_Out_Users. */
  goal: GoalClass
  userPool: VideoPool | null
  /** null when language is 'en' or the pool was not read. */
  enPool: VideoPool | null
  limit?: number
}

/**
 * Ranks each pool alone, appends English fallback videos after all user-language
 * videos when the fallback applies, removes duplicate ids (user copy wins) before
 * the limit, and tags every video with its pool language.
 */
export function composeVideos(input: ComposeInput): RankedVideo[] {
  const limit = input.limit ?? RESPONSE_LIMIT
  const own = rankVideos(input.userPool?.videos ?? [], input.goal)
  const out: RankedVideo[] = own.map((v) => toRanked(v, input.language))

  if (fallbackApplies(input.language, own.length) && input.enPool) {
    const seen = new Set(out.map((v) => v.id))
    for (const v of rankVideos(input.enPool.videos, input.goal)) {
      if (seen.has(v.id)) continue
      seen.add(v.id)
      out.push(toRanked(v, 'en'))
    }
  }
  return out.slice(0, Math.max(0, limit))
}
