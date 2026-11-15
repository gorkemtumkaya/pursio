import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { applySave, mergeEvents, snapshotCanonical } from '../../shared/utils/video-events'

const RUNS = { numRuns: 500 }

// Small ranges so equal times (and ties) happen often.
const arbTime = fc.integer({ min: 0, max: 6 })
const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')
const arbVideoId = fc.constantFrom('v1', 'v2')

// A tiny alphabet, U+001F included, so snapshots often share canonical text (sometimes from different fields).
const arbText = fc.string({ unit: fc.constantFrom('a', 'b', '\u001f'), maxLength: 3 })
const fixedSnapshots: SaveSnapshot[] = [
  { videoId: 'v1', title: 'Intro', channel: 'Chan', channelId: 'UC1', thumbnailUrl: 'https://i/1.jpg', durationSeconds: 60 },
  { videoId: 'v1', title: 'Intro', channel: 'Chan', channelId: null, thumbnailUrl: 'https://i/1.jpg', durationSeconds: 60 },
  { videoId: 'v1', title: 'Intro 2', channel: 'Chan', channelId: 'UC1', thumbnailUrl: 'https://i/1.jpg', durationSeconds: 61 },
]
const arbSnapshot: fc.Arbitrary<SaveSnapshot> = fc.oneof(
  fc.constantFrom(...fixedSnapshots),
  fc.record({
    videoId: fc.string({ unit: fc.constantFrom('a', 'b', '\u001f'), minLength: 1, maxLength: 2 }),
    title: arbText,
    channel: arbText,
    channelId: fc.option(fc.string({ unit: fc.constantFrom('a', '\u001f'), minLength: 1, maxLength: 2 }), { nil: null }),
    thumbnailUrl: arbText,
    durationSeconds: fc.integer({ min: 0, max: 2 }),
  }),
)

/** A valid record of the given key; snapshot and snapshotAt are both null or both set. */
function arbEvent(videoId: string, source: VideoSource): fc.Arbitrary<VideoEvent> {
  return fc
    .record({
      playedAt: fc.option(arbTime, { nil: null }),
      watchedSeconds: fc.integer({ min: 0, max: 5 }),
      finished: fc.boolean(),
      saved: fc.boolean(),
      savedAt: fc.option(arbTime, { nil: null }),
      skipped: fc.boolean(),
      snap: fc.option(fc.tuple(arbSnapshot, arbTime), { nil: null }),
      updatedAt: arbTime,
    })
    .map(({ snap, ...r }) => ({
      videoId,
      source,
      ...r,
      saved: r.savedAt === null ? false : r.saved,
      skipped: r.playedAt === null ? r.skipped : false,
      snapshot: snap === null ? null : snap[0],
      snapshotAt: snap === null ? null : snap[1],
    }))
}

/** n records of one video and one source. */
const arbSameKey = (n: number): fc.Arbitrary<VideoEvent[]> =>
  fc
    .tuple(arbVideoId, arbSource)
    .chain(([id, src]) => fc.array(arbEvent(id, src), { minLength: n, maxLength: n }))

/**
 * Reference rule, independent of argument order: among present snapshots keep the latest
 * snapshotAt, then the smallest canonical text. Returns null when none is present.
 */
function expectedSnapshot(recs: readonly VideoEvent[]): { snapshotAt: number; canonical: string } | null {
  let best: { snapshotAt: number; canonical: string } | null = null
  for (const r of recs) {
    if (r.snapshot === null || r.snapshotAt === null) continue
    const cand = { snapshotAt: r.snapshotAt, canonical: snapshotCanonical(r.snapshot) }
    if (
      best === null ||
      cand.snapshotAt > best.snapshotAt ||
      (cand.snapshotAt === best.snapshotAt && compareCodePoints(cand.canonical, best.canonical) < 0)
    ) {
      best = cand
    }
  }
  return best
}

