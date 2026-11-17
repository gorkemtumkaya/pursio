// Carousel arrows and the arrow step (spec: fresh-v2, task 6.2; Req 6.3, 6.4, 12.7).
import { describe, expect, it } from 'vitest'
import { carouselArrows, carouselStep, carouselVisibleCards } from '../../app/utils/fresh-carousel'

describe('carouselArrows', () => {
  // A row of 900 px with 2000 px of cards: 1100 px to scroll.
  it('shows no previous arrow at the start', () => {
    expect(carouselArrows(0, 2000, 900)).toEqual({ prev: false, next: true })
  })

  it('shows no next arrow at the end', () => {
    expect(carouselArrows(1100, 2000, 900)).toEqual({ prev: true, next: false })
  })

  it('shows both in between', () => {
    expect(carouselArrows(400, 2000, 900)).toEqual({ prev: true, next: true })
  })

  it('shows neither when all cards fit', () => {
    expect(carouselArrows(0, 900, 900)).toEqual({ prev: false, next: false })
    expect(carouselArrows(0, 640, 900)).toEqual({ prev: false, next: false })
  })

  it('absorbs fractional scroll positions within 2 px of an end', () => {
    expect(carouselArrows(1.5, 2000, 900).prev).toBe(false)
    expect(carouselArrows(2, 2000, 900).prev).toBe(false)
    expect(carouselArrows(2.5, 2000, 900).prev).toBe(true)
    expect(carouselArrows(1098.4, 2000, 900).next).toBe(false)
    expect(carouselArrows(1098, 2000, 900).next).toBe(false)
    expect(carouselArrows(1097.5, 2000, 900).next).toBe(true)
    // 2 px of overflow or less counts as "fits".
    expect(carouselArrows(0, 902, 900)).toEqual({ prev: false, next: false })
    expect(carouselArrows(0, 903, 900)).toEqual({ prev: false, next: true })
  })
})

describe('carouselStep (AS5): scroll by the fully visible cards, at least 1', () => {
  const GAP = 12

  it('1 fully visible card: about 1.6 cards show on mobile', () => {
    // A 343 px row: the card is (343 - 12) / 1.6 wide.
    const row = 343
    const card = (row - GAP) / 1.6
    expect(carouselVisibleCards(row, card, GAP)).toBe(1)
    expect(carouselStep(row, card, GAP)).toBeCloseTo(card + GAP)
  })

  it('3 fully visible cards: about 3.3 cards show on desktop', () => {
    // A 900 px row: the card is (900 - 36) / 3.3 wide.
    const row = 900
    const card = (row - 3 * GAP) / 3.3
    expect(carouselVisibleCards(row, card, GAP)).toBe(3)
    expect(carouselStep(row, card, GAP)).toBeCloseTo(3 * (card + GAP))
  })

  it('4 fully visible cards', () => {
    expect(carouselVisibleCards(1000, 240, GAP)).toBe(4)
    expect(carouselStep(1000, 240, GAP)).toBe(4 * 252)
    // Exactly 4 cards and 3 gaps fill the row.
    expect(carouselVisibleCards(4 * 240 + 3 * GAP, 240, GAP)).toBe(4)
    // One pixel less and only 3 fit fully.
    expect(carouselVisibleCards(4 * 240 + 3 * GAP - 1, 240, GAP)).toBe(3)
  })

  it('2 fully visible cards between 640 px and 1024 px, where about 2.3 show (AS4)', () => {
    const row = 700
    const card = (row - 2 * GAP) / 2.3
    expect(carouselVisibleCards(row, card, GAP)).toBe(2)
  })

  it('still moves one card when a card is wider than the row', () => {
    expect(carouselVisibleCards(200, 260, GAP)).toBe(1)
    expect(carouselStep(200, 260, GAP)).toBe(272)
  })
})
