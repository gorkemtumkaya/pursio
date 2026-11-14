import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CompletedAt } from '../../shared/types/cloud'
import type { Progress } from '../../shared/types/progress'
import { streakDays, weekDays } from '../../shared/utils/streak'
import {
  completionTimes,
  stampCompletions,
  withArchived,
  withoutPath,
  withPath,
} from '../../app/utils/cloud-library'
import type { CloudPath } from '../../app/utils/cloud-library'
import { ARB_TIME_BASE, arbCloudPaths, arbId, arbStamp } from '../arbitraries'

const RUNS = { numRuns: 200 }
const DAY_MS = 86_400_000

const sorted = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b)
const byId = (paths: readonly CloudPath[]): CloudPath[] =>
  [...paths].sort((a, b) => (a.record.id < b.record.id ? -1 : a.record.id > b.record.id ? 1 : 0))

/** A non-empty list and one member of it. */
const arbPathsAndMember: fc.Arbitrary<{ paths: CloudPath[], member: CloudPath }> = fc
  .tuple(arbCloudPaths, fc.nat())
  .filter(([paths]) => paths.length > 0)
  .map(([paths, pick]) => ({ paths, member: paths[pick % paths.length] as CloudPath }))

// Feature: accounts-cloud-save, Property 4: Archive, delete and Undo are reversible on the library
// **Validates: Requirements 5.5, 5.6, 5.7, 6.9**
describe('Property 4: Archive, delete and Undo are reversible on the library', () => {
  it('archiving then restoring (or the reverse) returns an equal list', () => {
    fc.assert(
      fc.property(arbPathsAndMember, ({ paths, member }) => {
        const snapshot = structuredClone(paths)
        const { id, archived } = member.record

        const flipped = withArchived(paths, id, !archived)
        expect(flipped.map(path => path.record.id)).toEqual(paths.map(path => path.record.id))
        for (const [index, path] of flipped.entries()) {
          if (path.record.id === id) {
            expect(path).toEqual({ ...member, record: { ...member.record, archived: !archived } })
          }
          else {
            expect(path).toEqual(paths[index])
          }
        }

        expect(withArchived(flipped, id, archived)).toEqual(paths)
        // Setting the value it already has changes nothing.
        expect(withArchived(paths, id, archived)).toEqual(paths)
        // The input list is never changed in place.
        expect(paths).toEqual(snapshot)
      }),
      RUNS,
    )
  })

  it('removing a path then putting it back returns the same paths, content and timestamps', () => {
    fc.assert(
      fc.property(arbPathsAndMember, ({ paths, member }) => {
        const snapshot = structuredClone(paths)
        const id = member.record.id

        const after = withoutPath(paths, id)
        expect(after.some(path => path.record.id === id)).toBe(false)
        expect(after).toEqual(paths.filter(path => path !== member))
        // None of the removed path's timestamps are counted any more.
        expect(sorted(completionTimes(after))).toEqual(
          sorted(paths.filter(path => path !== member).flatMap(path => Object.values(path.completedAt))),
        )
        expect(completionTimes(after).length).toBe(
          completionTimes(paths).length - Object.keys(member.completedAt).length,
        )

        const restored = withPath(after, member)
        expect(byId(restored)).toEqual(byId(paths))
        // The generated lists are in the order added, so Undo also keeps the order.
        expect(restored).toEqual(paths)
        expect(sorted(completionTimes(restored))).toEqual(sorted(completionTimes(paths)))
        expect(paths).toEqual(snapshot)
      }),
      RUNS,
    )
  })
})

interface StampStep {
  /** How many more ids are completed in this step. */
  added: number
  time: number
}

const arbNodeId: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: arbId },
  { weight: 1, arbitrary: fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty') },
)

// Feature: accounts-cloud-save, Property 5: Completion_Timestamps are stable
// **Validates: Requirements 6.6**
describe('Property 5: Completion_Timestamps are stable', () => {
  it('stampCompletions keeps set timestamps, stamps new ids with the step time and holds no other key', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbNodeId, { minLength: 1, maxLength: 12 }),
        fc.array(fc.record({ added: fc.integer({ min: 0, max: 3 }), time: arbStamp }), { minLength: 1, maxLength: 10 }),
        (ids, steps: StampStep[]) => {
          let previous: CompletedAt = {}
          let count = 0
          let prevProgress: Progress = { completed: [], quests: {} }
          for (const step of steps) {
            count = Math.min(ids.length, count + step.added)
            const progress: Progress = { completed: ids.slice(0, count), quests: {} }
            const before = Object.entries(previous)

            const next = stampCompletions(previous, prevProgress, progress, step.time)
            prevProgress = progress

            // Exactly the completed ids have a timestamp.
            expect(Object.keys(next).sort()).toEqual([...progress.completed].sort())
            const stamps = new Map(Object.entries(next))
            // A timestamp that was set never changes.
            for (const [id, stamp] of before) expect(stamps.get(id)).toBe(stamp)
            // A newly completed id gets this step's time.
            const had = new Set(before.map(([id]) => id))
            for (const id of progress.completed) {
              if (!had.has(id)) expect(stamps.get(id)).toBe(step.time)
            }
            // The earlier value is not changed in place.
            expect(Object.entries(previous)).toEqual(before)
            previous = next
          }
        },
      ),
      RUNS,
    )
  })
})

