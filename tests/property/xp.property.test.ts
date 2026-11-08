// Feature: skill-path-ui, Property 26: XP and level math
// **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.9**
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillTree } from '../../shared/types/skill-tree'
import { levelFor, xpFor, xpSummary } from '../../shared/utils/xp'
import { allNodes, arbId, arbProgress, arbValidTree } from '../arbitraries'

const RUNS = { numRuns: 200 }

/** The Requirement 11.2 table, written out independently of LEVEL_THRESHOLDS. */
function expectedLevel(xp: number): number {
  if (xp < 100) return 1
  if (xp < 200) return 2
  if (xp < 400) return 3
  if (xp < 700) return 4
  return 5
}
const NEXT_LEVEL_XP: Record<number, number> = { 1: 100, 2: 200, 3: 400, 4: 700 }

/** Tree, plus Progress whose completed list mixes tree ids with foreign ids. */
const arbTreeAndProgress: fc.Arbitrary<{ tree: SkillTree; progress: Progress; treeIds: Set<string> }> =
  arbValidTree.chain((tree) => {
    const treeIds = new Set(allNodes(tree).map(node => node.id))
    const arbForeign = fc.uniqueArray(arbId.filter(id => !treeIds.has(id)), { maxLength: 6 })
    return fc.tuple(arbProgress(tree), arbForeign).chain(([progress, foreign]) =>
      fc.shuffledSubarray([...progress.completed, ...foreign], {
        minLength: progress.completed.length + foreign.length,
      }).map(completed => ({ tree, treeIds, progress: { ...progress, completed } })),
    )
  })

/** Summary for an arbitrary XP value, built from a tree with enough nodes. */
function summaryForXp(xp: number) {
  const count = xp / 50
  const nodes = Array.from({ length: count }, (_, i) => ({ id: `n${i}` }))
  const tree = { hobby: 'x', sections: [{ nodes }] } as unknown as SkillTree
  return xpSummary(tree, { completed: nodes.map(n => n.id), quests: {} })
}

describe('Property 26: XP and level math', () => {
  it('xpFor is 50 × the completed ids that exist in the tree, ignoring foreign ids', () => {
    fc.assert(
      fc.property(arbTreeAndProgress, ({ tree, progress, treeIds }) => {
        const present = progress.completed.filter(id => treeIds.has(id)).length
        expect(xpFor(tree, progress)).toBe(50 * present)
        expect(xpFor(tree, { completed: [], quests: {} })).toBe(0)
      }),
      RUNS,
    )
  })

  it('levelFor matches the threshold table for any XP ≥ 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (xp) => {
        expect(levelFor(xp)).toBe(expectedLevel(xp))
      }),
      RUNS,
    )
  })

  it('levelFor is exact at every threshold boundary', () => {
    for (const [xp, level] of [[0, 1], [99, 1], [100, 2], [199, 2], [200, 3], [399, 3], [400, 4], [699, 4], [700, 5]] as const) {
      expect(levelFor(xp)).toBe(level)
    }
  })

  it('xpSummary gives the label and bar fill for the level', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 40 }), (count) => {
        const xp = count * 50
        const summary = summaryForXp(xp)
        const level = expectedLevel(xp)
        expect(summary.xp).toBe(xp)
        expect(summary.level).toBe(level)
        if (level < 5) {
          const next = NEXT_LEVEL_XP[level] as number
          expect(summary.nextLevelXp).toBe(next)
          expect(summary.label).toBe(`${xp} / ${next} XP`)
          expect(summary.barPercent).toBe(Math.round((100 * xp) / next))
        }
        else {
          expect(summary.nextLevelXp).toBeNull()
          expect(summary.label).toBe(`${xp} XP`)
          expect(summary.barPercent).toBe(100)
        }
      }),
      RUNS,
    )
  })

  it('adding any id to completed never lowers the level', () => {
    fc.assert(
      fc.property(
        arbTreeAndProgress.chain(value =>
          fc.tuple(fc.constant(value), fc.oneof(fc.constantFrom(...value.treeIds), arbId))),
        ([{ tree, progress }, id]) => {
          const before = xpSummary(tree, progress)
          const completed = progress.completed.includes(id) ? progress.completed : [...progress.completed, id]
          const after = xpSummary(tree, { ...progress, completed })
          expect(after.xp).toBeGreaterThanOrEqual(before.xp)
          expect(after.level).toBeGreaterThanOrEqual(before.level)
        },
      ),
      RUNS,
    )
  })
})
