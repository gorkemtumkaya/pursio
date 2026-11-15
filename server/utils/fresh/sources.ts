/**
 * Channel_Source upkeep for one Check_Key. Pure TypeScript mirror of the SQL
 * function `fresh_sources_refresh` (steps 1 to 4 of the design). Used by the
 * in-memory store and by tests; a contract test keeps both sides aligned.
 */
import type { PoolVideo } from '../../../shared/types/video'
import { isValidChannelId } from '../../../shared/utils/channel-mutes'
import { compareCodePoints } from '../../../shared/utils/fresh-keys'

/** A pool video qualifies at `teachesThisSkill >= 0.7` (Req 1.1, 1.3). */
export const QUALIFYING_MIN = 0.7
/** At most 15 Channel_Sources per Check_Key (Req 1.5). */
export const SOURCES_PER_KEY = 15

/** One Channel_Source of a Check_Key. Times are epoch ms. */
export interface ChannelSourceRow {
  channelId: string
  channelName: string
  qualifyingCount: number
  latestQualifyingMs: number
  lastCheckedMs: number | null
}

/**
 * The channel id of a Qualifying_Video with a known channel id, else null (Req 1.7).
 * A known id has 1 to 64 characters, like `fresh_qualifying_counts` in SQL, which
 * leaves longer ids out so they never break a pool store.
 */
function qualifyingChannelId(video: PoolVideo): string | null {
  if (!(video.teachesThisSkill >= QUALIFYING_MIN)) return null
  return isValidChannelId(video.channelId) ? video.channelId : null
}

/**
 * Steps 1 to 4 over the pools of one Check_Key after `newPool` was stored at `nowMs`.
 * `poolsOfKey` are the pools stored for the key at that moment; `newPool` is counted
 * too, and a video id counts once per channel, so passing it in both places is harmless.
 * Mutes are not an input: they never change these rows (Req 1.10).
 */
export function refreshSources(
  existing: readonly ChannelSourceRow[],
  poolsOfKey: readonly (readonly PoolVideo[])[],
  newPool: readonly PoolVideo[],
  nowMs: number,
): ChannelSourceRow[] {
  // Step 1: distinct qualifying video ids per channel over every pool of the key.
  const idsByChannel = new Map<string, Set<string>>()
  for (const pool of [...poolsOfKey, newPool]) {
    for (const video of pool) {
      const channelId = qualifyingChannelId(video)
      if (channelId === null) continue
      let ids = idsByChannel.get(channelId)
      if (!ids) {
        ids = new Set<string>()
        idsByChannel.set(channelId, ids)
      }
      ids.add(video.id)
    }
  }
  const countOf = (channelId: string): number => idsByChannel.get(channelId)?.size ?? 0

  // Step 2: channels of the new pool, name of the first such video in pool order.
  const newNames = new Map<string, string>()
  for (const video of newPool) {
    const channelId = qualifyingChannelId(video)
    if (channelId !== null && !newNames.has(channelId)) newNames.set(channelId, video.channel)
  }

  const rows = new Map<string, ChannelSourceRow>()
  for (const row of existing) rows.set(row.channelId, { ...row })
  for (const [channelId, channelName] of newNames) {
    const prior = rows.get(channelId)
    rows.set(channelId, {
      channelId,
      channelName,
      qualifyingCount: countOf(channelId),
      latestQualifyingMs: nowMs,
      lastCheckedMs: prior ? prior.lastCheckedMs : null,
    })
  }

  // Step 3: recount every other row, then drop rows with count 0.
  const kept: ChannelSourceRow[] = []
  for (const row of rows.values()) {
    if (!newNames.has(row.channelId)) row.qualifyingCount = countOf(row.channelId)
    if (row.qualifyingCount > 0) kept.push(row)
  }

  // Step 4: keep the top 15.
  return rankChannelSources(kept)
}

/**
 * Sort by Qualifying_Count desc, then latest qualifying time desc, then channel id
 * asc by code point (same as `collate "C"`), and cut to 15 (Req 1.5).
 */
export function rankChannelSources(rows: readonly ChannelSourceRow[]): ChannelSourceRow[] {
  return [...rows]
    .sort(
      (a, b) =>
        b.qualifyingCount - a.qualifyingCount ||
        b.latestQualifyingMs - a.latestQualifyingMs ||
        compareCodePoints(a.channelId, b.channelId),
    )
    .slice(0, SOURCES_PER_KEY)
}
