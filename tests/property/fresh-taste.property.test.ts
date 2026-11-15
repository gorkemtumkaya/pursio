import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SaveSnapshot } from '../../shared/types/fresh'
import type { VideoEvent, VideoSource } from '../../shared/types/video'
import {
  TASTE_BOUND,
  TASTE_MIN_EVENTS,
  TASTE_STEP,
  tasteAdjustments,
} from '../../shared/utils/fresh-rank'

const RUNS = { numRuns: 300 }

// Small pools so channels and videos collide often.
const CHANNELS = ['UC_a', 'UC_b', 'UC_c', 'UC_d'] as const
const VIDEOS = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'] as const

const arbChannel = fc.constantFrom(...CHANNELS)
const arbSource: fc.Arbitrary<VideoSource> = fc.constantFrom('skill_sheet', 'feed')

const arbSnapshot = (videoId: string): fc.Arbitrary<SaveSnapshot> =>
  fc.record({
    videoId: fc.constant(videoId),
    title: fc.string({ maxLength: 20 }),
    channel: fc.string({ maxLength: 20 }),
    channelId: fc.option(arbChannel, { nil: null }),
    thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
    durationSeconds: fc.integer({ min: 0, max: 10_000 }),
  })

const arbEvent: fc.Arbitrary<VideoEvent> = fc
  .constantFrom(...VIDEOS)
  .chain((videoId) =>
    fc.record({
      videoId: fc.constant(videoId),
      source: arbSource,
      playedAt: fc.option(fc.integer({ min: 0, max: 1e12 }), { nil: null }),
      watchedSeconds: fc.integer({ min: 0, max: 10_000 }),
      finished: fc.boolean(),
      saved: fc.boolean(),
      savedAt: fc.option(fc.integer({ min: 0, max: 1e12 }), { nil: null }),
      skipped: fc.boolean(),
      snap: fc.option(arbSnapshot(videoId), { nil: null }),
      updatedAt: fc.integer({ min: 0, max: 1e12 }),
    }),
  )
  .map(({ snap, ...r }) => ({
    ...r,
    saved: r.savedAt === null ? false : r.saved,
    snapshot: snap,
    snapshotAt: snap === null ? null : (r.savedAt ?? 0),
  }))

/** Channel lookup from the returned cards: some videos are in no card. */
const arbCards: fc.Arbitrary<Map<string, string>> = fc
  .array(fc.tuple(fc.constantFrom(...VIDEOS), arbChannel), { maxLength: VIDEOS.length })
  .map((pairs) => new Map(pairs))

/** Event lists around the 10-record threshold, often enough to trigger 3 feed skips. */
const arbEvents = fc.array(arbEvent, { minLength: 0, maxLength: 40 })

const lookup = (cards: ReadonlyMap<string, string>) => (videoId: string): string | null =>
  cards.get(videoId) ?? null

/** Independent model of Req 9.7, 9.8 and 9.10. */
function expectedTaste(events: readonly VideoEvent[], cards: ReadonlyMap<string, string>, channel: string): number {
  if (events.length < 10) return 0
  let finished = 0
  let feedSkips = 0
  for (const e of events) {
    const c = cards.get(e.videoId) ?? e.snapshot?.channelId ?? null
    if (c !== channel) continue
    if (e.finished) finished++
    if (e.source === 'feed' && e.skipped) feedSkips++
  }
  return (finished >= 1 ? 0.1 : 0) + (feedSkips >= 3 ? -0.1 : 0)
}

const valueOf = (m: ReadonlyMap<string, number>, channel: string): number => m.get(channel) ?? 0

describe('Feature: fresh, Property 26: Taste adjustment', () => {
  it('uses the spec constants', () => {
    expect(TASTE_MIN_EVENTS).toBe(10)
    expect(TASTE_STEP).toBe(0.1)
    expect(TASTE_BOUND).toBe(0.2)
  })

  /** **Validates: Requirements 9.7** */
  it('is 0 for every channel under 10 records', () => {
    fc.assert(
      fc.property(fc.array(arbEvent, { maxLength: 9 }), arbCards, (events, cards) => {
        expect(tasteAdjustments(events, lookup(cards)).size).toBe(0)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.7, 9.8, 9.10** */
  it('gives +0.1 for a Finished record, −0.1 for 3+ feed skips, their sum, else 0', () => {
    fc.assert(
      fc.property(arbEvents, arbCards, (events, cards) => {
        const result = tasteAdjustments(events, lookup(cards))
        for (const channel of CHANNELS) {
          expect(valueOf(result, channel)).toBeCloseTo(expectedTaste(events, cards, channel), 12)
        }
        // No channel outside the resolvable set gets a value.
        for (const key of result.keys()) expect(CHANNELS as readonly string[]).toContain(key)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.9** */
  it('keeps every value within −0.2 to 0.2', () => {
    fc.assert(
      fc.property(arbEvents, arbCards, (events, cards) => {
        for (const value of tasteAdjustments(events, lookup(cards)).values()) {
          expect(value).toBeGreaterThanOrEqual(-0.2)
          expect(value).toBeLessThanOrEqual(0.2)
        }
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.10** */
  it('ignores the skipped flag of skill_sheet records', () => {
    fc.assert(
      fc.property(arbEvents, arbCards, fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }), (events, cards, flips) => {
        const flipped = events.map((e, i) =>
          e.source === 'skill_sheet' && flips[i] ? { ...e, skipped: !e.skipped } : e,
        )
        expect(tasteAdjustments(flipped, lookup(cards))).toEqual(tasteAdjustments(events, lookup(cards)))
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.8** */
  it('uses the Save_Snapshot channel for a video in no returned card, and the card channel first', () => {
    fc.assert(
      fc.property(arbEvents, arbCards, (events, cards) => {
        // With no cards, the snapshot alone decides the channel.
        const none = tasteAdjustments(events, () => null)
        const empty = new Map<string, string>()
        for (const channel of CHANNELS) {
          expect(valueOf(none, channel)).toBeCloseTo(expectedTaste(events, empty, channel), 12)
        }
        // A card channel wins over a different snapshot channel.
        const overridden = events.map((e) => ({
          ...e,
          snapshot: e.snapshot === null ? null : { ...e.snapshot, channelId: 'UC_snapshot_only' },
        }))
        const withCards = tasteAdjustments(overridden, lookup(cards))
        for (const channel of [...CHANNELS, 'UC_snapshot_only']) {
          expect(valueOf(withCards, channel)).toBeCloseTo(expectedTaste(overridden, cards, channel), 12)
        }
      }),
      RUNS,
    )
  })
})
