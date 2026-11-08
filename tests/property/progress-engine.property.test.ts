// Property tests for shared/utils/progress-engine.ts (spec: skill-path-ui).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { NodeState, Progress } from '../../shared/types/progress'
import type { SkillTree } from '../../shared/types/skill-tree'
import {
  deriveNodeStates,
  emptyProgress,
  findCurrentNodeId,
  isAvailable,
  markComplete,
} from '../../shared/utils/progress-engine'
import { allNodes, arbId, arbLinearMainTree, arbProgress, arbValidTree, mainNodes } from '../arbitraries'

const RUNS = { numRuns: 200 }

const arbTreeAndProgress: fc.Arbitrary<{ tree: SkillTree; progress: Progress }> = arbValidTree.chain(tree =>
  arbProgress(tree).map(progress => ({ tree, progress })),
)

/** Independent oracle: applies the Requirement 4.1 rule table in order. */
function oracleStates(tree: SkillTree, progress: Progress): Record<string, NodeState> {
  const nodes = allNodes(tree)
  const completed = (id: string): boolean => progress.completed.includes(id)
  const available = (id: string, prerequisites: string[]): boolean =>
    !completed(id) && prerequisites.every(completed)
  const current = nodes.find(node => !node.optional && available(node.id, node.prerequisites))
  const states: Record<string, NodeState> = {}
  for (const node of nodes) {
    if (completed(node.id)) states[node.id] = 'completed'
    else if (current !== undefined && node.id === current.id) states[node.id] = 'current'
    else if (node.optional && available(node.id, node.prerequisites)) states[node.id] = 'side_quest'
    else if (node.milestone) states[node.id] = 'milestone'
    else states[node.id] = 'locked'
  }
  return states
}

