// Feature: fresh-v2, Property 7: Color slot assignment and stability
// For any sequence of creating, archiving, restoring, removing, undoing a removal and activating
// paths, applied to the local Hobby_Library:
// - every new path gets `nextColorSlot` of the latest-created existing record, or 1 when there
//   is none;
// - no other operation changes any remaining record's slot;
// - re-adding an existing Hobby_Id keeps its slot.
// `upsertGenerated` gives the same results for cloud paths.
// Validates: Requirements 9.5, 9.6, 12.8
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillTree } from '../../shared/types/skill-tree'
import { COLOR_SLOT_COUNT, isColorSlot, nextColorSlot, slotForNewPath, type ColorSlot } from '../../shared/utils/color-slot'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { upsertGenerated, withArchived, withPath, withoutPath, type CloudPath } from '../../app/utils/cloud-library'
import {
  addHobby,
  archiveHobby,
  loadHobbyLibrary,
  removeHobby,
  restoreHobby,
  setActiveHobby,
  undoRemoveHobby,
  type HobbyRecord,
  type RemovedHobby,
} from '../../app/utils/hobby-store'
import type { StorageLike } from '../../app/utils/progress-store'

const RUNS = { numRuns: 200 }

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const base: SkillTree = loaded.value
const NAMES = ['Bouldering', 'Guitar', 'Chess', 'Piano', 'Yoga', 'Juggling', 'Pottery', 'Sailing'] as const
const idOf = (name: string): string => name.toLowerCase()
const treeOf = (name: string): SkillTree => ({ ...base, hobby: name })

function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

type Op =
  | { kind: 'add'; name: string }
  | { kind: 'archive' | 'restore' | 'remove' | 'activate'; name: string }
  | { kind: 'undo' }

const arbName = fc.constantFrom(...NAMES)
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { weight: 4, arbitrary: arbName.map((name): Op => ({ kind: 'add', name })) },
  { weight: 1, arbitrary: arbName.map((name): Op => ({ kind: 'archive', name })) },
  { weight: 1, arbitrary: arbName.map((name): Op => ({ kind: 'restore', name })) },
  { weight: 1, arbitrary: arbName.map((name): Op => ({ kind: 'remove', name })) },
  { weight: 1, arbitrary: arbName.map((name): Op => ({ kind: 'activate', name })) },
  { weight: 1, arbitrary: fc.constant<Op>({ kind: 'undo' }) },
)

/**
 * Requirement 9.5, written without the helpers under test: the slot after the one of the
 * latest-created record (later `addedAt`, then later in the list), 5 going back to 1, or 1.
 */
function expectedNewSlot(records: readonly { addedAt: number; colorSlot: ColorSlot }[]): ColorSlot {
  let latest: { addedAt: number; colorSlot: ColorSlot } | null = null
  for (const record of records) if (latest === null || record.addedAt >= latest.addedAt) latest = record
  if (latest === null) return 1
  return (latest.colorSlot === COLOR_SLOT_COUNT ? 1 : latest.colorSlot + 1) as ColorSlot
}

const slotMap = (records: readonly HobbyRecord[]): Map<string, ColorSlot> =>
  new Map(records.map((r) => [r.id, r.colorSlot]))

