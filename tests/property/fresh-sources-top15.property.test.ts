import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  SOURCES_PER_KEY,
  type ChannelSourceRow,
  rankChannelSources,
} from '../../server/utils/fresh/sources'

const RUNS = { numRuns: 300 }

// Ids where code point order and UTF-16 order disagree: U+FF61 and U+E000 sort
// before U+1F600 by code point, but after it by UTF-16 unit (0xD83D).
const TRICKY_IDS = ['\uFF61', '\uE000', '\u{1F600}', '\u{10000}', 'a\uFFFF', 'a\u{1F600}', 'UCb', 'UCB', 'é']

const arbChannelId = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...TRICKY_IDS) },
  { weight: 3, arbitrary: fc.constantFrom(...Array.from({ length: 25 }, (_, i) => `UC${String(i).padStart(2, '0')}`)) },
  { weight: 2, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 6 }) },
)

// Small ranges so ties on count and on latest qualifying time occur often.
const arbRowFields = fc.record({
  channelName: fc.string({ maxLength: 6 }),
  qualifyingCount: fc.oneof(fc.integer({ min: 1, max: 3 }), fc.integer({ min: 1, max: 1000 })),
  latestQualifyingMs: fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2_000_000_000_000 })),
  lastCheckedMs: fc.option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: null }),
})

const arbRows: fc.Arbitrary<ChannelSourceRow[]> = fc
  .uniqueArray(arbChannelId, { maxLength: 40 })
  .chain((ids) =>
    fc.tuple(...ids.map(() => arbRowFields)).map((fields) =>
      fields.map((f, i) => ({ ...f, channelId: ids[i] as string })),
    ),
  )

/** Code point order, written independently of the module under test. */
function codePointOrder(a: string, b: string): number {
  const pa = Array.from(a, (ch) => ch.codePointAt(0) ?? 0)
  const pb = Array.from(b, (ch) => ch.codePointAt(0) ?? 0)
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const d = (pa[i] as number) - (pb[i] as number)
    if (d !== 0) return d
  }
  return pa.length - pb.length
}

/** Negative when a must rank before b. */
function rankOrder(a: ChannelSourceRow, b: ChannelSourceRow): number {
  if (a.qualifyingCount !== b.qualifyingCount) return b.qualifyingCount - a.qualifyingCount
  if (a.latestQualifyingMs !== b.latestQualifyingMs) return b.latestQualifyingMs - a.latestQualifyingMs
  return codePointOrder(a.channelId, b.channelId)
}

describe('fresh Channel_Source top-15 ranking', () => {
  // Feature: fresh, Property 2: Channel_Source top-15 ranking
  // **Validates: Requirements 1.5**
  it('rankChannelSources keeps the 15 best rows in order, whatever the input order', () => {
    fc.assert(
      fc.property(
        arbRows.chain((rows) => fc.tuple(fc.constant(rows), fc.shuffledSubarray(rows, { minLength: rows.length }))),
        ([rows, shuffled]) => {
          const result = rankChannelSources(rows)

          expect(SOURCES_PER_KEY).toBe(15)
          expect(result.length).toBe(Math.min(rows.length, 15))

          // Sorted: every adjacent pair is strictly in rank order (ids are unique).
          for (let i = 1; i < result.length; i++) {
            expect(rankOrder(result[i - 1] as ChannelSourceRow, result[i] as ChannelSourceRow)).toBeLessThan(0)
          }

          // Every kept row ranks before every dropped row; rows are unchanged.
          const keptIds = new Set(result.map((r) => r.channelId))
          const dropped = rows.filter((r) => !keptIds.has(r.channelId))
          expect(keptIds.size).toBe(result.length)
          for (const kept of result) {
            expect(rows).toContainEqual(kept)
            for (const d of dropped) expect(rankOrder(kept, d)).toBeLessThan(0)
          }

          // Same result for any permutation of the input.
          expect(rankChannelSources(shuffled)).toEqual(result)
        },
      ),
      RUNS,
    )
  })

  it('breaks full ties by code point order, not UTF-16 order', () => {
    const row = (channelId: string): ChannelSourceRow => ({
      channelId,
      channelName: 'n',
      qualifyingCount: 2,
      latestQualifyingMs: 100,
      lastCheckedMs: null,
    })
    const ids = rankChannelSources([row('\u{1F600}'), row('\uFF61'), row('\uE000')]).map((r) => r.channelId)
    expect(ids).toEqual(['\uE000', '\uFF61', '\u{1F600}'])
  })
})
