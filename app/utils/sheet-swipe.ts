/**
 * Decisions for the swipe down that closes a Bottom_Sheet. Pure, so they can be tested without a
 * DOM; `useSheetSwipe` feeds them touch positions.
 */

/** How far (px) a finger moves before the gesture counts as a drag in some direction. */
export const SWIPE_SLOP = 8

/** A drag this far down (px) closes the sheet, or less on a short sheet (see `closeDistance`). */
export const CLOSE_DISTANCE = 120

/** A flick at least this fast (px per ms) closes the sheet... */
export const FLICK_VELOCITY = 0.5

/** ...once it has moved at least this far (px), so a quick tap-and-twitch does not close it. */
export const FLICK_MIN_DISTANCE = 24

/** Direction of a gesture once it passed the slop: a drag down, anything else, or not yet known. */
export type SwipeAxis = 'down' | 'other' | null

/** `dx`, `dy`: finger movement since the touch started; positive `dy` is down. */
export function swipeAxis(dx: number, dy: number): SwipeAxis {
  if (Math.abs(dx) < SWIPE_SLOP && Math.abs(dy) < SWIPE_SLOP) return null
  return dy > 0 && dy > Math.abs(dx) ? 'down' : 'other'
}

/** Drag distance that closes a sheet `height` px tall: CLOSE_DISTANCE, or a third of a short sheet. */
export function closeDistance(height: number): number {
  return Math.min(CLOSE_DISTANCE, Math.max(FLICK_MIN_DISTANCE, height / 3))
}

export interface SwipeRelease {
  /** How far down the sheet was dragged (px) when the finger lifted. */
  offset: number
  /** Downward speed at release (px per ms); 0 when the finger stopped before lifting. */
  velocity: number
  /** Height of the sheet (px). */
  height: number
}

/** True when the sheet closes on release; false when it springs back. */
export function shouldCloseSheet({ offset, velocity, height }: SwipeRelease): boolean {
  if (offset <= 0) return false
  if (offset >= closeDistance(height)) return true
  return velocity >= FLICK_VELOCITY && offset >= FLICK_MIN_DISTANCE
}