describe('Feature: fresh-v2, Property 7: Color slot assignment and stability', () => {
  it('nextColorSlot cycles 1 to 5 and slotForNewPath follows the latest-created record', () => {
    expect(nextColorSlot(null)).toBe(1)
    expect([1, 2, 3, 4, 5].map((s) => nextColorSlot(s as ColorSlot))).toEqual([2, 3, 4, 5, 1])
    fc.assert(
      fc.property(
        fc.array(fc.record({ addedAt: fc.integer({ min: 0, max: 20 }), colorSlot: fc.constantFrom<ColorSlot>(1, 2, 3, 4, 5) }), {
          maxLength: 12,
        }),
        (records) => {
          const slot = slotForNewPath(records)
          expect(isColorSlot(slot)).toBe(true)
          expect(slot).toBe(expectedNewSlot(records))
        },
      ),
      RUNS,
    )
  })

  it('local Hobby_Library: a new path gets the next slot; nothing else ever changes a slot', () => {
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 30 }), (ops) => {
        const storage = memoryStorage()
        const get = () => storage
        let now = 1000
        let lastRemoved: RemovedHobby | null = null
        /** Slot of every Hobby_Id ever seen and still present. */
        let known = new Map<string, ColorSlot>()

        for (const op of ops) {
          now += 10
          const before = loadHobbyLibrary(get, now)
          const id = 'name' in op ? idOf(op.name) : null
          switch (op.kind) {
            case 'add':
              addHobby(get, { tree: treeOf(op.name), model: 'm' }, now)
              break
            case 'archive':
              archiveHobby(get, id!)
              break
            case 'restore':
              restoreHobby(get, id!)
              break
            case 'activate':
              setActiveHobby(get, id!)
              break
            case 'remove': {
              const { removed } = removeHobby(get, id!)
              if (removed) lastRemoved = removed
              break
            }
            case 'undo':
              if (lastRemoved) undoRemoveHobby(get, lastRemoved)
              break
          }
          const after = loadHobbyLibrary(get, now)
          const slots = slotMap(after.hobbies)
          for (const slot of slots.values()) expect(isColorSlot(slot)).toBe(true)

          // Every record that was there before keeps its slot.
          for (const record of before.hobbies) {
            if (slots.has(record.id)) expect(slots.get(record.id), `${op.kind} changed ${record.id}`).toBe(record.colorSlot)
          }
          // A record that is new in the library:
          for (const record of after.hobbies) {
            if (before.hobbies.some((r) => r.id === record.id)) continue
            if (op.kind === 'add') {
              // created: the slot after the latest-created record (archived ones count).
              expect(record.colorSlot).toBe(expectedNewSlot(before.hobbies))
            } else {
              // put back by Undo: the slot it had when it was removed.
              expect(op.kind).toBe('undo')
              expect(record.colorSlot).toBe(lastRemoved?.record.colorSlot)
            }
          }
          // Only an add or an Undo adds a record; only a remove takes one away.
          if (op.kind !== 'add' && op.kind !== 'undo') expect(after.hobbies.length).toBeLessThanOrEqual(before.hobbies.length)
          if (op.kind !== 'remove') expect(after.hobbies.length).toBeGreaterThanOrEqual(before.hobbies.length)
          known = slots
        }
        // Reading again gives the same slots.
        expect(slotMap(loadHobbyLibrary(get, now).hobbies)).toEqual(known)
      }),
      RUNS,
    )
  })

  it('cloud paths: upsertGenerated assigns by the same rule, and list changes keep every slot', () => {
    fc.assert(
      fc.property(fc.array(arbOp, { maxLength: 30 }), (ops) => {
        let paths: CloudPath[] = []
        let now = 1000
        let lastRemoved: CloudPath | null = null
        for (const op of ops) {
          now += 10
          const before = paths
          const id = 'name' in op ? idOf(op.name) : null
          switch (op.kind) {
            case 'add':
              paths = upsertGenerated(paths, { pathId: `row-${now}`, tree: treeOf(op.name), model: 'm', level: 'new' }, now)
              break
            case 'archive':
              paths = withArchived(paths, id!, true)
              break
            case 'restore':
              paths = withArchived(paths, id!, false)
              break
            case 'remove': {
              const removed = paths.find((p) => p.record.id === id)
              if (removed) lastRemoved = removed
              paths = withoutPath(paths, id!)
              break
            }
            case 'undo':
              if (lastRemoved && !paths.some((p) => p.record.id === lastRemoved!.record.id)) paths = withPath(paths, lastRemoved)
              break
            case 'activate':
              break
          }
          const beforeRecords = before.map((p) => p.record)
          for (const path of paths) {
            const old = beforeRecords.find((r) => r.id === path.record.id)
            if (old) expect(path.record.colorSlot, `${op.kind} changed ${old.id}`).toBe(old.colorSlot)
            else if (op.kind === 'add') expect(path.record.colorSlot).toBe(expectedNewSlot(beforeRecords))
            else expect(path.record.colorSlot).toBe(lastRemoved?.record.colorSlot)
          }
        }
      }),
      RUNS,
    )
  })

  it('the same additions give the same slots locally and in the cloud list', () => {
    fc.assert(
      fc.property(fc.array(arbName, { maxLength: 20 }), (names) => {
        const storage = memoryStorage()
        let paths: CloudPath[] = []
        names.forEach((name, i) => {
          const now = 1000 + i * 10
          addHobby(() => storage, { tree: treeOf(name), model: 'm' }, now)
          paths = upsertGenerated(paths, { pathId: `row-${i}`, tree: treeOf(name), model: 'm', level: 'new' }, now)
        })
        const local = loadHobbyLibrary(() => storage).hobbies.map((r) => [r.id, r.colorSlot])
        expect(paths.map((p) => [p.record.id, p.record.colorSlot])).toEqual(local)
        // In order of first appearance: 1, 2, 3, 4, 5, 1, ...
        expect(local.map(([, slot]) => slot)).toEqual(local.map((_, i) => (i % COLOR_SLOT_COUNT) + 1))
      }),
      RUNS,
    )
  })
})
