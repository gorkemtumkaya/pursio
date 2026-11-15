import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import { parseEvent, serializeEvent } from '../../shared/utils/video-events'

const RUNS = { numRuns: 300 }
const arbTime = fc.integer({ min: 0, max: 2_000_000_000 })
// `+ 0` turns -0 into 0, which JSON cannot carry.
const arbSeconds = fc.double({ min: 0, max: 100_000, noNaN: true }).map(n => n + 0)
const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')
// fc.record may build null-prototype objects; spread to a plain object so toStrictEqual compares values only.
const arbSnapshot: fc.Arbitrary<SaveSnapshot> = fc
  .record({
    videoId: fc.string({ minLength: 1, maxLength: 64 }),
    title: fc.string({ maxLength: 500 }),
    channel: fc.string({ maxLength: 200 }),
    channelId: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
    thumbnailUrl: fc.string({ maxLength: 200 }),
    durationSeconds: fc.oneof(fc.integer({ min: 0, max: 100_000 }), arbSeconds),
  })
  .map(s => ({ ...s }))

/** A valid record: snapshot and snapshotAt are both null or both set. */
const arbEvent: fc.Arbitrary<VideoEvent> = fc
  .record({
    videoId: fc.string({ minLength: 1, maxLength: 64 }),
    source: arbSource,
    playedAt: fc.option(arbTime, { nil: null }),
    watchedSeconds: arbSeconds,
    finished: fc.boolean(),
    saved: fc.boolean(),
    savedAt: fc.option(arbTime, { nil: null }),
    skipped: fc.boolean(),
    snap: fc.option(fc.tuple(arbSnapshot, arbTime), { nil: null }),
    updatedAt: arbTime,
  })
  .map(({ snap, ...r }) => ({
    ...r,
    saved: r.savedAt === null ? false : r.saved,
    skipped: r.playedAt === null ? r.skipped : false,
    snapshot: snap === null ? null : snap[0],
    snapshotAt: snap === null ? null : snap[1],
  }))

/** A stored row with the named fields removed, as records written before Fresh look. */
function without(rec: VideoEvent, ...keys: ('snapshot' | 'snapshotAt')[]): Record<string, unknown> {
  const row: Record<string, unknown> = { ...serializeEvent(rec) }
  for (const k of keys) delete row[k]
  return row
}

describe('Property 39: Event round trip with snapshot', () => {
  /** **Validates: Requirements 17.10** */
  it('serialize then parse gives the whole record back, snapshot and snapshotAt included', () => {
    fc.assert(
      fc.property(arbEvent, rec => {
        expect(parseEvent(serializeEvent(rec))).toStrictEqual(rec)
        expect(parseEvent(JSON.stringify(serializeEvent(rec)))).toStrictEqual(rec)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10** */
  it('a stored record without snapshot or snapshotAt parses with that field null', () => {
    fc.assert(
      fc.property(arbEvent, rec => {
        const rest = { ...rec, snapshot: null, snapshotAt: null }
        // No snapshot field: no snapshot, so no snapshot time either.
        expect(parseEvent(JSON.stringify(without(rec, 'snapshot')))).toStrictEqual(rest)
        expect(parseEvent(JSON.stringify(without(rec, 'snapshot', 'snapshotAt')))).toStrictEqual(rest)
        // No snapshotAt field: the snapshot is kept and its time reads as null.
        expect(parseEvent(JSON.stringify(without(rec, 'snapshotAt')))).toStrictEqual({ ...rec, snapshotAt: null })
      }),
      RUNS,
    )
  })

  it('a record stored before Fresh (no snapshot fields) parses with both null', () => {
    const legacy = {
      videoId: 'abc',
      source: 'feed',
      playedAt: 5,
      watchedSeconds: 12,
      finished: false,
      saved: true,
      savedAt: 6,
      skipped: false,
      updatedAt: 7,
    }
    expect(parseEvent(legacy)).toStrictEqual({ ...legacy, snapshot: null, snapshotAt: null })
  })
})
