import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import {
  applyPlay,
  applyProgress,
  applySave,
  applySkip,
  combineSources,
  countFeedSkips,
  mergeEvents,
  newEvent,
  parseEvent,
  serializeEvent,
} from '../../shared/utils/video-events'

const RUNS = { numRuns: 300 }

const arbTime = fc.integer({ min: 0, max: 2_000_000_000 })
const arbSeconds = fc.double({ min: 0, max: 100_000, noNaN: true }).map(n => n + 0)
const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')
const arbVideoId = fc.string({ minLength: 1, maxLength: 64 })

/** A valid record: no save time means not saved, a played video is not skipped. */
function arbEvent(source?: fc.Arbitrary<VideoSource>, videoId?: fc.Arbitrary<string>): fc.Arbitrary<VideoEvent> {
  return fc
    .record({
      videoId: videoId ?? arbVideoId,
      source: source ?? arbSource,
      playedAt: fc.option(arbTime, { nil: null }),
      watchedSeconds: arbSeconds,
      finished: fc.boolean(),
      saved: fc.boolean(),
      savedAt: fc.option(arbTime, { nil: null }),
      skipped: fc.boolean(),
      updatedAt: arbTime,
    })
    .map(r => ({
      ...r,
      saved: r.savedAt === null ? false : r.saved,
      skipped: r.playedAt === null ? r.skipped : false,
    }))
}

/** Records of one video and one source. */
const arbSameKey = (n: number): fc.Arbitrary<VideoEvent[]> =>
  fc
    .tuple(arbVideoId, arbSource)
    .chain(([id, src]) => fc.array(arbEvent(fc.constant(src), fc.constant(id)), { minLength: n, maxLength: n }))

type Action =
  | { kind: 'play'; now: number }
  | { kind: 'progress'; now: number; seconds: number; duration: number | null }
  | { kind: 'save'; now: number; saved: boolean }
  | { kind: 'skip'; now: number }

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ kind: fc.constant('play' as const), now: arbTime }),
  fc.record({
    kind: fc.constant('progress' as const),
    now: arbTime,
    seconds: fc.double({ min: -10, max: 5000, noNaN: true }),
    duration: fc.option(fc.double({ min: -10, max: 5000, noNaN: true }), { nil: null }),
  }),
  fc.record({ kind: fc.constant('save' as const), now: arbTime, saved: fc.boolean() }),
  fc.record({ kind: fc.constant('skip' as const), now: arbTime }),
)

function step(rec: VideoEvent, a: Action): VideoEvent {
  switch (a.kind) {
    case 'play':
      return applyPlay(rec, a.now)
    case 'progress':
      return applyProgress(rec, a.seconds, a.duration, a.now)
    case 'save':
      return applySave(rec, a.saved, a.now)
    case 'skip':
      return applySkip(rec, a.now)
  }
}

describe('Property 35: Event reducers', () => {
  it('keeps the invariants over any action sequence', () => {
    // **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8, 13.10, 13.19**
    fc.assert(
      fc.property(arbVideoId, arbSource, arbTime, fc.array(arbAction, { maxLength: 30 }), (id, src, t0, actions) => {
        let rec = newEvent(id, src, t0)
        let expectFinished = false
        let firstPlay: number | null = null
        let played = false
        for (const a of actions) {
          const before = rec
          rec = step(rec, a)

          expect(rec.watchedSeconds).toBeGreaterThanOrEqual(before.watchedSeconds)
          expect(rec.watchedSeconds).toBeGreaterThanOrEqual(0)
          if (before.finished) expect(rec.finished).toBe(true)

          if (a.kind === 'progress') {
            if (a.duration !== null && a.duration > 0 && rec.watchedSeconds >= 0.8 * a.duration) {
              expectFinished = true
            }
          }
          expect(rec.finished).toBe(expectFinished)

          if (a.kind === 'play') {
            if (!played) firstPlay = a.now
            played = true
            expect(rec.skipped).toBe(false)
          }
          expect(rec.playedAt).toBe(firstPlay)
          if (played) expect(rec.skipped).toBe(false)

          if (a.kind === 'save') {
            expect(rec.saved).toBe(a.saved)
            expect(rec.savedAt).toBe(a.now)
            expect(rec.updatedAt).toBe(a.now)
          } else {
            expect(rec.saved).toBe(before.saved)
            expect(rec.savedAt).toBe(before.savedAt)
          }
        }
      }),
      RUNS,
    )
  })

  it('ignores a skip after the video was played and sets it before', () => {
    // **Validates: Requirements 13.7, 13.8**
    fc.assert(
      fc.property(arbVideoId, arbSource, arbTime, arbTime, arbTime, (id, src, t0, t1, t2) => {
        const fresh = newEvent(id, src, t0)
        expect(applySkip(fresh, t1).skipped).toBe(true)
        const played = applyPlay(fresh, t1)
        expect(applySkip(played, t2)).toEqual(played)
        expect(applyPlay(applySkip(fresh, t1), t2).skipped).toBe(false)
      }),
      RUNS,
    )
  })
})

