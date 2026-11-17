// Feature: fresh-v2, Property 8: Slot read and write round trip
// For any stored library where each entry's `colorSlot` is valid, missing or invalid, parsing
// twice gives the same slots. Every valid stored slot is kept. Missing ones follow
// `fillColorSlots` in `addedAt` order. Serializing and parsing again gives the same slots.
// Validates: Requirements 9.7, 12.8
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillTree } from '../../shared/types/skill-tree'
import { fillColorSlots, isColorSlot, type ColorSlot } from '../../shared/utils/color-slot'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { buildCloudPaths } from '../../app/utils/cloud-rows'
import { parseHobbyLibrary, serializeHobbyLibrary } from '../../app/utils/hobby-store'

const RUNS = { numRuns: 200 }

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const base: SkillTree = loaded.value

/** A stored `colorSlot`: valid, missing (`undefined`), or one of the values that are not slots. */
const arbStoredSlot: fc.Arbitrary<unknown> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom<ColorSlot>(1, 2, 3, 4, 5) },
  { weight: 3, arbitrary: fc.constant(undefined) },
  { weight: 2, arbitrary: fc.constantFrom<unknown>(0, 6, -1, 2.5, '3', null, true, Number.NaN, [1], { slot: 1 }) },
)

interface Stored {
  name: string
  addedAt: number
  colorSlot: unknown
}

/** 0 to 9 entries with distinct hobbies; `addedAt` values repeat, so the index tie-break counts. */
const arbStored: fc.Arbitrary<Stored[]> = fc.uniqueArray(
  fc.record({
    name: fc.integer({ min: 0, max: 40 }).map((n) => `Hobby ${n}`),
    addedAt: fc.integer({ min: 0, max: 6 }),
    colorSlot: arbStoredSlot,
  }),
  { maxLength: 9, selector: (e) => e.name },
)

/**
 * The slots Requirement 9.7 asks for, written without `fillColorSlots`: walk the entries in
 * creation order (`addedAt`, then position); a valid stored slot stays, a missing one is the
 * slot after the entry before it, starting at 1.
 */
function expectedSlots(entries: readonly Stored[]): ColorSlot[] {
  const order = entries.map((_, i) => i).sort((a, b) => entries[a]!.addedAt - entries[b]!.addedAt || a - b)
  const out: ColorSlot[] = []
  let prev: number | null = null
  for (const index of order) {
    const stored = entries[index]!.colorSlot
    const valid = typeof stored === 'number' && [1, 2, 3, 4, 5].includes(stored)
    const slot: number = valid ? (stored as number) : prev === null ? 1 : (prev % 5) + 1
    out[index] = slot as ColorSlot
    prev = slot
  }
  return out
}

function rawLibrary(entries: readonly Stored[]): string {
  return JSON.stringify({
    hobbies: entries.map(({ name, addedAt, colorSlot }) => ({
      id: name.toLowerCase(),
      tree: { ...base, hobby: name },
      model: 'm',
      addedAt,
      ...(colorSlot === undefined ? {} : { colorSlot }),
    })),
    activeId: null,
  })
}

describe('Feature: fresh-v2, Property 8: Slot read and write round trip', () => {
  it('local Hobby_Library: stable derived slots on every read, kept by a write', () => {
    fc.assert(
      fc.property(arbStored, (entries) => {
        const raw = rawLibrary(entries)
        const first = parseHobbyLibrary(raw).library
        const second = parseHobbyLibrary(raw).library
        const slots = first.hobbies.map((h) => h.colorSlot)

        expect(first.hobbies).toHaveLength(entries.length)
        for (const slot of slots) expect(isColorSlot(slot)).toBe(true)
        // The same slots on every read, with no write in between (Req 9.7).
        expect(second.hobbies.map((h) => h.colorSlot)).toEqual(slots)
        // Valid stored slots are kept; the others follow creation order.
        expect(slots).toEqual(expectedSlots(entries))
        entries.forEach((entry, i) => {
          if (isColorSlot(entry.colorSlot)) expect(slots[i]).toBe(entry.colorSlot)
        })
        expect(slots).toEqual(
          fillColorSlots(entries.map((e) => ({ addedAt: e.addedAt, colorSlot: isColorSlot(e.colorSlot) ? e.colorSlot : null }))),
        )

        // Serializing writes every slot; parsing that gives the same slots, and again.
        const written = serializeHobbyLibrary(first)
        const reread = parseHobbyLibrary(written).library
        expect(reread.hobbies.map((h) => h.colorSlot)).toEqual(slots)
        expect(reread).toEqual(first)
        expect(serializeHobbyLibrary(reread)).toBe(written)
        for (const stored of (JSON.parse(written) as { hobbies: { colorSlot: unknown }[] }).hobbies) {
          expect(isColorSlot(stored.colorSlot)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('cloud rows: the same rule for rows read without a slot', () => {
    fc.assert(
      fc.property(arbStored, (entries) => {
        const rows = entries.map(({ name, addedAt, colorSlot }, i) => ({
          id: `row-${i}`,
          level: 'new',
          tree: { ...base, hobby: name },
          model: 'm',
          archived: i % 2 === 0,
          created_at: new Date(Date.UTC(2026, 0, 1) + addedAt * 1000).toISOString(),
          ...(colorSlot === undefined ? {} : { color_slot: typeof colorSlot === 'number' && Number.isNaN(colorSlot) ? null : colorSlot }),
        }))
        const paths = buildCloudPaths(rows, [])
        expect(paths).toHaveLength(entries.length)
        expect(paths.map((p) => p.record.colorSlot)).toEqual(expectedSlots(entries))
        expect(buildCloudPaths(rows, []).map((p) => p.record.colorSlot)).toEqual(paths.map((p) => p.record.colorSlot))
      }),
      RUNS,
    )
  })
})
