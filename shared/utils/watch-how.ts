import type { RankedVideo } from '../types/video'
import { normalizeText } from './video-normalize'

/**
 * Highest-ranked video (earliest in the received order) whose Normalized
 * matchedQuestText equals the Normalized quest text; null if none.
 */
export function watchHowFor(questText: string, videos: readonly RankedVideo[]): RankedVideo | null {
  const wanted = normalizeText(questText)
  for (const video of videos) {
    if (video.matchedQuestText !== null && normalizeText(video.matchedQuestText) === wanted) return video
  }
  return null
}

/** `m:ss` below 3600 seconds, `h:mm:ss` from 3600. */
export function formatDuration(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`
  return `${m}:${ss}`
}

/** The first `max` videos in the given order. */
export function topCards(videos: readonly RankedVideo[], max = 3): RankedVideo[] {
  return videos.slice(0, Math.max(0, max))
}

/** True when the video came from a pool whose language differs from the user's Language_Code. */
export function showPoolLanguageLabel(video: RankedVideo, userLanguage: string): boolean {
  return video.poolLanguage !== userLanguage
}
