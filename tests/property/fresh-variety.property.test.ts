import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { arrangeVariety, VARIETY_MAX_PER_CHANNEL, VARIETY_WINDOW } from '../../shared/utils/fresh-rank'

const RUNS = { numRuns: 500 }

/** `rank` is the card's index in ranked (input) order. */
interface Card { rank: number; channel: string | null }

const channelOf = (card: Card): string | null => card.channel

/**
 * A section of 0 to 24 cards from 1 to 10 channels, some with no channel id.
 * Few channels make conflicts and cards placed at the end common.
 */
const arbSection: fc.Arbitrary<Card[]> = fc.integer({ min: 1, max: 10 }).chain(channelCount =>
  fc.array(
    fc.option(fc.integer({ min: 0, max: channelCount - 1 }).map(n => `UC${n}`), { freq: 5 }),
    { maxLength: 24 },
  ).map(channels => channels.map((channel, rank) => ({ rank, channel }))),
)

/** Whether a card of `channel` placed after `placed` keeps every window ending at it within the rule. */
function fitsAfter(placed: readonly Card[], channel: string | null): boolean {
  if (channel === null) return true
  const recent = placed.slice(Math.max(0, placed.length - (VARIETY_WINDOW - 1)))
  return recent.filter(c => c.channel === channel).length < VARIETY_MAX_PER_CHANNEL
}

describe('fresh variety', () => {
  // Feature: fresh, Property 27: Variety rearrangement
  // **Validates: Requirements 9.13, 9.14, 19.10**
  it('keeps the cards, keeps every window before tailStart within the rule, and moves cards minimally', () => {
    fc.assert(
      fc.property(arbSection, (section) => {
        const input = section.slice()
        const { cards, tailStart } = arrangeVariety(section, channelOf)

        // Input is not mutated.
        expect(section).toEqual(input)

        // Same multiset of cards (each card is distinct by rank), nothing removed (Req 9.14).
        expect(cards.length).toBe(section.length)
        expect(cards.map(c => c.rank).sort((a, b) => a - b)).toEqual(section.map(c => c.rank))
        for (const card of cards) expect(card).toBe(section[card.rank])
        expect(tailStart).toBeGreaterThanOrEqual(0)
        expect(tailStart).toBeLessThanOrEqual(cards.length)

        // Every 6 consecutive cards fully before tailStart hold at most 2 of one channel (Req 9.13).
        for (let start = 0; start + VARIETY_WINDOW <= tailStart; start++) {
          const counts = new Map<string, number>()
          for (const card of cards.slice(start, start + VARIETY_WINDOW)) {
            if (card.channel === null) continue
            counts.set(card.channel, (counts.get(card.channel) ?? 0) + 1)
          }
          for (const count of counts.values()) expect(count).toBeLessThanOrEqual(VARIETY_MAX_PER_CHANNEL)
        }

        // Moved cards land at the first later position where they fit; all other cards keep their
        // ranked order (Req 9.13). Equivalently, each position before tailStart holds the
        // earliest-ranked remaining card that fits there.
        const remaining = new Set(section.map(c => c.rank))
        for (let p = 0; p < tailStart; p++) {
          const placed = cards.slice(0, p)
          const expected = section.find(c => remaining.has(c.rank) && fitsAfter(placed, c.channel))
          expect(cards[p]).toBe(expected)
          remaining.delete(cards[p]!.rank)
        }

        // Cards from tailStart on have no position left that keeps the rule, and are in ranked order (Req 9.14).
        const head = cards.slice(0, tailStart)
        const tail = cards.slice(tailStart)
        for (const card of tail) {
          expect(card.channel).not.toBeNull()
          expect(fitsAfter(head, card.channel)).toBe(false)
        }
        for (let i = 1; i < tail.length; i++) expect(tail[i]!.rank).toBeGreaterThan(tail[i - 1]!.rank)
      }),
      RUNS,
    )
  })

  it('places cards that never fit at the end in ranked order', () => {
    const section: Card[] = ['A', 'A', 'A', 'B', 'A'].map((channel, rank) => ({ rank, channel }))
    const { cards, tailStart } = arrangeVariety(section, channelOf)
    expect(cards.map(c => c.rank)).toEqual([0, 1, 3, 2, 4])
    expect(tailStart).toBe(3)
  })
})
