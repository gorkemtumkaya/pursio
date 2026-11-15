import { z } from 'zod'

import type { SaveSnapshot } from '../types/fresh'
import type { VideoEvent, VideoSource } from '../types/video'
import { compareCodePoints } from './fresh-keys'

/** Share of the duration that counts as finished (Req 13.3). */
export const FINISHED_RATIO = 0.8

/** A fresh record: nothing played, saved or skipped yet. */
export function newEvent(videoId: string, source: VideoSource, now: number): VideoEvent {
  return {
    videoId,
    source,
    playedAt: null,
    watchedSeconds: 0,
    finished: false,
    saved: false,
    savedAt: null,
    skipped: false,
    snapshot: null,
    snapshotAt: null,
    updatedAt: now,
  }
}

/** First play is stored once; a play clears the skipped flag (Req 13.1, 13.8). Saved fields stay (Req 13.19). */
export function applyPlay(rec: VideoEvent, now: number): VideoEvent {
  return { ...rec, playedAt: rec.playedAt ?? now, skipped: false, updatedAt: now }
}

/** Watched seconds never decrease; finished is sticky and needs a known duration (Req 13.3, 13.4, 13.10). */
export function applyProgress(
  rec: VideoEvent,
  seconds: number,
  durationSeconds: number | null | undefined,
  now: number,
): VideoEvent {
  const incoming = Number.isFinite(seconds) && seconds > 0 ? seconds : 0
  const watchedSeconds = Math.max(rec.watchedSeconds, incoming)
  const knownDuration =
    typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds > 0
  const finished = rec.finished || (knownDuration && watchedSeconds >= FINISHED_RATIO * durationSeconds)
  return { ...rec, watchedSeconds, finished, updatedAt: now }
}

/**
 * The only reducer that changes saved, savedAt, the snapshot and snapshotAt (Req 13.5, 13.6, 13.19).
 * A save with a snapshot replaces it and sets snapshotAt to the Saved_Time; a removal, or a
 * save without a snapshot, keeps both (Req 17.4).
 */
export function applySave(rec: VideoEvent, saved: boolean, now: number, snapshot?: SaveSnapshot | null): VideoEvent {
  if (saved && snapshot) {
    return { ...rec, saved, savedAt: now, snapshot: copySnapshot(snapshot), snapshotAt: now, updatedAt: now }
  }
  return { ...rec, saved, savedAt: now, updatedAt: now }
}

/** A played video is never marked skipped (Req 13.7). Returns the same record then. */
export function applySkip(rec: VideoEvent, now: number): VideoEvent {
  if (rec.playedAt !== null) return rec
  return { ...rec, skipped: true, updatedAt: now }
}

/** Earliest non-null time. */
function earliest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}

/** Latest time; null is earlier than every time. */
function latest(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.max(a, b)
}

/** The saved value of the side with the later savedAt; OR when savedAt is equal. */
function pickSaved(
  a: { saved: boolean; savedAt: number | null },
  b: { saved: boolean; savedAt: number | null },
): boolean {
  if (a.savedAt === b.savedAt) return a.saved || b.saved
  if (a.savedAt === null) return b.saved
  if (b.savedAt === null) return a.saved
  return a.savedAt > b.savedAt ? a.saved : b.saved
}

function copySnapshot(s: SaveSnapshot | null): SaveSnapshot | null {
  if (s === null) return null
  return {
    videoId: s.videoId,
    title: s.title,
    channel: s.channel,
    channelId: s.channelId,
    thumbnailUrl: s.thumbnailUrl,
    durationSeconds: s.durationSeconds,
  }
}
/** Canonical text of a snapshot: fields joined with U+001F. Same text as the SQL `concat_ws(chr(31), ...)`. */
export function snapshotCanonical(s: SaveSnapshot): string {
  return [s.videoId, s.title, s.channel, s.channelId ?? '', s.thumbnailUrl, String(s.durationSeconds)].join('\u001f')
}
/**
 * The kept snapshot with its snapshotAt, chosen apart from saved and savedAt: a present
 * snapshot beats a missing one, then the later snapshotAt (null earliest), then the smaller
 * canonical text. A removal never clears it (Req 17.10, decision D2).
 */
function pickSnapshot(a: VideoEvent, b: VideoEvent): Pick<VideoEvent, 'snapshot' | 'snapshotAt'> {
  const keep = (r: VideoEvent) => ({ snapshot: copySnapshot(r.snapshot), snapshotAt: r.snapshotAt })
  if (a.snapshot === null) return b.snapshot === null ? { snapshot: null, snapshotAt: latest(a.snapshotAt, b.snapshotAt) } : keep(b)
  if (b.snapshot === null) return keep(a)
  if (a.snapshotAt !== b.snapshotAt) {
    if (a.snapshotAt === null) return keep(b)
    if (b.snapshotAt === null) return keep(a)
    return a.snapshotAt > b.snapshotAt ? keep(a) : keep(b)
  }
  const order = compareCodePoints(snapshotCanonical(a.snapshot), snapshotCanonical(b.snapshot))
  if (order !== 0) return order < 0 ? keep(a) : keep(b)
  // Same text from different fields (a field holding U+001F): compare field by field so the pick stays order-free.
  return compareFields(a.snapshot, b.snapshot) <= 0 ? keep(a) : keep(b)
}

