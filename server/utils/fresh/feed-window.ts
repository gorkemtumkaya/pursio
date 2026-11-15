import type { FeedEntry } from '../../../shared/types/fresh'
import { compareCodePoints } from '../../../shared/utils/fresh-keys'

/** Feed window length in seconds (7 days). */
export const FEED_WINDOW_S = 604800
/** Most entries kept per Channel_Feed. */
export const ENTRIES_PER_FEED = 15
/** Most videos sent to the Judge per Fresh_Check. */
export const JUDGE_LIMIT = 40

/** Published desc, then video id ascending by code point (matches SQL `collate "C"`). */
function newestFirst(a: FeedEntry, b: FeedEntry): number {
  if (a.publishedMs !== b.publishedMs) return b.publishedMs - a.publishedMs
  return compareCodePoints(a.videoId, b.videoId)
}

/** Req 4.2, 4.3: channel id equal, lower < published <= checkStart, newest 15. */
export function keepEntries(
  entries: readonly FeedEntry[],
  src: { channelId: string; lastCheckedMs: number | null },
  checkStartMs: number,
): FeedEntry[] {
  const lower = Math.max(src.lastCheckedMs ?? -Infinity, checkStartMs - FEED_WINDOW_S * 1000)
  return entries
    .filter(e => e.channelId === src.channelId && e.publishedMs > lower && e.publishedMs <= checkStartMs)
    .sort(newestFirst)
    .slice(0, ENTRIES_PER_FEED)
}

/** Req 4.6: one entry per video id (lowest channel id wins), minus ids already stored for the key. Ordered by published desc, then id asc. */
export function mergeEntries(perFeed: readonly FeedEntry[][], storedIds: ReadonlySet<string>): FeedEntry[] {
  const byId = new Map<string, FeedEntry>()
  for (const feed of perFeed) {
    for (const entry of feed) {
      if (storedIds.has(entry.videoId)) continue
      const seen = byId.get(entry.videoId)
      if (!seen || compareCodePoints(entry.channelId, seen.channelId) < 0) byId.set(entry.videoId, entry)
    }
  }
  return [...byId.values()].sort(newestFirst)
}

/** Req 6.1, 6.12: newest 40 by Feed_Entry published time, ties by video id ascending. */
export function chooseForJudge<T extends { entry: FeedEntry }>(videos: readonly T[]): T[] {
  return [...videos].sort((a, b) => newestFirst(a.entry, b.entry)).slice(0, JUDGE_LIMIT)
}
