/**
 * Pure Carousel helpers (spec: fresh-v2, Req 6.3, 6.4). The component reads the scroll
 * container and passes plain numbers, so the rules are tested without a DOM.
 */

/** Tolerance that absorbs fractional scroll positions. */
export const CAROUSEL_EDGE_PX = 2

/** Which arrows show: none when everything fits. */
export function carouselArrows(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
): { prev: boolean; next: boolean } {
  return {
    prev: scrollLeft > CAROUSEL_EDGE_PX,
    next: scrollLeft + clientWidth < scrollWidth - CAROUSEL_EDGE_PX,
  }
}

/** Fully visible cards, at least 1 (AS5). */
export function carouselVisibleCards(clientWidth: number, cardWidth: number, gap: number): number {
  const span = cardWidth + gap
  if (!(span > 0) || !Number.isFinite(span) || !Number.isFinite(clientWidth)) return 1
  return Math.max(1, Math.floor((clientWidth + gap) / span))
}

/** Pixels for one arrow press: max(1, floor((clientWidth + gap) / (cardWidth + gap))) cards. */
export function carouselStep(clientWidth: number, cardWidth: number, gap: number): number {
  return carouselVisibleCards(clientWidth, cardWidth, gap) * (cardWidth + gap)
}