describe('Property 36: Event merge', () => {
  it('is commutative, associative and idempotent', () => {
    // **Validates: Requirements 13.13, 13.20**
    fc.assert(
      fc.property(arbSameKey(3), ([a, b, c]) => {
        expect(mergeEvents(a!, b!)).toEqual(mergeEvents(b!, a!))
        expect(mergeEvents(mergeEvents(a!, b!), c!)).toEqual(mergeEvents(a!, mergeEvents(b!, c!)))
        expect(mergeEvents(a!, a!)).toEqual(a)
      }),
      RUNS,
    )
  })

  it('keeps the maxima, the earliest play and the saved value of the later save time', () => {
    // **Validates: Requirements 13.13, 13.20**
    fc.assert(
      fc.property(arbSameKey(2), ([a, b]) => {
        const m = mergeEvents(a!, b!)
        expect(m.watchedSeconds).toBeGreaterThanOrEqual(Math.max(a!.watchedSeconds, b!.watchedSeconds))
        expect(m.finished).toBe(a!.finished || b!.finished)
        const plays = [a!.playedAt, b!.playedAt].filter((t): t is number => t !== null)
        expect(m.playedAt).toBe(plays.length ? Math.min(...plays) : null)
        const saves = [a!.savedAt, b!.savedAt].filter((t): t is number => t !== null)
        expect(m.savedAt).toBe(saves.length ? Math.max(...saves) : null)
        if (a!.savedAt === b!.savedAt) {
          expect(m.saved).toBe(a!.saved || b!.saved)
        } else {
          const later = (a!.savedAt ?? -1) > (b!.savedAt ?? -1) ? a! : b!
          expect(m.saved).toBe(later.saved)
        }
      }),
      RUNS,
    )
  })

  it('picks saved by save time even when the other record is newer elsewhere', () => {
    // **Validates: Requirements 13.13, 13.20**
    const base = newEvent('v', 'feed', 0)
    const older: VideoEvent = {
      ...base,
      saved: true,
      savedAt: 10,
      updatedAt: 10,
    }
    const newer: VideoEvent = {
      ...base,
      saved: false,
      savedAt: 20,
      playedAt: 1,
      watchedSeconds: 1,
      updatedAt: 5,
    }
    const other: VideoEvent = { ...older, playedAt: 100, watchedSeconds: 900, updatedAt: 900 }
    expect(mergeEvents(other, newer).saved).toBe(false)
    expect(mergeEvents(newer, other).saved).toBe(false)
  })
})

describe('Property 37: Event combine across sources and skipped counting', () => {
  it('combines records of one video over both sources', () => {
    // **Validates: Requirements 13.16, 13.17**
    fc.assert(
      fc.property(
        arbVideoId.chain(id => fc.array(arbEvent(arbSource, fc.constant(id)), { minLength: 1, maxLength: 6 })),
        recs => {
          const c = combineSources(recs)!
          const plays = recs.map(r => r.playedAt).filter((t): t is number => t !== null)
          expect(c.videoId).toBe(recs[0]!.videoId)
          expect(c.playedAt).toBe(plays.length ? Math.min(...plays) : null)
          expect(c.watchedSeconds).toBe(Math.max(...recs.map(r => r.watchedSeconds)))
          expect(c.finished).toBe(recs.some(r => r.finished))
          const saves = recs.map(r => r.savedAt).filter((t): t is number => t !== null)
          const latest = saves.length ? Math.max(...saves) : null
          expect(c.savedAt).toBe(latest)
          const atLatest = recs.filter(r => r.savedAt === latest)
          expect(c.saved).toBe(atLatest.some(r => r.saved))
        },
      ),
      RUNS,
    )
  })

  it('returns null for no records', () => {
    expect(combineSources([])).toBeNull()
  })

  it('counts exactly the skipped feed records', () => {
    // **Validates: Requirements 13.17**
    fc.assert(
      fc.property(fc.array(arbEvent(), { maxLength: 12 }), recs => {
        expect(countFeedSkips(recs)).toBe(recs.filter(r => r.source === 'feed' && r.skipped).length)
      }),
      RUNS,
    )
  })
})

describe('Property 38: Event round trip', () => {
  it('serializes then parses to an equivalent record', () => {
    // **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.8, 13.10, 13.13, 13.16, 13.17, 13.18, 13.19, 13.20**
    fc.assert(
      fc.property(arbEvent(), rec => {
        const row = serializeEvent(rec)
        expect(parseEvent(row)).toEqual(rec)
        expect(parseEvent(JSON.stringify(row))).toEqual(rec)
        expect(parseEvent(JSON.parse(JSON.stringify(row)))).toEqual(rec)
      }),
      RUNS,
    )
  })

  it('rejects invalid input', () => {
    expect(parseEvent(null)).toBeNull()
    expect(parseEvent('not json')).toBeNull()
    expect(parseEvent({ videoId: '', source: 'feed' })).toBeNull()
  })
})
