import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PathInsertRow } from '../../shared/types/cloud'
import type { StoredProfile } from '../../shared/types/learner-profile'
import type { SkillTree } from '../../shared/types/skill-tree'
import { applyProfileToTree, knownNodeIds } from '../../shared/utils/known-nodes'
import { headStartXp } from '../../shared/utils/xp'
import { parsePathRow, toPathInsertRow } from '../../app/utils/cloud-rows'
import { HOBBY_LIBRARY_KEY, hobbyId, parseHobbyLibrary, profileField, serializeHobbyLibrary, type HobbyRecord } from '../../app/utils/hobby-store'
import { planImport, readLegacyData } from '../../app/utils/legacy-import'
import type { StorageLike } from '../../app/utils/progress-store'
import { arbTreeAndProfile } from '../arbitraries'

const RUNS = { numRuns: 200 }
const USER = '00000000-0000-4000-8000-000000000001'
const PATH_ID = '00000000-0000-4000-8000-000000000002'
const ADDED_AT = Date.UTC(2026, 10, 1)

function viaJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

function memoryStorage(entries: Record<string, string>): StorageLike {
  const map = new Map(Object.entries(entries))
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value) },
    removeItem: (key) => { map.delete(key) },
  }
}

interface Saved {
  tree: SkillTree
  profile: StoredProfile | null
}

/** What the Tree_Route saves for a generated tree and a request profile. */
const arbSaved: fc.Arbitrary<Saved> = arbTreeAndProfile.map(({ tree, profile }) => applyProfileToTree(tree, profile))

function pathRow(saved: Saved, rawProfile: unknown): PathInsertRow & { profile?: unknown } {
  return {
    id: PATH_ID,
    user_id: USER,
    hobby: saved.tree.hobby,
    hobby_id: hobbyId(saved.tree),
    level: 'new',
    tree: saved.tree,
    mascot_set: saved.tree.mascot.set,
    model: 'model-a',
    archived: false,
    created_at: new Date(ADDED_AT).toISOString(),
    color_slot: 1,
    ...(rawProfile === undefined ? {} : { profile: rawProfile as StoredProfile }),
  }
}

function localRecord(saved: Saved): HobbyRecord {
  return {
    id: hobbyId(saved.tree),
    tree: saved.tree,
    model: 'model-a',
    addedAt: ADDED_AT,
    archived: false,
    colorSlot: 1,
    ...profileField(saved.profile),
  }
}

function expectSame(read: { tree: SkillTree; profile?: StoredProfile | null } | undefined, saved: Saved): void {
  expect(read).toBeDefined()
  if (read === undefined) return
  expect(knownNodeIds(read.tree)).toEqual(knownNodeIds(saved.tree))
  expect(headStartXp(read.tree)).toBe(headStartXp(saved.tree))
  expect(read.profile ?? null).toEqual(saved.profile)
}

// Feature: path-intake, Property 11: Saved paths read back the same
// **Validates: Requirements 9.1, 9.5, 11.5, 11.8, 16.18**
describe('Property 11: Saved paths read back the same', () => {
  it('cloud: a Path_Row reads back with the same Known_Nodes and head start, also after Undo writes it again', () => {
    fc.assert(
      fc.property(arbSaved, (saved) => {
        const first = parsePathRow(viaJson(pathRow(saved, saved.profile ?? undefined)))
        expectSame(first?.record, saved)
        if (first === null) return
        // Undo of a delete inserts the row again from what the app holds.
        const second = parsePathRow(viaJson(toPathInsertRow(USER, first)))
        expectSame(second?.record, saved)
      }),
      RUNS,
    )
  })

  it('local: a library entry reads back the same, also after a second write and read', () => {
    fc.assert(
      fc.property(arbSaved, (saved) => {
        const library = { hobbies: [localRecord(saved)], activeId: null }
        const first = parseHobbyLibrary(serializeHobbyLibrary(library)).library
        expectSame(first.hobbies[0], saved)
        const second = parseHobbyLibrary(serializeHobbyLibrary(first)).library
        expectSame(second.hobbies[0], saved)
      }),
      RUNS,
    )
  })

  it('legacy import: a local entry uploaded to the account reads back the same', () => {
    fc.assert(
      fc.property(arbSaved, (saved) => {
        const raw = serializeHobbyLibrary({ hobbies: [localRecord(saved)], activeId: null })
        const legacy = readLegacyData(() => memoryStorage({ [HOBBY_LIBRARY_KEY]: raw }))
        expect(legacy).not.toBeNull()
        if (legacy === null) return
        const plan = planImport(legacy, 0, { userId: USER, now: ADDED_AT, newId: () => PATH_ID })
        const [row] = plan.paths
        expect(row).toBeDefined()
        expectSame(parsePathRow(viaJson(row))?.record, saved)
      }),
      RUNS,
    )
  })

  it('a missing or unreadable profile reads as a path with no Known_Node and no head start', () => {
    fc.assert(
      fc.property(arbSaved, fc.constantFrom(undefined, null, 'junk', { known: 'x' }, []), (saved, bad) => {
        const cloud = parsePathRow(viaJson(pathRow(saved, bad)))
        expect(cloud).not.toBeNull()
        expect(knownNodeIds(cloud?.record.tree ?? saved.tree)).toEqual([])
        expect(headStartXp(cloud?.record.tree ?? saved.tree)).toBe(0)
        expect(cloud?.record.profile ?? null).toBeNull()

        const entry = { ...localRecord({ ...saved, profile: null }), profile: bad }
        const local = parseHobbyLibrary(JSON.stringify({ hobbies: [entry], activeId: null })).library.hobbies[0]
        expect(local).toBeDefined()
        expect(knownNodeIds(local?.tree ?? saved.tree)).toEqual([])
        expect(local?.profile ?? null).toBeNull()
      }),
      RUNS,
    )
  })
})