function compareFields(a: SaveSnapshot, b: SaveSnapshot): number {
  const fa = [a.videoId, a.title, a.channel, a.channelId ?? '', a.thumbnailUrl]
  const fb = [b.videoId, b.title, b.channel, b.channelId ?? '', b.thumbnailUrl]
  for (let i = 0; i < fa.length; i++) {
    const c = compareCodePoints(fa[i]!, fb[i]!)
    if (c !== 0) return c
  }
  return a.durationSeconds - b.durationSeconds
}
/**
 * Merge two records of one user, video and source. Commutative, associative and
 * idempotent. Must stay in step with the SQL function merge_video_events.
 */
export function mergeEvents(a: VideoEvent, b: VideoEvent): VideoEvent {
  const playedAt = earliest(a.playedAt, b.playedAt)
  return {
    videoId: a.videoId,
    source: a.source,
    playedAt,
    watchedSeconds: Math.max(a.watchedSeconds, b.watchedSeconds),
    finished: a.finished || b.finished,
    saved: pickSaved(a, b),
    savedAt: latest(a.savedAt, b.savedAt),
    skipped: (a.skipped || b.skipped) && playedAt === null,
    ...pickSnapshot(a, b),
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  }
}

/** What a reader sees for one video across all sources (Req 13.16). */
export interface CombinedEvent {
  videoId: string
  playedAt: number | null
  watchedSeconds: number
  finished: boolean
  saved: boolean
  savedAt: number | null
}

/** Combine the records of one video over all sources. Returns null for an empty list. */
export function combineSources(recs: readonly VideoEvent[]): CombinedEvent | null {
  const first = recs[0]
  if (!first) return null
  let out: CombinedEvent = {
    videoId: first.videoId,
    playedAt: first.playedAt,
    watchedSeconds: first.watchedSeconds,
    finished: first.finished,
    saved: first.saved,
    savedAt: first.savedAt,
  }
  for (const r of recs.slice(1)) {
    out = {
      videoId: out.videoId,
      playedAt: earliest(out.playedAt, r.playedAt),
      watchedSeconds: Math.max(out.watchedSeconds, r.watchedSeconds),
      finished: out.finished || r.finished,
      saved: pickSaved(out, r),
      savedAt: latest(out.savedAt, r.savedAt),
    }
  }
  return out
}

/** Skips count for the Feed only from `feed` records (Req 13.17). */
export function countFeedSkips(recs: readonly VideoEvent[]): number {
  let n = 0
  for (const r of recs) if (r.source === 'feed' && r.skipped) n++
  return n
}

const epochMs = z.number().finite()
const saveSnapshotSchema = z.object({
  videoId: z.string().min(1).max(64),
  title: z.string().max(500),
  channel: z.string().max(200),
  channelId: z.string().min(1).max(64).nullable(),
  thumbnailUrl: z.string().max(2048),
  durationSeconds: z.number().finite().min(0),
})

const videoEventSchema = z.object({
  videoId: z.string().min(1).max(64),
  source: z.enum(['skill_sheet', 'feed']),
  playedAt: epochMs.nullable(),
  watchedSeconds: z.number().finite().min(0),
  finished: z.boolean(),
  saved: z.boolean(),
  savedAt: epochMs.nullable(),
  skipped: z.boolean(),
  // A missing field (records stored before Fresh) reads as null; a bad shape is dropped to null
  // so the rest of the record (plays, progress) is kept.
  snapshot: z.unknown().optional(),
  snapshotAt: epochMs.nullable().optional(),
  updatedAt: epochMs,
})

/**
 * The payload row for merge_video_events: camelCase keys, times as epoch ms or null.
 * Returns a fresh plain object, safe to JSON.stringify.
 */
export function serializeEvent(rec: VideoEvent): Record<string, string | number | boolean | SaveSnapshot | null> {
  return {
    videoId: rec.videoId,
    source: rec.source,
    playedAt: rec.playedAt,
    watchedSeconds: rec.watchedSeconds,
    finished: rec.finished,
    saved: rec.saved,
    savedAt: rec.savedAt,
    skipped: rec.skipped,
    snapshot: copySnapshot(rec.snapshot),
    snapshotAt: rec.snapshotAt,
    updatedAt: rec.updatedAt,
  }
}

/** Parse an unknown value (object or JSON string) into a record, or null when invalid. */
export function parseEvent(input: unknown): VideoEvent | null {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  const parsed = videoEventSchema.safeParse(value)
  if (!parsed.success) return null
  const snap = saveSnapshotSchema.safeParse(parsed.data.snapshot)
  const snapshot = snap.success ? snap.data : null
  // A missing snapshotAt reads as null; no snapshot means no snapshot time.
  const snapshotAt = snapshot === null ? null : (parsed.data.snapshotAt ?? null)
  return { ...parsed.data, snapshot, snapshotAt }
}
