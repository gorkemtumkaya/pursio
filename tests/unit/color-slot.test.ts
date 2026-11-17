// Color_Slot rules (spec: fresh-v2, task 1.1; Req 9.5, 9.7, 12.8).
import { describe, expect, it } from 'vitest'
import {
  COLOR_SLOT_COUNT,
  fillColorSlots,
  isColorSlot,
  nextColorSlot,
  slotForNewPath,
  type ColorSlot,
} from '../../shared/utils/color-slot'

const rec = (addedAt: number, colorSlot: ColorSlot) => ({ addedAt, colorSlot })

describe('isColorSlot', () => {
  it('accepts the integers 1 to 5 only', () => {
    expect(COLOR_SLOT_COUNT).toBe(5)
    expect([1, 2, 3, 4, 5].every(isColorSlot)).toBe(true)
    for (const value of [0, 6, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined, true, [1], {}]) {
      expect(isColorSlot(value), String(value)).toBe(false)
    }
  })
})

describe('nextColorSlot and slotForNewPath (Req 9.5)', () => {
  it('slots 1, 2, 3 give 4 next', () => {
    expect(slotForNewPath([rec(1, 1), rec(2, 2), rec(3, 3)])).toBe(4)
  })

  it('5 gives 1', () => {
    expect(nextColorSlot(5)).toBe(1)
    expect(slotForNewPath([rec(1, 4), rec(2, 5)])).toBe(1)
  })

  it('no paths give 1', () => {
    expect(nextColorSlot(null)).toBe(1)
    expect(slotForNewPath([])).toBe(1)
  })

  it('follows the latest-created path, wherever it is in the list', () => {
    // Archived paths are in the list like any other, so they count.
    expect(slotForNewPath([rec(30, 2), rec(10, 5), rec(20, 4)])).toBe(3)
    // Equal times: the later one in the list is the latest.
    expect(slotForNewPath([rec(10, 1), rec(10, 3)])).toBe(4)
  })
})

describe('fillColorSlots (Req 9.7)', () => {
  it('gives paths without a slot 1, 2, 3, 4, 5, 1 in creation order', () => {
    const records = [10, 20, 30, 40, 50, 60].map((addedAt) => ({ addedAt, colorSlot: null }))
    expect(fillColorSlots(records)).toEqual([1, 2, 3, 4, 5, 1])
  })

  it('uses creation order, not list order, and returns the slots by list index', () => {
    const records = [30, 10, 20].map((addedAt) => ({ addedAt, colorSlot: null }))
    expect(fillColorSlots(records)).toEqual([3, 1, 2])
  })

  it('keeps a stored slot and continues after it', () => {
    expect(
      fillColorSlots([
        { addedAt: 1, colorSlot: null },
        { addedAt: 2, colorSlot: 4 },
        { addedAt: 3, colorSlot: null },
        { addedAt: 4, colorSlot: null },
        { addedAt: 5, colorSlot: 2 },
        { addedAt: 6, colorSlot: null },
      ]),
    ).toEqual([1, 4, 5, 1, 2, 3])
  })

  it('gives the same slots on every call and changes nothing', () => {
    const records = [
      { addedAt: 5, colorSlot: null },
      { addedAt: 5, colorSlot: null },
      { addedAt: 1, colorSlot: 3 as ColorSlot },
    ]
    const copy = structuredClone(records)
    expect(fillColorSlots(records)).toEqual([4, 5, 3])
    expect(fillColorSlots(records)).toEqual([4, 5, 3])
    expect(records).toEqual(copy)
    expect(fillColorSlots([])).toEqual([])
  })
})
