// Feature: fresh-v2, Property 2: Chip set
// For any path count from 0 to 6, demo flag and requested chip (including unknown path ids),
// the chips are "All hobbies", then the Hobby_Chips only when there are 2 or more paths, then
// "Saved" unless in demo. Exactly one chip is selected. An unknown request selects
// "All hobbies". No chip has the kind `current`.
// Validates: Requirements 2.1, 2.5, 2.6, 2.9, 11.1, 12.2
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildFreshView, type FilterChip, type FreshViewInput } from '../../shared/utils/fresh-view'
import { arbMutes, arbPathsOf, expectedChip, expectedPathOrder, makeResponse } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

const arbInput: fc.Arbitrary<FreshViewInput> = arbPathsOf(0, 6).chain((paths) =>
  fc.record({
    response: fc.constant(makeResponse({ paths })),
    chip: fc.oneof(
      fc.constant<FilterChip>({ kind: 'all' }),
      fc.constant<FilterChip>({ kind: 'saved' }),
      fc.constantFrom(...paths.map((p) => p.id), 'path-gone', '').map((pathId): FilterChip => ({ kind: 'path', pathId })),
      // A chip kind from the old page, as a stale tab could still hold it.
      fc.constant({ kind: 'current' } as unknown as FilterChip),
    ),
    mutes: arbMutes,
    events: fc.constant([]),
    demo: fc.boolean(),
  }),
)

describe('Feature: fresh-v2, Property 2: Chip set', () => {
  it('shows "All hobbies", the Hobby_Chips with 2 or more paths and "Saved" outside Demo_Mode, one selected', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const view = buildFreshView(input)
        const ordered = expectedPathOrder(input.response.paths)

        const expected: { key: string; label: string }[] = [{ key: 'all', label: 'All hobbies' }]
        if (ordered.length >= 2) for (const p of ordered) expected.push({ key: `path:${p.id}`, label: p.hobby })
        if (!input.demo) expected.push({ key: 'saved', label: 'Saved' })
        expect(view.chips.map((c) => ({ key: c.key, label: c.label }))).toEqual(expected)

        // No "For <current skill>" chip (decision 3).
        expect(view.chips.some((c) => (c.chip.kind as string) === 'current')).toBe(false)
        expect(view.chips.some((c) => c.label.startsWith('For '))).toBe(false)

        // Exactly one is selected: the requested one when it is shown, else "All hobbies".
        const wanted = expectedChip(input)
        expect(view.chip).toEqual(wanted)
        const selected = view.chips.filter((c) => c.selected)
        expect(selected).toHaveLength(1)
        expect(selected[0]!.chip).toEqual(wanted)

        // Hobby_Chips carry their path's Color_Slot; the other chips carry none and no badge.
        for (const c of view.chips) {
          if (c.chip.kind === 'path') {
            const pathId = c.chip.pathId
            expect(c.colorSlot).toBe(ordered.find((p) => p.id === pathId)?.colorSlot)
          } else {
            expect(c.colorSlot).toBeNull()
            expect(c.newCount).toBe(0)
          }
        }
      }),
      RUNS,
    )
  })

  it('opens with "All hobbies" selected (Req 2.5)', () => {
    fc.assert(
      fc.property(arbPathsOf(0, 6), fc.boolean(), (paths, demo) => {
        const view = buildFreshView({ response: makeResponse({ paths }), chip: { kind: 'all' }, mutes: new Map(), events: [], demo })
        expect(view.chips.find((c) => c.selected)?.label).toBe('All hobbies')
        expect(view.chips[0]?.selected).toBe(true)
      }),
      RUNS,
    )
  })
})
