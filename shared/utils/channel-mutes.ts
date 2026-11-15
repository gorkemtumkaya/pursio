import { z } from 'zod'
import type { ChannelMute } from '../types/fresh'
import { compareCodePoints } from './fresh-keys'

/** Longest channel id a Channel_Mute may hold (Req 2.10). */
export const MAX_CHANNEL_ID_LENGTH = 64

/** A channel id is a string of 1 to 64 characters (Req 2.10). */
export function isValidChannelId(id: unknown): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= MAX_CHANNEL_ID_LENGTH
}

/**
 * Merge two records of one user and channel id (Req 2.6, 2.8). The later
 * `changedAt` wins; on equal times muted true wins. Commutative, associative
 * and idempotent. Must stay in step with the SQL function merge_channel_mutes.
 */
export function mergeMute(a: ChannelMute, b: ChannelMute): ChannelMute {
  if (a.changedAt > b.changedAt) return { ...a }
  if (b.changedAt > a.changedAt) return { ...b }
  return { channelId: a.channelId, muted: a.muted || b.muted, changedAt: a.changedAt }
}

/**
 * One record per channel id present in either list, each the merge of all that
 * channel's records (Req 2.3). Sorted by channel id in code point order, so the
 * result does not depend on input order.
 */
export function mergeMuteLists(a: readonly ChannelMute[], b: readonly ChannelMute[]): ChannelMute[] {
  const byId = new Map<string, ChannelMute>()
  for (const rec of [...a, ...b]) {
    const prev = byId.get(rec.channelId)
    byId.set(rec.channelId, prev ? mergeMute(prev, rec) : { ...rec })
  }
  return [...byId.values()].sort((x, y) => compareCodePoints(x.channelId, y.channelId))
}

const channelMuteSchema = z.object({
  channelId: z.string().refine(isValidChannelId),
  muted: z.boolean(),
  changedAt: z.number().finite(),
})

/**
 * The payload row for merge_channel_mutes and the local store: camelCase keys,
 * `changedAt` as epoch ms. Returns a fresh plain object, safe to JSON.stringify.
 */
export function serializeMute(rec: ChannelMute): Record<string, string | number | boolean> {
  return { channelId: rec.channelId, muted: rec.muted, changedAt: rec.changedAt }
}

/** Parse an unknown value (object or JSON string) into a record, or null when invalid (Req 2.10). */
export function parseMute(input: unknown): ChannelMute | null {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  const parsed = channelMuteSchema.safeParse(value)
  return parsed.success
    ? { channelId: parsed.data.channelId, muted: parsed.data.muted, changedAt: parsed.data.changedAt }
    : null
}
