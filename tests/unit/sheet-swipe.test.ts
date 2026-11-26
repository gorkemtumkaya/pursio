import { describe, expect, it } from 'vitest'
import {
  CLOSE_DISTANCE,
  FLICK_MIN_DISTANCE,
  FLICK_VELOCITY,
  SWIPE_SLOP,
  closeDistance,
  shouldCloseSheet,
  swipeAxis,
} from '~/utils/sheet-swipe'

describe('swipeAxis', () => {
  it('waits while the finger is inside the slop', () => {
    expect(swipeAxis(0, 0)).toBeNull()
    expect(swipeAxis(SWIPE_SLOP - 1, SWIPE_SLOP - 1)).toBeNull()
  })

  it('takes a mainly downward move as a drag down', () => {
    expect(swipeAxis(0, SWIPE_SLOP)).toBe('down')
    expect(swipeAxis(-5, 20)).toBe('down')
  })

  it('leaves upward and sideways moves to the content', () => {
    expect(swipeAxis(0, -SWIPE_SLOP)).toBe('other')
    expect(swipeAxis(20, 5)).toBe('other')
    expect(swipeAxis(-20, 20)).toBe('other')
  })
})

describe('closeDistance', () => {
  it('is CLOSE_DISTANCE on a tall sheet and a third of a short one', () => {
    expect(closeDistance(800)).toBe(CLOSE_DISTANCE)
    expect(closeDistance(300)).toBe(100)
  })

  it('never drops under the flick distance', () => {
    expect(closeDistance(30)).toBe(FLICK_MIN_DISTANCE)
  })
})

describe('shouldCloseSheet', () => {
  const height = 600

  it('closes after a long enough drag, even when slow', () => {
    expect(shouldCloseSheet({ offset: CLOSE_DISTANCE, velocity: 0, height })).toBe(true)
  })

  it('springs back after a short slow drag', () => {
    expect(shouldCloseSheet({ offset: CLOSE_DISTANCE - 1, velocity: 0.1, height })).toBe(false)
  })

  it('closes on a quick flick past the flick distance', () => {
    expect(shouldCloseSheet({ offset: FLICK_MIN_DISTANCE, velocity: FLICK_VELOCITY, height })).toBe(true)
  })

  it('ignores a fast twitch that barely moved', () => {
    expect(shouldCloseSheet({ offset: FLICK_MIN_DISTANCE - 1, velocity: 2, height })).toBe(false)
  })

  it('never closes when the sheet is back at the top', () => {
    expect(shouldCloseSheet({ offset: 0, velocity: 2, height })).toBe(false)
  })
})