// Feature: reset-progress, Property 5 (extended): stampCompletions with a `before` argument
// **Validates: Requirements 3.6**
describe('stampCompletions with retained history', () => {
  it('keeps timestamps of ids completed in neither Progress, stamps new ids and drops uncompleted ones', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbNodeId, { minLength: 1, maxLength: 10 }),
        fc.array(fc.tuple(fc.boolean(), fc.boolean(), fc.boolean()), { minLength: 10, maxLength: 10 }),
        arbStamp,
        arbStamp,
        (ids, flags, oldStamp, now) => {
          const inBefore = ids.filter((_, i) => flags[i]?.[0])
          const inAfter = ids.filter((_, i) => flags[i]?.[1])
          const hasPrev = ids.filter((_, i) => flags[i]?.[2])
          const prev: CompletedAt = Object.fromEntries(hasPrev.map(id => [id, oldStamp]))
          const snapshot = { ...prev }

          const next = stampCompletions(
            prev,
            { completed: inBefore, quests: {} },
            { completed: inAfter, quests: {} },
            now,
          )
          const out = new Map(Object.entries(next))

          for (const id of ids) {
            const was = inBefore.includes(id)
            const is = inAfter.includes(id)
            if (is && !was) expect(out.get(id)).toBe(now)
            else if (is && was) expect(out.get(id)).toBe(hasPrev.includes(id) ? oldStamp : now)
            else if (!is && was) expect(out.has(id)).toBe(false)
            else expect(out.get(id)).toBe(hasPrev.includes(id) ? oldStamp : undefined)
          }
          expect(prev).toEqual(snapshot)
        },
      ),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 6: Streak and Week count every timestamp once
// **Validates: Requirements 6.8**
describe('Property 6: Streak and Week count every timestamp once', () => {
  const arbCase = arbCloudPaths.chain((paths) => {
    const times = paths.flatMap(path => Object.values(path.completedAt))
    return fc.record({
      paths: fc.constant(paths),
      shuffled: fc.shuffledSubarray(times, { minLength: times.length }),
      order: fc.shuffledSubarray(paths, { minLength: paths.length }),
      now: fc.integer({ min: ARB_TIME_BASE - 31 * DAY_MS, max: ARB_TIME_BASE + 3 * DAY_MS }),
    })
  })

  it('completionTimes is the multiset union of all timestamps, and order or grouping changes nothing', () => {
    fc.assert(
      fc.property(arbCase, ({ paths, shuffled, order, now }) => {
        const times = completionTimes(paths)

        // Every timestamp of every path, archived ones included, once each.
        expect(sorted(times)).toEqual(sorted(paths.flatMap(path => Object.values(path.completedAt))))
        expect(times.length).toBe(paths.reduce((sum, path) => sum + Object.keys(path.completedAt).length, 0))
        expect(sorted(completionTimes(paths.filter(path => path.record.archived)))).toEqual(
          sorted(paths.filter(path => path.record.archived).flatMap(path => Object.values(path.completedAt))),
        )

        const streak = streakDays(times, now)
        const week = weekDays(times, now)
        // Another order of the same timestamps.
        expect(streakDays(shuffled, now)).toBe(streak)
        expect(weekDays(shuffled, now)).toEqual(week)
        // Another order of the paths.
        expect(streakDays(completionTimes(order), now)).toBe(streak)
        expect(weekDays(completionTimes(order), now)).toEqual(week)
        // Another grouping: all timestamps on one path.
        const first = paths[0]
        if (first) {
          const merged: CloudPath = {
            ...first,
            completedAt: Object.fromEntries(times.map((time, index): [string, number] => [`n${index}`, time])),
          }
          expect(streakDays(completionTimes([merged]), now)).toBe(streak)
          expect(weekDays(completionTimes([merged]), now)).toEqual(week)
        }
      }),
      RUNS,
    )
  })

  it('a list with no timestamps gives Streak 0 and no done days', () => {
    fc.assert(
      fc.property(arbCase, ({ paths, now }) => {
        const bare = paths.map((path): CloudPath => ({ ...path, completedAt: {} }))
        const times = completionTimes(bare)
        expect(times).toEqual([])
        expect(streakDays(times, now)).toBe(0)
        expect(weekDays(times, now).some(day => day.status === 'done')).toBe(false)
      }),
      RUNS,
    )
  })
})
