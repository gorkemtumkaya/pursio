import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { QuestTriple, SkillTree } from '../../shared/types/skill-tree'
import { candidateQuests } from '../../shared/utils/daily-pick'
import { applyProfileToTree, knownNodeIds } from '../../shared/utils/known-nodes'
import {
  activeSectionIndex,
  completionPercent,
  deriveNodeStates,
  emptyProgress,
  findCurrentNodeId,
  markComplete,
  openNodes,
} from '../../shared/utils/progress-engine'
import { headStartXp, xpFor } from '../../shared/utils/xp'
import { arbProgress, arbTreeAndProfile } from '../arbitraries'

const RUNS = { numRuns: 300 }

interface Case {
  /** Aligned, as every reader holds it. */
  tree: SkillTree
  /** The same tree with no knownOptionId at all: what the code did before this spec. */
  stripped: SkillTree
  known: string[]
  progress: Progress
  bonus: number
}

const arbCase: fc.Arbitrary<Case> = arbTreeAndProfile.chain(({ tree, profile }) => {
  const aligned = applyProfileToTree(tree, profile).tree
  return fc.record({
    progress: arbProgress(aligned),
    bonus: fc.nat({ max: 10 }),
  }).map(({ progress, bonus }) => ({
    tree: aligned,
    stripped: applyProfileToTree(aligned, null).tree,
    known: knownNodeIds(aligned),
    progress,
    bonus,
  }))
})

function without(progress: Progress, ids: readonly string[]): Progress {
  const drop = new Set(ids)
  return {
    completed: progress.completed.filter(id => !drop.has(id)),
    quests: Object.fromEntries(Object.entries(progress.quests).filter(([id]) => !drop.has(id))),
  }
}

function withKnown(progress: Progress, ids: readonly string[]): Progress {
  const full: QuestTriple<boolean> = [true, true, true]
  return {
    completed: [...progress.completed, ...ids],
    quests: { ...progress.quests, ...Object.fromEntries(ids.map(id => [id, full])) },
  }
}

describe('path-intake known node cases', () => {
  it('include paths with several Known_Nodes, so the properties below are not vacuous', () => {
    const counts = fc.sample(arbCase, { numRuns: 300, seed: 11 }).map(item => item.known.length)
    expect(counts.filter(count => count >= 2).length).toBeGreaterThan(30)
    expect(counts.filter(count => count === 0).length).toBeGreaterThan(10)
  })
})

// Feature: path-intake, Property 6: Head start XP
// **Validates: Requirements 9.3, 9.4, 9.5, 9.7, 9.8, 10.3, 16.3**
describe('Property 6: Head start XP', () => {
  it('is 30 per Known_Node, at most 6, and the rest of the XP is the XP of the other Nodes', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, stripped, known, progress, bonus }) => {
        expect(known.length).toBeLessThanOrEqual(6)
        expect(headStartXp(tree)).toBe(30 * known.length)
        // The XP of the Nodes that are not known, by the rules of today.
        expect(xpFor(tree, progress, bonus) - headStartXp(tree)).toBe(xpFor(stripped, without(progress, known), bonus))
      }),
      RUNS,
    )
  })

  it('does not change when Known_Nodes are listed as completed or every Refresher_Quest is ticked', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, known, progress, bonus }) => {
        expect(xpFor(tree, withKnown(progress, known), bonus)).toBe(xpFor(tree, progress, bonus))
        expect(xpFor(tree, without(progress, known), bonus)).toBe(xpFor(tree, progress, bonus))
      }),
      RUNS,
    )
  })

  it('stays after a reset, and a path with no Known_Node has the XP of today', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, stripped, progress, bonus }) => {
        expect(xpFor(tree, emptyProgress())).toBe(headStartXp(tree))
        expect(headStartXp(stripped)).toBe(0)
        expect(xpFor(stripped, progress, bonus)).toBe(xpFor(applyProfileToTree(stripped, null).tree, progress, bonus))
      }),
      RUNS,
    )
  })
})

// Feature: path-intake, Property 7: Effective completion
// **Validates: Requirements 9.2, 9.7, 10.1, 10.4, 12.4, 16.11**
describe('Property 7: Effective completion', () => {
  it('reads a Known_Node exactly as a Node listed in completed', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, stripped, known, progress }) => {
        const listed: Progress = { completed: [...progress.completed, ...known], quests: progress.quests }
        expect(deriveNodeStates(tree, progress)).toEqual(deriveNodeStates(stripped, listed))
        expect(findCurrentNodeId(tree, progress)).toBe(findCurrentNodeId(stripped, listed))
        expect(openNodes(tree, progress).map(node => node.id)).toEqual(openNodes(stripped, listed).map(node => node.id))
        expect(completionPercent(tree, progress)).toBe(completionPercent(stripped, listed))
        expect(activeSectionIndex(tree, progress)).toBe(activeSectionIndex(stripped, listed))
      }),
      RUNS,
    )
  })

  it('never completes a Known_Node again, and never picks a Refresher_Quest', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, known, progress }) => {
        for (const id of known) {
          const result = markComplete(tree, progress, id)
          expect(result.completed).toBe(false)
          expect(result.progress).toBe(progress)
        }
        const picked = new Set(candidateQuests(tree, progress).map(quest => quest.id))
        for (const id of known) expect(picked.has(id)).toBe(false)
        expect(known.includes(findCurrentNodeId(tree, progress) ?? '')).toBe(false)
      }),
      RUNS,
    )
  })

  it('keeps every Known_Node completed after a reset', () => {
    fc.assert(
      fc.property(arbCase, ({ tree, known }) => {
        const states = deriveNodeStates(tree, emptyProgress())
        for (const id of known) expect(states.get(id)).toBe('completed')
      }),
      RUNS,
    )
  })
})