// Feature: skill-path-ui, Property 11: Node states match the rule table
// **Validates: Requirements 4.1, 4.2, 4.3, 4.5, 4.8**
describe('Property 11: Node states match the rule table', () => {
  it('assigns every Node the state the rule table gives, with at most one current Main_Node', () => {
    fc.assert(
      fc.property(arbTreeAndProgress, ({ tree, progress }) => {
        const states = deriveNodeStates(tree, progress)
        const expected = oracleStates(tree, progress)
        const nodes = allNodes(tree)

        expect(states.size).toBe(nodes.length)
        expect(Object.fromEntries(states)).toEqual(expected)

        const currentIds = [...states].filter(([, state]) => state === 'current').map(([id]) => id)
        expect(currentIds.length).toBeLessThanOrEqual(1)
        for (const id of currentIds) {
          expect(nodes.find(node => node.id === id)?.optional).toBe(false)
        }
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 12: Ready nodes have their prerequisites done
// **Validates: Requirements 4.4, 4.9**
describe('Property 12: Ready nodes have their prerequisites done', () => {
  it('only marks a Node current or side_quest when all its prerequisites are completed', () => {
    fc.assert(
      fc.property(arbTreeAndProgress, ({ tree, progress }) => {
        const states = deriveNodeStates(tree, progress)
        const done = new Set(progress.completed)
        for (const node of allNodes(tree)) {
          const state = states.get(node.id)
          const prerequisitesDone = node.prerequisites.every(id => done.has(id))
          if (state === 'current' || state === 'side_quest') {
            expect(prerequisitesDone).toBe(true)
          }
          if (node.optional && !prerequisitesDone) {
            expect(state).not.toBe('side_quest')
          }
        }
      }),
      RUNS,
    )
  })
})

/** Tree, Progress and one available Node id to complete; runs with no available Node are filtered out. */
const arbTreeProgressAndAvailable: fc.Arbitrary<{ tree: SkillTree; progress: Progress; id: string }> =
  arbTreeAndProgress
    .map(({ tree, progress }) => {
      const done = new Set(progress.completed)
      const ids = allNodes(tree)
        .filter(node => !done.has(node.id) && node.prerequisites.every(id => done.has(id)))
        .map(node => node.id)
      return { tree, progress, ids }
    })
    .filter(({ ids }) => ids.length > 0)
    .chain(({ tree, progress, ids }) => fc.constantFrom(...ids).map(id => ({ tree, progress, id })))

// Feature: skill-path-ui, Property 13: Completing a node unlocks exactly the satisfied nodes
// **Validates: Requirements 4.6, 4.7, 9.1**
describe('Property 13: Completing a node unlocks exactly the satisfied nodes', () => {
  it('adds exactly the completed id, keeps quests, and makes available exactly the satisfied nodes', () => {
    fc.assert(
      fc.property(arbTreeProgressAndAvailable, ({ tree, progress, id }) => {
        const result = markComplete(tree, progress, id)
        expect(result.completed).toBe(true)
        const next = result.progress

        const before = new Set(progress.completed)
        const after = new Set(next.completed)
        expect(before.has(id)).toBe(false)
        expect([...after].sort()).toEqual([...before, id].sort())

        expect(next.quests).toEqual(progress.quests)

        const nodes = allNodes(tree)
        const expectedAvailable = nodes
          .filter(node => !after.has(node.id) && node.prerequisites.every(p => after.has(p)))
          .map(node => node.id)
          .sort()
        const actualAvailable = nodes
          .filter(node => isAvailable(tree, next, node.id))
          .map(node => node.id)
          .sort()
        expect(actualAvailable).toEqual(expectedAvailable)
      }),
      { numRuns: Math.max(100, RUNS.numRuns) },
    )
  })
})

type InvalidKind = 'completed' | 'unknown' | 'unavailable'

/** Tree, Progress and an id that is already completed, absent from the tree, or not available. */
const arbTreeProgressAndInvalid: fc.Arbitrary<{
  tree: SkillTree
  progress: Progress
  kind: InvalidKind
  id: string
}> = arbTreeAndProgress.chain(({ tree, progress }) => {
  const done = new Set(progress.completed)
  const nodes = allNodes(tree)
  const treeIds = new Set(nodes.map(node => node.id))
  const completedIds = nodes.filter(node => done.has(node.id)).map(node => node.id)
  const unavailableIds = nodes
    .filter(node => !done.has(node.id) && !node.prerequisites.every(p => done.has(p)))
    .map(node => node.id)

  const options: fc.Arbitrary<{ kind: InvalidKind; id: string }>[] = [
    arbId.filter(id => !treeIds.has(id)).map(id => ({ kind: 'unknown' as const, id })),
  ]
  if (completedIds.length > 0) {
    options.push(fc.constantFrom(...completedIds).map(id => ({ kind: 'completed' as const, id })))
  }
  if (unavailableIds.length > 0) {
    options.push(fc.constantFrom(...unavailableIds).map(id => ({ kind: 'unavailable' as const, id })))
  }
  return fc.oneof(...options).map(({ kind, id }) => ({ tree, progress, kind, id }))
})

// Feature: skill-path-ui, Property 14: Invalid completions change nothing
// **Validates: Requirements 4.10, 4.13**
describe('Property 14: Invalid completions change nothing', () => {
  it('returns completed: false and the same, unchanged Progress for completed, unknown or unavailable ids', () => {
    const seen = new Set<InvalidKind>()
    fc.assert(
      fc.property(arbTreeProgressAndInvalid, ({ tree, progress, kind, id }) => {
        seen.add(kind)
        const snapshot = structuredClone(progress)
        const result = markComplete(tree, progress, id)
        expect(result.completed).toBe(false)
        expect(result.progress).toBe(progress)
        expect(result.progress).toEqual(snapshot)
      }),
      { numRuns: Math.max(100, RUNS.numRuns) },
    )
    expect([...seen].sort()).toEqual(['completed', 'unavailable', 'unknown'])
  })

  it('is idempotent: completing the same id twice changes nothing the second time', () => {
    fc.assert(
      fc.property(arbTreeProgressAndAvailable, ({ tree, progress, id }) => {
        const first = markComplete(tree, progress, id)
        const snapshot = structuredClone(first.progress)
        const second = markComplete(tree, first.progress, id)
        expect(second.completed).toBe(false)
        expect(second.progress).toBe(first.progress)
        expect(second.progress).toEqual(snapshot)
      }),
      { numRuns: Math.max(100, RUNS.numRuns) },
    )
  })
})
// Feature: skill-path-ui, Property 15: Walking the path finishes in main-node-count steps
// **Validates: Requirements 4.11**
describe('Property 15: Walking the path finishes in main-node-count steps', () => {
  it('completes every Main_Node in exactly mainNodes.length successful steps, then has no Current_Node', () => {
    fc.assert(
      fc.property(arbLinearMainTree, (tree) => {
        const mains = mainNodes(tree)
        let progress = emptyProgress()
        for (let step = 0; step < mains.length; step++) {
          const currentId = findCurrentNodeId(tree, progress)
          expect(currentId).not.toBeNull()
          const result = markComplete(tree, progress, currentId as string)
          expect(result.completed).toBe(true)
          progress = result.progress
        }
        const done = new Set(progress.completed)
        for (const node of mains) expect(done.has(node.id)).toBe(true)
        expect(findCurrentNodeId(tree, progress)).toBeNull()
      }),
      { numRuns: Math.max(100, RUNS.numRuns) },
    )
  })
})
