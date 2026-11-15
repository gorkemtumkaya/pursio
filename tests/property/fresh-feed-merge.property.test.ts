// Feature: fresh, Property 13: Feed merge
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { mergeEntries } from '../../server/utils/fresh/feed-window'

const RUNS = { numRuns: 300 }
const START_MS = 1_800_000_000_000
/** Channel ids that differ in case and length, so code point order matters. */
const CHANNELS = ['UCa', 'UCb', 'UCB', 'UC_', 'UCaa', 'UC-z', 'UCzz', 'UCé'] as const
/** A small id set so the same video id shows up in several feeds. */
const VIDEO_IDS = Array.from({ length: 20 }, (_, i) => `vid${String(i).padStart(8, '0')}`)

/** 0 to 15 feeds, one channel each (unique), 0 to 15 entries per feed with unique ids. */
const arbFeeds: fc.Arbitrary<FeedEntry[][]> = fc
  .uniqueArray(fc.constantFrom(...CHANNELS), { maxLength: 15 })
  .chain((channels) =>
    fc.tuple(
      ...channels.map((channelId) =>
        fc.uniqueArray(
          fc.record({
            videoId: fc.constantFrom(...VIDEO_IDS),
            title: fc.string({ maxLength: 8 }),
            channelId: fc.constant(channelId),
            publishedMs: fc.oneof(fc.constantFrom(START_MS, START_MS - 1000), fc.integer({ min: START_MS - 604_800_000, max: START_MS })),
          }),
          { maxLength: 15, selector: (e) => e.videoId },
        ),
      ),
    ),
  )

const arbStored: fc.Arbitrary<Set<string>> = fc.subarray(VIDEO_IDS, { maxLength: 8 }).map((ids) => new Set(ids))

describe('Feature: fresh, Property 13: Feed merge', () => {
  it('keeps each unstored video id once, from the lowest channel id', () => {
    /** **Validates: Requirements 4.6** */
    fc.assert(
      fc.property(arbFeeds, arbStored, (feeds, stored) => {
        const merged = mergeEntries(feeds, stored)
        const ids = merged.map((e) => e.videoId)
        // Each video id at most once, never a stored one.
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) expect(stored.has(id)).toBe(false)
        // Every unstored input id appears.
        const all = feeds.flat()
        const wanted = new Set(all.map((e) => e.videoId).filter((id) => !stored.has(id)))
        expect(new Set(ids)).toEqual(wanted)
        // For an id in several feeds, the entry of the lowest channel id (code point order).
        for (const e of merged) {
          const candidates = all.filter((c) => c.videoId === e.videoId)
          const lowest = candidates.reduce((a, b) => (compareCodePoints(b.channelId, a.channelId) < 0 ? b : a))
          expect(e).toEqual(lowest)
        }
        // Design order: published desc, then video id asc.
        for (let i = 1; i < merged.length; i++) {
          const a = merged[i - 1]!
          const b = merged[i]!
          expect(a.publishedMs > b.publishedMs || (a.publishedMs === b.publishedMs && compareCodePoints(a.videoId, b.videoId) < 0)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('does not depend on the order of the feeds', () => {
    /** **Validates: Requirements 4.6** */
    const arbCase = fc.record({ feeds: arbFeeds, stored: arbStored }).chain(({ feeds, stored }) =>
      fc.shuffledSubarray(feeds, { minLength: feeds.length, maxLength: feeds.length }).map((shuffled) => ({ feeds, shuffled, stored })),
    )
    fc.assert(
      fc.property(arbCase, ({ feeds, shuffled, stored }) => {
        expect(mergeEntries(shuffled, stored)).toEqual(mergeEntries(feeds, stored))
      }),
      RUNS,
    )
  })
})
