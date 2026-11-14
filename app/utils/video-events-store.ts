import type { VideoEvent } from '#shared/types/video'
import { parseEvent, serializeEvent } from '#shared/utils/video-events'
import type { StorageLike } from '~/utils/progress-store'

/** localStorage key of the records that are not in the cloud yet (spec: skill-video-pipeline, Req 13.14). */
export const VIDEO_EVENTS_KEY = 'pursio-video-events:v1'

/** One record per video and source (Req 13.9). */
export function eventKey(rec: Pick<VideoEvent, 'videoId' | 'source'>): string {
  return `${rec.source}|${rec.videoId}`
}

/** Reads the stored records. Missing, broken or invalid data gives no records. */
export function readLocalEvents(storage: StorageLike | null): Map<string, VideoEvent> {
  const out = new Map<string, VideoEvent>()
  if (!storage) return out
  let raw: string | null
  try {
    raw = storage.getItem(VIDEO_EVENTS_KEY)
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
    const rec = parseEvent(item)
    if (rec) out.set(eventKey(rec), rec)
  }
  return out
}

/** Writes the records. A failing storage (full, blocked) is ignored: the record stays in memory. */
export function writeLocalEvents(storage: StorageLike | null, records: ReadonlyMap<string, VideoEvent>): void {
  if (!storage) return
  try {
    if (records.size === 0) storage.removeItem(VIDEO_EVENTS_KEY)
    else storage.setItem(VIDEO_EVENTS_KEY, JSON.stringify([...records.values()].map(serializeEvent)))
  } catch {
    // Nothing to do: the player is never affected by a storage failure.
  }
}

/**
 * Removes the records that were sent, but keeps one that changed after it was
 * sent (its `updatedAt` differs), so a later change is not lost.
 */
export function removeSent(
  records: ReadonlyMap<string, VideoEvent>,
  sent: readonly VideoEvent[],
): Map<string, VideoEvent> {
  const next = new Map(records)
  for (const rec of sent) {
    const key = eventKey(rec)
    const current = next.get(key)
    if (current && current.updatedAt === rec.updatedAt) next.delete(key)
  }
  return next
}
