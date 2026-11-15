import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import { applyPlay, applyProgress, applySave, applySkip, newEvent } from '../../shared/utils/video-events'

const RUNS = { numRuns: 300 }

const arbTime = fc.integer({ min: 0, max: 2_000_000_000 })
const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')
const arbVideoId = fc.string({ minLength: 1, maxLength: 64 })

const arbSnapshot: fc.Arbitrary<SaveSnapshot> = fc.record({
  videoId: fc.string({ minLength: 1, maxLength: 64 }),
  title: fc.string({ maxLength: 80 }),
  channel: fc.string({ maxLength: 40 }),
  channelId: fc.option(fc.string({ minLength: 1, maxLength: 64 }), { nil: null }),
  thumbnailUrl: fc.string({ maxLength: 80 }),
  durationSeconds: fc.integer({ min: 0, max: 100_000 }),
})

/** A valid record; snapshot and snapshotAt are both null or both set. */
const arbEvent: fc.Arbitrary<VideoEvent> = fc
  .record({
    videoId: arbVideoId,
    source: arbSource,
    playedAt: fc.option(arbTime, { nil: null }),
    watchedSeconds: fc.integer({ min: 0, max: 100_000 }),
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

type Action =
  | { kind: 'play'; now: number }
  | { kind: 'progress'; now: number; seconds: number; duration: number | null }
  | { kind: 'skip'; now: number }
  | { kind: 'save'; now: number; snapshot: SaveSnapshot | null | undefined }
  | { kind: 'remove'; now: number; snapshot: SaveSnapshot | null | undefined }

const arbOptSnapshot = fc.oneof(arbSnapshot, fc.constant(null), fc.constant(undefined))

const arbAction: fc.Arbitrary<Action> = fc.oneof(
  fc.record({ kind: fc.constant('play' as const), now: arbTime }),
  fc.record({
    kind: fc.constant('progress' as const),
    now: arbTime,
    seconds: fc.integer({ min: 0, max: 5000 }),
    duration: fc.option(fc.integer({ min: 1, max: 5000 }), { nil: null }),
  }),
  fc.record({ kind: fc.constant('skip' as const), now: arbTime }),
  fc.record({ kind: fc.constant('save' as const), now: arbTime, snapshot: arbOptSnapshot }),
  fc.record({ kind: fc.constant('remove' as const), now: arbTime, snapshot: arbOptSnapshot }),
)

function step(rec: VideoEvent, a: Action): VideoEvent {
  switch (a.kind) {
    case 'play':
      return applyPlay(rec, a.now)
    case 'progress':
      return applyProgress(rec, a.seconds, a.duration, a.now)
    case 'skip':
      return applySkip(rec, a.now)
    case 'save':
      return applySave(rec, true, a.now, a.snapshot)
    case 'remove':
      return applySave(rec, false, a.now, a.snapshot)
  }
}

describe('Property 37: Save reducer with snapshot', () => {
  /** **Validates: Requirements 12.6, 17.4** */
  it('newEvent sets snapshot and snapshotAt to null', () => {
    fc.assert(
      fc.property(arbVideoId, arbSource, arbTime, (id, src, now) => {
        const rec = newEvent(id, src, now)
        expect(rec.snapshot).toBeNull()
        expect(rec.snapshotAt).toBeNull()
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 12.6, 17.4** */
  it('a save with a snapshot replaces it and stamps snapshotAt with the action time', () => {
    fc.assert(
      fc.property(arbEvent, arbSnapshot, arbTime, (rec, snap, now) => {
        const out = applySave(rec, true, now, snap)
        expect(out.saved).toBe(true)
        expect(out.savedAt).toBe(now)
        expect(out.updatedAt).toBe(now)
        expect(out.snapshot).toEqual(snap)
        expect(out.snapshot).not.toBe(snap)
        expect(out.snapshotAt).toBe(now)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 12.6, 17.4** */
  it('a removal, with or without a snapshot argument, keeps snapshot and snapshotAt', () => {
    fc.assert(
      fc.property(arbEvent, arbOptSnapshot, arbTime, (rec, snap, now) => {
        const out = applySave(rec, false, now, snap)
        expect(out.saved).toBe(false)
        expect(out.savedAt).toBe(now)
        expect(out.updatedAt).toBe(now)
        expect(out.snapshot).toEqual(rec.snapshot)
        expect(out.snapshotAt).toBe(rec.snapshotAt)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 12.6, 17.4** */
  it('a save without a snapshot keeps snapshot and snapshotAt', () => {
    fc.assert(
      fc.property(arbEvent, fc.constantFrom(null, undefined), arbTime, (rec, snap, now) => {
        const out = applySave(rec, true, now, snap)
        expect(out.saved).toBe(true)
        expect(out.savedAt).toBe(now)
        expect(out.updatedAt).toBe(now)
        expect(out.snapshot).toEqual(rec.snapshot)
        expect(out.snapshotAt).toBe(rec.snapshotAt)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 12.6, 17.4** */
  it('over any action sequence the snapshot is the last saved one and only saves change it', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.tuple(arbVideoId, arbSource, arbTime).map(([id, src, now]) => newEvent(id, src, now)),
          arbEvent,
        ),
        fc.array(arbAction, { maxLength: 30 }),
        (start, actions) => {
          let rec = start
          let expSnapshot = start.snapshot
          let expSnapshotAt = start.snapshotAt
          for (const a of actions) {
            const prev = rec
            rec = step(rec, a)
            if (a.kind === 'save' && a.snapshot) {
              expSnapshot = a.snapshot
              expSnapshotAt = a.now
            }
            if (a.kind === 'save' || a.kind === 'remove') {
              expect(rec.saved).toBe(a.kind === 'save')
              expect(rec.savedAt).toBe(a.now)
              expect(rec.updatedAt).toBe(a.now)
            } else {
              // Play, progress and skip never touch the saved fields or the snapshot.
              expect(rec.saved).toBe(prev.saved)
              expect(rec.savedAt).toBe(prev.savedAt)
              expect(rec.snapshot).toBe(prev.snapshot)
              expect(rec.snapshotAt).toBe(prev.snapshotAt)
            }
            expect(rec.snapshot).toEqual(expSnapshot)
            expect(rec.snapshotAt).toBe(expSnapshotAt)
          }
        },
      ),
      RUNS,
    )
  })
})
