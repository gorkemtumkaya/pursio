import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PathInsertRow, ProgressWriteRow } from '../../shared/types/cloud'
import { ACTIVITY_STORAGE_KEY } from '../../app/utils/activity-store'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY } from '../../app/utils/generated-tree'
import { HOBBY_LIBRARY_KEY } from '../../app/utils/hobby-store'
import { planImport, readLegacyData, runLegacyImport } from '../../app/utils/legacy-import'
import type { ImportApi, ImportPlan, LegacyData } from '../../app/utils/legacy-import'
import type { StorageLike } from '../../app/utils/progress-store'
import { ARB_TIME_BASE, arbLegacyData } from '../arbitraries'
import type { LegacyCase } from '../arbitraries'

const RUNS = { numRuns: 200 }
const USER_ID = 'user-1'
const NOW = ARB_TIME_BASE + 1000

/** Read-only view of generated localStorage contents. */
function storageOf(contents: Record<string, string>): StorageLike {
  const data = new Map(Object.entries(contents))
  return {
    getItem: k => data.get(k) ?? null,
    setItem: () => {
      throw new Error('the importer must not write while reading')
    },
    removeItem: () => {
      throw new Error('the importer must not remove while reading')
    },
  }
}

function context(): { userId: string, now: number, newId: () => string, made: string[] } {
  const made: string[] = []
  return {
    userId: USER_ID,
    now: NOW,
    made,
    newId: () => {
      const id = `path-${made.length + 1}`
      made.push(id)
      return id
    },
  }
}

/** The Legacy_Data of a case; no Legacy_Data key at all reads as nothing to import. */
function legacyOf(testCase: LegacyCase): LegacyData {
  const legacy = readLegacyData(() => storageOf(testCase.storage))
  const keys = [HOBBY_LIBRARY_KEY, GENERATED_TREE_KEY, GENERATED_PROGRESS_KEY, ACTIVITY_STORAGE_KEY]
  expect(legacy === null).toBe(keys.every(key => !(key in testCase.storage)))
  return legacy ?? { entries: [], activeId: null, completions: [] }
}

