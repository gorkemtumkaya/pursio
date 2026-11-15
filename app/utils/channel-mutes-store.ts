import type { ChannelMute } from '#shared/types/fresh'
import { isValidChannelId, mergeMute, parseMute, serializeMute } from '#shared/utils/channel-mutes'
import type { StorageLike } from '~/utils/progress-store'

/**
 * localStorage key of the Channel_Mutes kept on this device (spec: fresh, Req 2.5, 2.7):
 * every mute while no cloud store is ready, and only the unsent ones once it is.
 */
export const CHANNEL_MUTES_KEY = 'pursio-channel-mutes:v1'

/** Reads the stored mutes, one per channel id. Missing, broken or invalid data gives no records. */
export function readLocalMutes(storage: StorageLike | null): Map<string, ChannelMute> {
  const out = new Map<string, ChannelMute>()
  if (!storage) return out
  let raw: string | null
  try {
    raw = storage.getItem(CHANNEL_MUTES_KEY)
  } catch {
    return out
  }
  if (raw === null) return out
  let list: unknown
  try {
    list = JSON.parse(raw)
  } catch {
    return out
  }
  if (!Array.isArray(list)) return out
  for (const item of list as unknown[]) {
    const rec = parseMute(item)
    if (!rec) continue
    const prev = out.get(rec.channelId)
    out.set(rec.channelId, prev ? mergeMute(prev, rec) : rec)
  }
  return out
}

/** Writes the mutes. A failing storage (full, blocked) is ignored: the records stay in memory. */
export function writeLocalMutes(storage: StorageLike | null, records: ReadonlyMap<string, ChannelMute>): void {
  if (!storage) return
  try {
    if (records.size === 0) storage.removeItem(CHANNEL_MUTES_KEY)
    else storage.setItem(CHANNEL_MUTES_KEY, JSON.stringify([...records.values()].map(serializeMute)))
  } catch {
    // Nothing to do: the switch keeps the state the learner chose.
  }
}

/**
 * One mute write (Req 2.1 to 2.3, 2.10). An invalid channel id is rejected and the
 * records are returned unchanged; a valid one replaces that channel's record in place.
 */
export function applyMuteWrite(
  records: ReadonlyMap<string, ChannelMute>,
  write: { channelId: unknown; muted: boolean; changedAt: number },
): Map<string, ChannelMute> {
  const next = new Map(records)
  if (!isValidChannelId(write.channelId) || !Number.isFinite(write.changedAt)) return next
  next.set(write.channelId, { channelId: write.channelId, muted: write.muted, changedAt: write.changedAt })
  return next
}

/**
 * Removes the records that were sent, but keeps one that changed after it was sent
 * (its `changedAt` or `muted` differs), so a later change is not lost (Req 2.6).
 */
export function removeSentMutes(
  records: ReadonlyMap<string, ChannelMute>,
  sent: readonly ChannelMute[],
): Map<string, ChannelMute> {
  const next = new Map(records)
  for (const rec of sent) {
    const current = next.get(rec.channelId)
    if (current && current.changedAt === rec.changedAt && current.muted === rec.muted) next.delete(rec.channelId)
  }
  return next
}
