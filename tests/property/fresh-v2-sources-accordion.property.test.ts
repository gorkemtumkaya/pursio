// Feature: fresh-v2, Property 11: Sources accordion
// For any sequence of chip selections and toggles, the open set always contains the group of
// the most recently selected Hobby_Chip. Toggles of other groups are kept across chip changes.
// A group with no entries is never in the set.
// Validates: Requirements 8.3, 8.4, 8.5, 12.10
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildFreshView, type FilterChip, type FreshView } from '../../shared/utils/fresh-view'
import { nextOpenGroups, toggleGroup } from '../../app/utils/fresh-page'
import { arbMutes, arbPathsOf, arbSources, makeResponse } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 200 }

type Step = { kind: 'select'; pick: number } | { kind: 'toggle'; pick: number } | { kind: 'toggleUnknown' }

const arbCase = arbPathsOf(1, 6).chain((paths) =>
  fc.record({
    response: arbSources.map((sources) => makeResponse({ paths, sources })),
    mutes: arbMutes,
    steps: fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant<'select'>('select'), pick: fc.nat() }),
        fc.record({ kind: fc.constant<'toggle'>('toggle'), pick: fc.nat() }),
        fc.constant<Step>({ kind: 'toggleUnknown' }),
      ),
      { maxLength: 25 },
    ),
  }),
)

describe('Feature: fresh-v2, Property 11: Sources accordion', () => {
  it('opens the selected chip group, keeps the user toggles and never opens a group with no channel', () => {
    fc.assert(
      fc.property(arbCase, ({ response, mutes, steps }) => {
        const viewFor = (chip: FilterChip): FreshView => buildFreshView({ response, chip, mutes, events: [], demo: false })
        let view = viewFor({ kind: 'all' })
        const groups = view.sources
        const openable = new Set(groups.filter((g) => g.entries.length > 0).map((g) => g.key))
        const firstOpenable = groups.find((g) => g.entries.length > 0)?.key ?? null

        // The page opens: the first group that can open (Req 8.3).
        expect(view.defaultOpenSource).toBe(firstOpenable)
        let open = nextOpenGroups(new Set<string>(), view.defaultOpenSource)
        /** What the user and the chips did, tracked apart from the helpers. */
        const model = new Set<string>(firstOpenable === null ? [] : [firstOpenable])

        const check = (): void => {
          expect([...open].sort()).toEqual([...model].sort())
          for (const key of open) expect(openable.has(key)).toBe(true)
        }
        check()

        for (const step of steps) {
          if (step.kind === 'select') {
            const chips = view.chips
            const chosen = chips[step.pick % chips.length]!
            view = viewFor(chosen.chip)
            // The groups and their order do not depend on the chip (Req 8.2).
            expect(view.sources).toEqual(groups)
            const before = new Set(open)
            open = nextOpenGroups(open, view.defaultOpenSource)

            if (view.chip.kind === 'path') {
              const key = view.chip.pathId
              // The selected Hobby_Chip's group opens when it has channels, else nothing opens.
              expect(view.defaultOpenSource).toBe(openable.has(key) ? key : null)
              if (openable.has(key)) {
                expect(open.has(key)).toBe(true)
                model.add(key)
              }
            } else {
              // "All hobbies" and "Saved": the first group.
              expect(view.defaultOpenSource).toBe(firstOpenable)
              if (firstOpenable !== null) model.add(firstOpenable)
            }
            // A chip change closes nothing the user had open.
            for (const key of before) expect(open.has(key)).toBe(true)
          } else if (step.kind === 'toggle') {
            const group = groups[step.pick % groups.length]!
            const wasOpen = open.has(group.key)
            const others = [...open].filter((k) => k !== group.key).sort()
            open = toggleGroup(open, group.key, groups)
            // Only this group changes; several may be open at once (Req 8.4).
            expect([...open].filter((k) => k !== group.key).sort()).toEqual(others)
            if (group.entries.length === 0) {
              expect(open.has(group.key)).toBe(false)
            } else {
              expect(open.has(group.key)).toBe(!wasOpen)
              if (wasOpen) model.delete(group.key)
              else model.add(group.key)
            }
          } else {
            open = toggleGroup(open, 'no-such-group', groups)
          }
          check()
        }
      }),
      RUNS,
    )
  })

  it('never changes the set it was given', () => {
    const open: ReadonlySet<string> = new Set(['a'])
    const groups = [
      { key: 'a', entries: [1] },
      { key: 'b', entries: [1] },
      { key: 'c', entries: [] },
    ]
    expect([...nextOpenGroups(open, 'b')]).toEqual(['a', 'b'])
    expect([...nextOpenGroups(open, null)]).toEqual(['a'])
    expect([...toggleGroup(open, 'a', groups)]).toEqual([])
    expect([...toggleGroup(open, 'b', groups)]).toEqual(['a', 'b'])
    expect([...toggleGroup(open, 'c', groups)]).toEqual(['a'])
    expect([...open]).toEqual(['a'])
  })
})
