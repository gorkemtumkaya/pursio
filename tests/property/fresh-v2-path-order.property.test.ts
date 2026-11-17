// Feature: fresh-v2, Property 1: Path_Order
// For any list of 1 to 6 paths with random `activeAt` (some null), the Hobby_Chips, the
// Hobby_Sections under "All hobbies" and the Sources_Panel groups list the same path ids in
// the same order. That order is sorted by `activeAt` descending, with null values last in
// response order.
// Validates: Requirements 2.2, 4.1, 8.2, 12.1
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildFreshView, pathOrder, type FilterChip } from '../../shared/utils/fresh-view'
import {
  arbCheckTimes,
  arbItems,
  arbMutes,
  arbPathsOf,
  arbPools,
  arbSources,
  expectedPathOrder,
  makeResponse,
} from '../support/fresh-arbitraries'

const RUNS = { numRuns: 200 }

const arbInput = arbPathsOf(1, 6).chain((paths) =>
  fc.record({
    response: fc
      .record({ items: arbItems(paths), pools: arbPools(paths), sources: arbSources, checkTimes: arbCheckTimes })
      .map((r) => makeResponse({ paths, ...r })),
    chip: fc.constantFrom<FilterChip>({ kind: 'all' }, { kind: 'saved' }, ...paths.map((p): FilterChip => ({ kind: 'path', pathId: p.id }))),
    mutes: arbMutes,
    demo: fc.boolean(),
  }),
)

describe('Feature: fresh-v2, Property 1: Path_Order', () => {
  it('sorts by activeAt descending, null last, ties and nulls in response order', () => {
    fc.assert(
      fc.property(arbPathsOf(1, 6), (paths) => {
        const ordered = pathOrder(paths)
        expect(ordered.map((p) => p.id)).toEqual(expectedPathOrder(paths).map((p) => p.id))
        // Same paths, none lost or repeated.
        expect([...ordered].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
          [...paths].sort((a, b) => a.id.localeCompare(b.id)),
        )
        // Stated directly: no later path is more recently active than an earlier one.
        for (let i = 1; i < ordered.length; i += 1) {
          const prev = ordered[i - 1]!
          const next = ordered[i]!
          if (prev.activeAt === null) expect(next.activeAt).toBeNull()
          else if (next.activeAt !== null) expect(prev.activeAt).toBeGreaterThanOrEqual(next.activeAt)
          if (prev.activeAt === next.activeAt) expect(paths.indexOf(prev)).toBeLessThan(paths.indexOf(next))
        }
      }),
      RUNS,
    )
  })

  it('uses one order for the Hobby_Chips, the Hobby_Sections and the Sources_Panel groups', () => {
    fc.assert(
      fc.property(arbInput, ({ response, chip, mutes, demo }) => {
        const expected = expectedPathOrder(response.paths).map((p) => p.id)
        const all = buildFreshView({ response, chip: { kind: 'all' }, mutes, events: [], demo })
        expect(all.sections.map((s) => s.pathId)).toEqual(expected)
        expect(all.sources.map((g) => g.pathId)).toEqual(expected)
        const chipIds = all.chips.flatMap((c) => (c.chip.kind === 'path' ? [c.chip.pathId] : []))
        expect(chipIds).toEqual(expected.length >= 2 ? expected : [])

        // The Sources_Panel keeps every group in Path_Order, whichever chip is selected (Req 8.2).
        const other = buildFreshView({ response, chip, mutes, events: [], demo })
        expect(other.sources.map((g) => g.pathId)).toEqual(expected)
        expect(other.chips.map((c) => c.key)).toEqual(all.chips.map((c) => c.key))
        // A Hobby_Chip shows only that path's section (Req 2.5).
        if (other.chip.kind === 'path') expect(other.sections.map((s) => s.pathId)).toEqual([other.chip.pathId])
        if (other.chip.kind === 'saved') expect(other.sections).toEqual([])
      }),
      RUNS,
    )
  })
})
