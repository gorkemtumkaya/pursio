import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CompletedAt, PathInsertRow, QuestData } from '../../shared/types/cloud'
import type { Progress } from '../../shared/types/progress'
import type { QuestTriple, SkillTree } from '../../shared/types/skill-tree'
import { buildSaveArgs } from '../../shared/utils/cloud-path'
import { normalizeHobby } from '../../shared/utils/llm'
import { xpFor, XP_PER_NODE, XP_PER_QUEST } from '../../shared/utils/xp'
import { emptyQuestData } from '../../app/utils/cloud-library'
import { parsePathRow, parseProgressRow, toPathInsertRow, toProgressRow } from '../../app/utils/cloud-rows'
import {
  allNodes,
  arbCloudPath,
  arbId,
  arbProgress,
  arbQuestData,
  arbStamp,
  arbStartLevel,
  arbText,
  arbValidTree,
} from '../arbitraries'

const RUNS = { numRuns: 200 }

/** What a row looks like after a trip through the database's JSON columns. */
function viaJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

// Feature: accounts-cloud-save, Property 1: Path_Row round trip
// **Validates: Requirements 5.10**
describe('Property 1: Path_Row round trip', () => {
  it('save arguments shaped into a stored row parse back to the same tree, model and Hobby_Id', () => {
    fc.assert(
      fc.property(
        arbValidTree,
        fc.string({ minLength: 1 }),
        arbText,
        arbStartLevel,
        fc.uuid(),
        fc.uuid(),
        fc.boolean(),
        arbStamp,
        (tree, model, hobby, level, id, userId, archived, createdAt) => {
          const args = buildSaveArgs({ hobby, level, tree, model })
          const row: PathInsertRow = {
            id,
            user_id: userId,
            hobby: args.p_hobby,
            hobby_id: args.p_hobby_id,
            level: args.p_level,
            tree: args.p_tree,
            mascot_set: args.p_mascot_set,
            model: args.p_model,
            archived,
            created_at: new Date(createdAt).toISOString(),
          }

          const parsed = parsePathRow(viaJson(row))

          expect(parsed).not.toBeNull()
          if (parsed === null) return
          expect(parsed.record.tree).toEqual(tree)
          expect(parsed.record.model).toBe(model)
          expect(parsed.record.id).toBe(normalizeHobby(tree.hobby))
          expect(parsed.record.id).toBe(args.p_hobby_id)
          expect(parsed.pathId).toBe(id)
          expect(parsed.level).toBe(level)
          expect(parsed.record.archived).toBe(archived)
          expect(parsed.record.addedAt).toBe(createdAt)
          expect(parsed.progress).toEqual({ completed: [], quests: {} })
          expect(parsed.completedAt).toEqual({})
        },
      ),
      RUNS,
    )
  })

  it('a CloudPath written as a full Path_Row (Undo) parses back to the same path without Progress', () => {
    fc.assert(
      fc.property(arbCloudPath, fc.uuid(), (path, userId) => {
        const row = toPathInsertRow(userId, path)
        expect(row.user_id).toBe(userId)
        expect(row.hobby_id).toBe(normalizeHobby(path.record.tree.hobby))
        expect(parsePathRow(viaJson(row))).toEqual({
          ...path,
          progress: { completed: [], quests: {} },
          completedAt: {},
          ...emptyQuestData(),
        })
      }),
      RUNS,
    )
  })
})

interface ProgressCase {
  tree: SkillTree
  progress: Progress
  completedAt: CompletedAt
  quest: QuestData
}

/** Progress valid for a tree with timestamps for a random subset of its completed Nodes. */
const arbProgressCase: fc.Arbitrary<ProgressCase> = arbValidTree.chain(tree =>
  arbProgress(tree).chain((progress) => {
    const count = progress.completed.length
    return fc
      .record({
        stamped: fc.subarray(progress.completed),
        stamps: fc.array(arbStamp, { minLength: count, maxLength: count }),
        quest: arbQuestData(tree, progress),
      })
      .map(({ stamped, stamps, quest }): ProgressCase => ({
        tree,
        progress,
        completedAt: Object.fromEntries(stamped.map((id, index): [string, number] => [id, stamps[index] ?? 0])),
        quest,
      }))
  }),
)

// Feature: accounts-cloud-save, Property 2: Progress_Row round trip
// **Validates: Requirements 6.12**
describe('Property 2: Progress_Row round trip', () => {
  it('toProgressRow then parseProgressRow returns an equal Progress and equal Completion_Timestamps', () => {
    fc.assert(
      fc.property(arbProgressCase, fc.uuid(), fc.uuid(), fc.boolean(), ({ tree, progress, completedAt, quest }, pathId, userId, json) => {
        const row = toProgressRow(pathId, userId, progress, completedAt, quest)
        expect(row.path_id).toBe(pathId)
        expect(row.user_id).toBe(userId)

        const parsed = parseProgressRow(json ? viaJson(row) : row, tree)

        expect(parsed.progress.completed).toEqual(progress.completed)
        expect(parsed.progress.quests).toEqual(progress.quests)
        expect(parsed.completedAt).toEqual(completedAt)
        expect(parsed.questTicks).toEqual(quest.questTicks)
        expect(parsed.dailyPick).toEqual(quest.dailyPick)
        expect(parsed.dailyBonusCount).toBe(quest.dailyBonusCount)
      }),
      RUNS,
    )
  })
})

