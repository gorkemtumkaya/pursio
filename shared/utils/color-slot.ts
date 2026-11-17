/**
 * Color_Slot rules (spec: fresh-v2, Req 9.5 to 9.8). A slot is an integer from 1 to 5 stored
 * with each path; it picks the path's hobby colors. Pure, shared by the Client and the Server.
 */

export const COLOR_SLOT_COUNT = 5
export type ColorSlot = 1 | 2 | 3 | 4 | 5

export function isColorSlot(value: unknown): value is ColorSlot {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= COLOR_SLOT_COUNT
}

/** Slot after `prev`, 5 → 1; null (no earlier path) → 1. */
export function nextColorSlot(prev: ColorSlot | null): ColorSlot {
  if (prev === null) return 1
  return ((prev % COLOR_SLOT_COUNT) + 1) as ColorSlot
}

/** Indexes in creation order: `addedAt` ascending, then input index. */
function creationOrder(records: readonly { addedAt: number }[]): number[] {
  return records
    .map((_, index) => index)
    .sort((a, b) => {
      const ta = records[a]!.addedAt
      const tb = records[b]!.addedAt
      if (ta !== tb) return ta < tb ? -1 : 1
      return a - b
    })
}

/**
 * Fills missing slots in creation order: each record without a slot gets
 * nextColorSlot(slot of the record created just before it). Records keep a valid
 * stored slot. Order: addedAt ascending, then input index. Returns slots by index.
 */
export function fillColorSlots(
  records: readonly { addedAt: number; colorSlot: ColorSlot | null }[],
): ColorSlot[] {
  const slots = new Array<ColorSlot>(records.length)
  let prev: ColorSlot | null = null
  for (const index of creationOrder(records)) {
    const stored = records[index]!.colorSlot
    const slot: ColorSlot = isColorSlot(stored) ? stored : nextColorSlot(prev)
    slots[index] = slot
    prev = slot
  }
  return slots
}

/** Slot for a new path: nextColorSlot(slot of the latest-created record), archived ones included. */
export function slotForNewPath(records: readonly { addedAt: number; colorSlot: ColorSlot }[]): ColorSlot {
  const last = creationOrder(records).at(-1)
  return nextColorSlot(last === undefined ? null : records[last]!.colorSlot)
}
