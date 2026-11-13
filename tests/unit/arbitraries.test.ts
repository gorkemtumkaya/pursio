// Sanity checks that the shared generators produce what they claim.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SkillTree } from '../../shared/types/skill-tree'
import {
  allNodes,
  arbCloudPath,
  arbDailyPick,
  arbQuestData,
  arbTickTimes,
  arbLinearMainTree,
  arbPathTree,
  arbProgress,
  arbShapeTree,
  arbValidTree,
  descendantsOf,
  documentPositions,
  mainNodes,
  sideQuestNodes,
} from '../arbitraries'

const RUNS = { numRuns: 100 }

function hasSizes(tree: SkillTree): boolean {
  return tree.sections.length >= 1
    && tree.sections.length <= 3
    && tree.sections.every(section => section.nodes.length >= 1 && section.nodes.length <= 15)
}

function hasUniqueIds(tree: SkillTree): boolean {
  const ids = allNodes(tree).map(node => node.id)
  return new Set(ids).size === ids.length
}

function prerequisitesKnown(tree: SkillTree): boolean {
  const ids = new Set(allNodes(tree).map(node => node.id))
  return allNodes(tree).every(node => node.prerequisites.every(id => ids.has(id)))
}

/** Kahn's algorithm: acyclic when every node can be removed. */
function isAcyclic(tree: SkillTree): boolean {
  const nodes = allNodes(tree)
  const remaining = new Map(nodes.map(node => [node.id, new Set(node.prerequisites)]))
  let progressed = true
  while (progressed && remaining.size > 0) {
    progressed = false
    for (const [id, prerequisites] of remaining) {
      if ([...prerequisites].every(p => !remaining.has(p))) {
        remaining.delete(id)
        progressed = true
      }
    }
  }
  return remaining.size === 0
}

function isNonBlank(value: string): boolean {
  return /\S/.test(value)
}

describe('helpers', () => {
  const tree: SkillTree = {
    hobby: 'h',
    mascot: { set: 'explorer' },
    sections: [
      {
        title: 's1',
        level: 'beginner',
        nodes: [
          { id: 'a', title: 'A', description: 'd', prerequisites: [], optional: false, milestone: false, quests: ['q', 'q', 'q'] },
          { id: 'b', title: 'B', description: 'd', prerequisites: ['a'], optional: true, milestone: false, quests: ['q', 'q', 'q'] },
        ],
      },
      {
        title: 's2',
        level: 'intermediate',
        nodes: [
          { id: 'c', title: 'C', description: 'd', prerequisites: ['b'], optional: false, milestone: true, quests: ['q', 'q', 'q'] },
          { id: 'd', title: 'D', description: 'd', prerequisites: ['a'], optional: false, milestone: false, quests: ['q', 'q', 'q'] },
        ],
      },
    ],
  }

  it('gives document positions in Section then Node order', () => {
    expect([...documentPositions(tree)]).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]])
  })

  it('lists Main_Nodes and Side_Quest_Nodes', () => {
    expect(mainNodes(tree).map(node => node.id)).toEqual(['a', 'c', 'd'])
    expect(sideQuestNodes(tree).map(node => node.id)).toEqual(['b'])
  })

  it('finds direct and indirect descendants', () => {
    expect([...descendantsOf(tree, 'a')].sort()).toEqual(['b', 'c', 'd'])
    expect([...descendantsOf(tree, 'b')]).toEqual(['c'])
    expect(descendantsOf(tree, 'd').size).toBe(0)
  })
})