// Feature: accounts-cloud-save, Property 8: The import plan mirrors the valid entries
// **Validates: Requirements 8.1, 8.2, 8.4, 8.6, 8.7**
describe('Property 8: The import plan mirrors the valid entries', () => {
  it('with zero existing paths: one Path_Row and one Progress_Row per valid entry, none for invalid ones', () => {
    fc.assert(
      fc.property(arbLegacyData, (testCase) => {
        const legacy = legacyOf(testCase)
        // Only the valid entries are read, in library order, the Generated_Tree last.
        expect(legacy.entries).toEqual(testCase.entries)

        const ctx = context()
        const plan = planImport(legacy, 0, ctx)

        expect(plan.paths.length).toBe(testCase.entries.length)
        expect(plan.progress.length).toBe(testCase.entries.length)
        expect(new Set(plan.paths.map(row => row.id)).size).toBe(plan.paths.length)
        expect(plan.paths.map(row => row.id)).toEqual(ctx.made)

        testCase.entries.forEach((entry, index) => {
          const path = plan.paths[index]
          const progress = plan.progress[index]
          expect(path).toEqual({
            id: ctx.made[index],
            user_id: USER_ID,
            hobby: entry.tree.hobby,
            hobby_id: entry.id,
            level: 'new',
            tree: entry.tree,
            mascot_set: entry.tree.mascot.set,
            model: entry.model,
            archived: entry.archived,
            created_at: new Date(entry.addedAt ?? NOW).toISOString(),
          })
          expect(progress?.path_id).toBe(path?.id)
          expect(progress?.user_id).toBe(USER_ID)
          expect(progress?.completed).toEqual(entry.progress.completed)
          expect(progress?.quests).toEqual(entry.progress.quests)
        })

        expect(plan.activeHobbyId).toBe(testCase.activeHobbyId)
        if (testCase.entries.length === 0) expect(plan.activeHobbyId).toBeNull()
      }),
      RUNS,
    )
  })

  it('with one or more existing paths: no rows and no activeHobbyId', () => {
    fc.assert(
      fc.property(arbLegacyData, fc.integer({ min: 1, max: 50 }), (testCase, existing) => {
        const ctx = context()
        expect(planImport(legacyOf(testCase), existing, ctx)).toEqual({ paths: [], progress: [], activeHobbyId: null })
      }),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 9: Import timestamps follow the Completion_Log
// **Validates: Requirements 8.3**
describe('Property 9: Import timestamps follow the Completion_Log', () => {
  it('the oldest log values are handed out in library order, then completion order', () => {
    fc.assert(
      fc.property(arbLegacyData, (testCase) => {
        const plan = planImport(legacyOf(testCase), 0, context())

        const oldestFirst = [...testCase.log].sort((a, b) => a - b)
        const completedCount = testCase.entries.reduce((sum, entry) => sum + entry.progress.completed.length, 0)

        // Walk the completed Nodes in library order and completion order.
        let next = 0
        const handedOut: number[] = []
        testCase.entries.forEach((entry, index) => {
          const expected: [string, number][] = []
          for (const nodeId of entry.progress.completed) {
            const stamp = oldestFirst[next]
            if (stamp === undefined) break
            expected.push([nodeId, stamp])
            next += 1
          }
          const stamps = plan.progress[index]?.completed_at ?? {}
          expect(Object.entries(stamps).sort()).toEqual(expected.sort())
          // Timestamps only for completed Nodes of this entry.
          expect(Object.keys(stamps).every(id => entry.progress.completed.includes(id))).toBe(true)
          handedOut.push(...Object.values(stamps))
        })

        // As many as the smaller of the two counts, and always the oldest ones.
        const count = Math.min(completedCount, oldestFirst.length)
        expect(handedOut.length).toBe(count)
        expect([...handedOut].sort((a, b) => a - b)).toEqual(oldestFirst.slice(0, count))
        if (completedCount === oldestFirst.length) {
          expect([...handedOut].sort((a, b) => a - b)).toEqual(oldestFirst)
        }
      }),
      RUNS,
    )
  })
})

interface RowSet {
  paths: PathInsertRow[]
  progress: ProgressWriteRow[]
}

/** In-memory stand-in for the two tables. Deleting a path removes its Progress_Row too. */
function memoryApi(rows: RowSet): ImportApi {
  return {
    insertPaths: async (added) => {
      rows.paths.push(...added)
    },
    insertProgress: async (added) => {
      rows.progress.push(...added)
    },
    deletePaths: async (ids) => {
      rows.paths = rows.paths.filter(row => !ids.includes(row.id))
      rows.progress = rows.progress.filter(row => !ids.includes(row.path_id))
    },
  }
}

// Feature: accounts-cloud-save, Property 10: Importing twice equals importing once
// **Validates: Requirements 8.9**
describe('Property 10: Importing twice equals importing once', () => {
  it('a second plan made from the new row count adds and changes nothing', async () => {
    await fc.assert(
      fc.asyncProperty(arbLegacyData, async (testCase) => {
        const legacy = legacyOf(testCase)
        const ctx = context()
        const rows: RowSet = { paths: [], progress: [] }
        const api = memoryApi(rows)

        const first: ImportPlan = planImport(legacy, rows.paths.length, ctx)
        expect(await runLegacyImport(api, first)).toBe(true)
        const once = structuredClone(rows)
        expect(once.paths.length).toBe(testCase.entries.length)
        expect(once.progress.length).toBe(testCase.entries.length)

        const second: ImportPlan = planImport(legacy, rows.paths.length, ctx)
        expect(await runLegacyImport(api, second)).toBe(true)

        expect(rows).toEqual(once)
        // No Hobby_Id is stored twice.
        expect(new Set(rows.paths.map(row => row.hobby_id)).size).toBe(rows.paths.length)
      }),
      RUNS,
    )
  })
})