/** The merged snapshot matches the reference rule and is a copy of one of the inputs' snapshots. */
function checkSnapshot(m: VideoEvent, recs: readonly VideoEvent[]): void {
  const exp = expectedSnapshot(recs)
  if (exp === null) {
    expect(m.snapshot).toBeNull()
    expect(m.snapshotAt).toBeNull()
    return
  }
  expect(m.snapshot).not.toBeNull()
  expect(m.snapshotAt).toBe(exp.snapshotAt)
  expect(snapshotCanonical(m.snapshot!)).toBe(exp.canonical)
  const sources = recs.filter(r => r.snapshotAt === exp.snapshotAt && r.snapshot !== null).map(r => r.snapshot)
  expect(sources).toContainEqual(m.snapshot)
}

describe('Feature: fresh, Property 38: Event merge with snapshot', () => {
  /** **Validates: Requirements 17.10, 19.21** */
  it('is commutative on the whole record', () => {
    fc.assert(
      fc.property(arbSameKey(2), ([a, b]) => {
        expect(mergeEvents(a!, b!)).toEqual(mergeEvents(b!, a!))
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10, 19.21** */
  it('is associative on the whole record', () => {
    fc.assert(
      fc.property(arbSameKey(3), ([a, b, c]) => {
        expect(mergeEvents(mergeEvents(a!, b!), c!)).toEqual(mergeEvents(a!, mergeEvents(b!, c!)))
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10, 19.21** */
  it('is idempotent on the whole record', () => {
    fc.assert(
      fc.property(arbSameKey(2), ([a, b]) => {
        expect(mergeEvents(a!, a!)).toEqual(a)
        const m = mergeEvents(a!, b!)
        expect(mergeEvents(m, b!)).toEqual(m)
        expect(mergeEvents(m, m)).toEqual(m)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10, 19.21** */
  it('keeps present over missing, then later snapshotAt, then smaller canonical text, whatever the saved value', () => {
    fc.assert(
      fc.property(arbSameKey(3), ([a, b, c]) => {
        checkSnapshot(mergeEvents(a!, b!), [a!, b!])
        checkSnapshot(mergeEvents(mergeEvents(a!, b!), c!), [a!, b!, c!])
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10** */
  it('keeps the unchanged rule for saved and savedAt', () => {
    fc.assert(
      fc.property(arbSameKey(2), ([a, b]) => {
        const m = mergeEvents(a!, b!)
        const times = [a!.savedAt, b!.savedAt].filter((t): t is number => t !== null)
        expect(m.savedAt).toBe(times.length ? Math.max(...times) : null)
        if (a!.savedAt === b!.savedAt) expect(m.saved).toBe(a!.saved || b!.saved)
        else expect(m.saved).toBe(((a!.savedAt ?? -1) > (b!.savedAt ?? -1) ? a! : b!).saved)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 17.10, 19.21** */
  it('never clears a snapshot when a removal is merged', () => {
    fc.assert(
      fc.property(arbSameKey(2), arbTime, ([a, b], t) => {
        // b is removed later than anything else, so the merged saved value is false.
        const removal = applySave(b!, false, 10 + t)
        const m = mergeEvents(a!, removal)
        expect(m.saved).toBe(false)
        if (a!.snapshot !== null || b!.snapshot !== null) expect(m.snapshot).not.toBeNull()
        checkSnapshot(m, [a!, b!])
        expect(mergeEvents(removal, a!)).toEqual(m)
      }),
      RUNS,
    )
  })

  it('example: a later save on one side and an earlier snapshot on the other', () => {
    const base: VideoEvent = {
      videoId: 'v1',
      source: 'feed',
      playedAt: null,
      watchedSeconds: 0,
      finished: false,
      saved: false,
      savedAt: null,
      skipped: false,
      snapshot: null,
      snapshotAt: null,
      updatedAt: 0,
    }
    const older = applySave(base, true, 5, fixedSnapshots[0])
    const newer = applySave(base, true, 8, fixedSnapshots[2])
    const removed = applySave(newer, false, 9)
    const m = mergeEvents(older, removed)
    expect(m.saved).toBe(false)
    expect(m.snapshot).toEqual(fixedSnapshots[2])
    expect(m.snapshotAt).toBe(8)
  })
})
