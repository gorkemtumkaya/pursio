// Feature: fresh-v2, Property 10: Carousel arrows
// For any `scrollWidth ≥ clientWidth > 0` and `0 ≤ scrollLeft ≤ scrollWidth − clientWidth`,
// `prev` is shown exactly when `scrollLeft > 2` and `next` exactly when
// `scrollLeft + clientWidth < scrollWidth − 2`. Neither is shown when
// `scrollWidth − clientWidth ≤ 2`. `carouselStep` is at least one card width and never more
// than `clientWidth + gap`.
// Validates: Requirements 6.3, 6.4, 12.7
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CAROUSEL_EDGE_PX, carouselArrows, carouselStep, carouselVisibleCards } from '../../app/utils/fresh-carousel'

const RUNS = { numRuns: 500 }

/**
 * A scroll state: a client width, how far the content overflows it, and a position in that
 * range. Widths are whole pixels and positions quarter pixels, as browsers report them, so the
 * sums are exact and the 2 px edge is hit often.
 */
const arbScroll = fc
  .record({
    clientWidth: fc.integer({ min: 1, max: 3000 }),
    overflowQuarters: fc.oneof(fc.integer({ min: 0, max: 16 }), fc.integer({ min: 0, max: 24000 })),
    position: fc.oneof(fc.constantFrom(0, 1), fc.double({ min: 0, max: 1, noNaN: true })),
    nearEdge: fc.option(fc.integer({ min: 0, max: 12 }), { nil: null }),
    fromEnd: fc.boolean(),
  })
  .map(({ clientWidth, overflowQuarters, position, nearEdge, fromEnd }) => {
    const overflow = overflowQuarters / 4
    // Either a random position, or one within 3 px of the start or the end.
    let quarters = Math.round(overflowQuarters * position)
    if (nearEdge !== null) quarters = fromEnd ? Math.max(0, overflowQuarters - nearEdge) : Math.min(overflowQuarters, nearEdge)
    return { clientWidth, scrollWidth: clientWidth + overflow, scrollLeft: quarters / 4, overflow }
  })

describe('Feature: fresh-v2, Property 10: Carousel arrows', () => {
  it('shows each arrow exactly while there is more than 2 px to scroll in its direction', () => {
    expect(CAROUSEL_EDGE_PX).toBe(2)
    fc.assert(
      fc.property(arbScroll, ({ scrollLeft, scrollWidth, clientWidth, overflow }) => {
        const arrows = carouselArrows(scrollLeft, scrollWidth, clientWidth)
        expect(arrows.prev).toBe(scrollLeft > 2)
        expect(arrows.next).toBe(scrollLeft + clientWidth < scrollWidth - 2)
        // Everything fits: no arrow at all.
        if (scrollWidth - clientWidth <= 2) expect(arrows).toEqual({ prev: false, next: false })
        // At the start no "previous"; at the end no "next".
        expect(carouselArrows(0, scrollWidth, clientWidth).prev).toBe(false)
        expect(carouselArrows(overflow, scrollWidth, clientWidth).next).toBe(false)
        // With room on both sides, both show.
        if (scrollLeft > 2 && overflow - scrollLeft > 2) expect(arrows).toEqual({ prev: true, next: true })
      }),
      RUNS,
    )
  })

  it('steps by the fully visible cards: at least one card, never past the visible row', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 0, max: 48 }),
        fc.double({ min: 0.05, max: 1, noNaN: true }),
        (clientWidth, gap, fraction) => {
          // A card is never wider than the row.
          const cardWidth = Math.max(1, clientWidth * fraction)
          const step = carouselStep(clientWidth, cardWidth, gap)
          const cards = carouselVisibleCards(clientWidth, cardWidth, gap)
          expect(Number.isInteger(cards)).toBe(true)
          expect(cards).toBeGreaterThanOrEqual(1)
          expect(step).toBeGreaterThanOrEqual(cardWidth)
          expect(step).toBeLessThanOrEqual(clientWidth + gap + 1e-6)
          // The step is a whole number of cards with their gaps, so it lands on a snap point.
          expect(step).toBeCloseTo(cards * (cardWidth + gap), 6)
          // `cards` cards fit fully, and one more would not.
          expect(cards * cardWidth + (cards - 1) * gap).toBeLessThanOrEqual(clientWidth + 1e-6)
          expect((cards + 1) * cardWidth + cards * gap).toBeGreaterThan(clientWidth - 1e-6)
        },
      ),
      RUNS,
    )
  })

  it('still steps by one card when the measurements are unusable', () => {
    expect(carouselVisibleCards(0, 0, 0)).toBe(1)
    expect(carouselVisibleCards(Number.NaN, 100, 12)).toBe(1)
    expect(carouselVisibleCards(50, 200, 12)).toBe(1)
    expect(carouselStep(50, 200, 12)).toBe(212)
  })
})