describe('arbitraries', () => {
  it('arbShapeTree gives shape-valid trees', () => {
    fc.assert(
      fc.property(arbShapeTree, (tree) => {
        expect(hasSizes(tree)).toBe(true)
        expect(isNonBlank(tree.hobby) && isNonBlank(tree.mascot.set)).toBe(true)
        for (const node of allNodes(tree)) {
          expect(node.quests).toHaveLength(3)
          expect([node.title, node.description, ...node.quests].every(isNonBlank)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('arbValidTree gives unique ids, known prerequisites and no cycles', () => {
    fc.assert(
      fc.property(arbValidTree, (tree) => {
        expect(hasSizes(tree)).toBe(true)
        expect(hasUniqueIds(tree)).toBe(true)
        expect(prerequisitesKnown(tree)).toBe(true)
        expect(isAcyclic(tree)).toBe(true)
      }),
      RUNS,
    )
  })

  it('arbValidTree sometimes has prerequisites that point later', () => {
    const samples = fc.sample(arbValidTree, { numRuns: 200, seed: 42 })
    const pointsLater = samples.some((tree) => {
      const positions = documentPositions(tree)
      return allNodes(tree).some(node =>
        node.prerequisites.some(id => (positions.get(id) ?? -1) > (positions.get(node.id) ?? -1)))
    })
    expect(pointsLater).toBe(true)
  })

  it('arbPathTree satisfies P1 and P2 and is valid', () => {
    fc.assert(
      fc.property(arbPathTree, (tree) => {
        expect(hasSizes(tree)).toBe(true)
        expect(hasUniqueIds(tree)).toBe(true)
        expect(isAcyclic(tree)).toBe(true)
        const positions = documentPositions(tree)
        const byId = new Map(allNodes(tree).map(node => [node.id, node]))
        for (const node of allNodes(tree)) {
          const own = positions.get(node.id) ?? -1
          for (const id of node.prerequisites) {
            expect(positions.get(id) ?? Infinity).toBeLessThan(own)
            if (!node.optional) expect(byId.get(id)?.optional).toBe(false)
          }
          if (node.optional) expect(node.prerequisites.length).toBeGreaterThan(0)
          if (node.milestone) expect(node.optional).toBe(false)
        }
        for (const section of tree.sections) {
          section.nodes.slice(0, -1).forEach(node => expect(node.milestone).toBe(false))
        }
      }),
      RUNS,
    )
  })

  it('arbPathTree produces closing milestones and side quests sharing an anchor', () => {
    const samples = fc.sample(arbPathTree, { numRuns: 200, seed: 42 })
    const closingMilestone = samples.some(tree =>
      tree.sections.some(section => section.nodes[section.nodes.length - 1]?.milestone === true))
    const sharedAnchor = samples.some((tree) => {
      const anchors = sideQuestNodes(tree).map(node => node.prerequisites[0])
      return new Set(anchors).size < anchors.length
    })
    expect(closingMilestone).toBe(true)
    expect(sharedAnchor).toBe(true)
  })

  it('arbLinearMainTree keeps side quests out of Main_Node ancestry', () => {
    fc.assert(
      fc.property(arbLinearMainTree, (tree) => {
        expect(hasUniqueIds(tree)).toBe(true)
        expect(isAcyclic(tree)).toBe(true)
        for (const side of sideQuestNodes(tree)) {
          const reachedMain = allNodes(tree).some(node => !node.optional && descendantsOf(tree, side.id).has(node.id))
          expect(reachedMain).toBe(false)
        }
      }),
      RUNS,
    )
  })

  it('arbProgress uses only tree ids, without repeats', () => {
    fc.assert(
      fc.property(arbValidTree.chain(tree => fc.tuple(fc.constant(tree), arbProgress(tree))), ([tree, progress]) => {
        const ids = new Set(allNodes(tree).map(node => node.id))
        expect(new Set(progress.completed).size).toBe(progress.completed.length)
        expect(progress.completed.every(id => ids.has(id))).toBe(true)
        for (const [id, triple] of Object.entries(progress.quests)) {
          expect(ids.has(id)).toBe(true)
          expect(triple).toHaveLength(3)
        }
      }),
      RUNS,
    )
  })

  it('arbQuestData ticks only ticked quests and picks distinct quests of the tree', () => {
    fc.assert(
      fc.property(arbValidTree.chain(tree => fc.tuple(fc.constant(tree), arbProgress(tree))).chain(([tree, progress]) =>
        fc.tuple(fc.constant(tree), fc.constant(progress), arbQuestData(tree, progress))), ([tree, progress, data]) => {
        for (const [id, triple] of Object.entries(data.questTicks)) {
          triple.forEach((time, index) => {
            if (time !== null) expect(progress.quests[id]?.[index]).toBe(true)
          })
        }
        const ids = new Set(allNodes(tree).map(node => node.id))
        const quests = data.dailyPick?.quests ?? []
        expect(quests.length).toBeLessThanOrEqual(3)
        expect(new Set(quests.map(q => `${q.id}:${q.index}`)).size).toBe(quests.length)
        expect(quests.every(q => ids.has(q.id))).toBe(true)
        expect(data.dailyPick === null || /^\d{4}-\d{2}-\d{2}$/.test(data.dailyPick.day)).toBe(true)
        expect(Number.isInteger(data.dailyBonusCount) && data.dailyBonusCount >= 0).toBe(true)
      }),
      RUNS,
    )
  })

  it('arbDailyPick and arbTickTimes give bounded values', () => {
    fc.assert(
      fc.property(arbValidTree.chain(tree => arbDailyPick(tree)), (pick) => {
        expect(pick.quests.length).toBeLessThanOrEqual(3)
      }),
      RUNS,
    )
    fc.assert(fc.property(arbTickTimes, (times) => {
      expect(times.every(Number.isFinite)).toBe(true)
    }), RUNS)
  })

  it('arbCloudPath carries consistent quest data', () => {
    fc.assert(
      fc.property(arbCloudPath, (path) => {
        const ids = new Set(allNodes(path.record.tree).map(node => node.id))
        for (const [id, triple] of Object.entries(path.questTicks)) {
          expect(ids.has(id)).toBe(true)
          triple.forEach((time, index) => {
            if (time !== null) expect(path.progress.quests[id]?.[index]).toBe(true)
          })
        }
        expect(path.dailyBonusCount).toBeGreaterThanOrEqual(0)
      }),
      RUNS,
    )
  })
})