const arbTriple: fc.Arbitrary<QuestTriple<boolean>> = fc.tuple(fc.boolean(), fc.boolean(), fc.boolean())

interface DirtyRowCase {
  tree: SkillTree
  known: Set<string>
  /** Tree-only Progress the row was built from. */
  progress: Progress
  /** Timestamps of tree Nodes in the row, completed or not. */
  treeStamps: [string, number][]
  /** The row with foreign ids, repeated ids and stray timestamps mixed in. */
  dirty: Record<string, unknown>
  /** The same row with the foreign ids removed beforehand. */
  clean: Record<string, unknown>
}

const arbDirtyRowCase: fc.Arbitrary<DirtyRowCase> = arbValidTree.chain((tree) => {
  const ids = [...new Set(allNodes(tree).map(node => node.id))]
  const known = new Set(ids)
  const foreign = fc
    .oneof(arbId, fc.string(), fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty'))
    .filter(id => !known.has(id))
  return fc
    .record({
      progress: arbProgress(tree),
      stampedIds: fc.subarray(ids),
      stamps: fc.array(arbStamp, { minLength: ids.length, maxLength: ids.length }),
      foreignCompleted: fc.array(foreign, { maxLength: 6 }),
      foreignQuests: fc.uniqueArray(fc.tuple(foreign, arbTriple), { selector: ([id]) => id, maxLength: 6 }),
      foreignStamps: fc.uniqueArray(fc.tuple(foreign, arbStamp), { selector: ([id]) => id, maxLength: 6 }),
      repeat: fc.boolean(),
    })
    .map(({ progress, stampedIds, stamps, foreignCompleted, foreignQuests, foreignStamps, repeat }): DirtyRowCase => {
      const treeStamps = stampedIds.map((id, index): [string, number] => [id, stamps[index] ?? 0])
      const base = { path_id: 'path-1', user_id: 'user-1' }
      return {
        tree,
        known,
        progress,
        treeStamps,
        dirty: {
          ...base,
          completed: [
            ...foreignCompleted,
            ...progress.completed,
            ...(repeat ? progress.completed : []),
            ...foreignCompleted.slice(0, 1),
          ],
          quests: Object.fromEntries([...foreignQuests, ...Object.entries(progress.quests)]),
          completed_at: Object.fromEntries([...foreignStamps, ...treeStamps]),
        },
        clean: {
          ...base,
          completed: [...progress.completed],
          quests: { ...progress.quests },
          completed_at: Object.fromEntries(treeStamps),
        },
      }
    })
})

// Feature: accounts-cloud-save, Property 3: Loaded Progress holds only Nodes of the tree
// **Validates: Requirements 6.10**
describe('Property 3: Loaded Progress holds only Nodes of the tree', () => {
  it('foreign ids, repeated ids and stray timestamps are dropped and change no XP', () => {
    fc.assert(
      fc.property(arbDirtyRowCase, ({ tree, known, progress, treeStamps, dirty, clean }) => {
        const parsed = parseProgressRow(dirty, tree)
        const fromClean = parseProgressRow(clean, tree)

        // Only Nodes of the tree, each once.
        expect(parsed.progress.completed.every(id => known.has(id))).toBe(true)
        expect(new Set(parsed.progress.completed).size).toBe(parsed.progress.completed.length)
        expect(Object.keys(parsed.progress.quests).every(id => known.has(id))).toBe(true)
        expect(Object.getPrototypeOf(parsed.progress.quests)).toBe(Object.prototype)

        // Timestamps only for completed Nodes of the tree.
        const done = new Set(parsed.progress.completed)
        expect(Object.keys(parsed.completedAt).every(id => done.has(id))).toBe(true)
        expect(Object.entries(parsed.completedAt).sort()).toEqual(
          treeStamps.filter(([id]) => progress.completed.includes(id)).sort(),
        )

        // Nothing of the tree is lost.
        expect(parsed.progress.completed).toEqual(progress.completed)
        expect(parsed.progress.quests).toEqual(progress.quests)

        // The same XP as the row without the foreign ids.
        expect(xpFor(tree, parsed.progress)).toBe(xpFor(tree, fromClean.progress))
        const tickedQuests = Object.values(progress.quests).reduce((sum, triple) => sum + triple.filter(Boolean).length, 0)
        expect(xpFor(tree, parsed.progress)).toBe(
          progress.completed.length * XP_PER_NODE + tickedQuests * XP_PER_QUEST,
        )
        expect(parsed).toEqual(fromClean)
      }),
      RUNS,
    )
  })
})
