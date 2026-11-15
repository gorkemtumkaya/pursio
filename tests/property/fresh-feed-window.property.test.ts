// Feature: fresh, Property 12: Feed window
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { ENTRIES_PER_FEED, FEED_WINDOW_S, keepEntries } from '../../server/utils/fresh/feed-window'

const RUNS = { numRuns: 300 }
const WINDOW_MS = FEED_WINDOW_S * 1000
const START_MS = 1_800_000_000_000
const CHANNELS = ['UCaaaaaaaaaaaaaaaaaaaaaa', 'UCbbbbbbbbbbbbbbbbbbbbbb'] as const

/** Times at the window bounds on purpose: exactly the lower bound, plus 1 ms and 1 s, the check start, plus 1. */
function arbTime(lower: number, start: number): fc.Arbitrary<number> {
  return fc.oneof(
    fc.constantFrom(lower, lower + 1, lower + 1000, lower - 1, start, start - 1, start + 1, start + 1000),
    fc.integer({ min: lower - 3600_000, max: start + 3600_000 }),
    fc.integer({ min: start - 2 * WINDOW_MS, max: start }),
  )
}

const arbCase = fc
  .record({
    channelId: fc.constantFrom(...CHANNELS),
    // Last check time: none, inside the window, before it, at the start, or later than the start.
    lastChecked: fc.oneof(
      fc.constant<number | null>(null),
      fc.integer({ min: START_MS - WINDOW_MS, max: START_MS }),
      fc.constantFrom(START_MS - WINDOW_MS - 1, START_MS - WINDOW_MS, START_MS - WINDOW_MS + 1, START_MS, START_MS + 5),
      fc.integer({ min: START_MS - 3 * WINDOW_MS, max: START_MS - WINDOW_MS }),
    ),
  })
  .chain(({ channelId, lastChecked }) => {
    const lower = Math.max(lastChecked ?? Number.NEGATIVE_INFINITY, START_MS - WINDOW_MS)
    const entry = fc.record({
      videoId: fc.stringMatching(/^[A-Za-z0-9_-]{11}$/),
      title: fc.string({ maxLength: 10 }),
      // Mostly the source's own channel, sometimes another one.
      channelId: fc.oneof({ weight: 4, arbitrary: fc.constant(channelId) }, { weight: 1, arbitrary: fc.constantFrom(...CHANNELS) }),
      publishedMs: arbTime(Number.isFinite(lower) ? lower : START_MS - WINDOW_MS, START_MS),
    })
    return fc.record({
      src: fc.constant({ channelId, lastCheckedMs: lastChecked }),
      entries: fc.uniqueArray(entry, { maxLength: 30, selector: (e) => e.videoId }),
    })
  })

describe('Feature: fresh, Property 12: Feed window', () => {
  it('keeps exactly the newest 15 entries of the channel in (max(last check, start - 7 d), start]', () => {
    /** **Validates: Requirements 4.2, 4.3** */
    fc.assert(
      fc.property(arbCase, ({ src, entries }) => {
        const kept = keepEntries(entries, src, START_MS)
        // Req 4.3: with no last check time the lower bound is 7 days before the check start.
        const lower = Math.max(src.lastCheckedMs ?? Number.NEGATIVE_INFINITY, START_MS - WINDOW_MS)
        const eligible = entries.filter(
          (e: FeedEntry) => e.channelId === src.channelId && e.publishedMs > lower && e.publishedMs <= START_MS,
        )
        expect(kept.length).toBe(Math.min(ENTRIES_PER_FEED, eligible.length))
        // Every kept entry is an eligible input entry, unchanged.
        for (const e of kept) expect(eligible).toContainEqual(e)
        expect(new Set(kept.map((e) => e.videoId)).size).toBe(kept.length)
        // Newest first: published desc, then id asc.
        for (let i = 1; i < kept.length; i++) {
          const a = kept[i - 1]!
          const b = kept[i]!
          expect(a.publishedMs > b.publishedMs || (a.publishedMs === b.publishedMs && compareCodePoints(a.videoId, b.videoId) < 0)).toBe(true)
        }
        // The newest: no eligible entry left out is newer than a kept one.
        const keptIds = new Set(kept.map((e) => e.videoId))
        const oldestKept = kept.at(-1)
        for (const e of eligible) {
          if (keptIds.has(e.videoId)) continue
          expect(oldestKept).toBeDefined()
          expect(e.publishedMs).toBeLessThanOrEqual(oldestKept!.publishedMs)
        }
      }),
      RUNS,
    )
  })
})
