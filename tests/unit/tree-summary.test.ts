import { describe, expect, it } from 'vitest'
import type { FinalProfile } from '../../shared/types/learner-profile'
import type { SkillTree } from '../../shared/types/skill-tree'
import { applyProfileToTree } from '../../shared/utils/known-nodes'
import { summarizeTree } from '../../app/utils/tree-summary'
import { sampleTree } from '../support/tree-deps'

const GOALS = [
  { id: 'first-v4', label: 'Send a V4', finishLine: 'Send your first V4 outdoors' },
  { id: 'fun', label: 'Just have fun', finishLine: 'Climb 20 problems in one session' },
]

function profile(overrides: Partial<FinalProfile>): FinalProfile {
  return { level: null, goal: null, avoid: [], taste: [], known: [], goalOptions: GOALS, ...overrides }
}

/** The sample tree with its first two main Nodes built for known skills, as the generator is asked to. */
function treeWithKnown(): SkillTree {
  const tree = sampleTree()
  const ids = ['gear', 'falls']
  let k = 0
  return {
    ...tree,
    sections: tree.sections.map((section, s) => ({
      ...section,
      nodes: section.nodes.map(node => (s === 0 && !node.optional && !node.milestone && k < ids.length ? { ...node, knownOptionId: ids[k++] } : node)),
    })),
  }
}

const KNOWN = [
  { id: 'gear', label: 'Picking shoes and chalk' },
  { id: 'falls', label: 'Falling safely' },
  { id: 'no-node', label: 'Reading routes' },
]

describe('summarizeTree (spec: path-intake, Requirement 12)', () => {
  it('shows the finish line and the head start of the skills that have a Node', () => {
    const { tree, profile: stored } = applyProfileToTree(treeWithKnown(), profile({ goal: GOALS[0] ?? null, known: KNOWN }))
    const summary = summarizeTree(tree, stored)
    expect(summary.finishLine).toBe('Send your first V4 outdoors')
    expect(summary.headStartXp).toBe(60)
    // The third skill has no Node: neither listed nor counted (decision 31).
    expect(summary.knownLabels).toEqual(['Picking shoes and chalk', 'Falling safely'])
    // "First up" skips the Known_Nodes; the counts include them.
    const mains = tree.sections[0]?.nodes.filter(node => !node.optional) ?? []
    expect(summary.firstSkill).toBe(mains[2]?.title)
    expect(summary.skills).toBe(tree.sections.flatMap(section => section.nodes).length)
  })

  it('shows only the finish line for a goal without known skills', () => {
    const { tree, profile: stored } = applyProfileToTree(sampleTree(), profile({ goal: GOALS[1] ?? null }))
    expect(summarizeTree(tree, stored)).toMatchObject({ finishLine: 'Climb 20 problems in one session', headStartXp: 0, knownLabels: [] })
  })

  it('shows only the head start for known skills without a goal', () => {
    const { tree, profile: stored } = applyProfileToTree(treeWithKnown(), profile({ known: KNOWN }))
    expect(summarizeTree(tree, stored)).toMatchObject({ finishLine: null, headStartXp: 60 })
  })

  it('looks as today without a profile', () => {
    const tree = sampleTree()
    expect(summarizeTree(tree)).toMatchObject({
      finishLine: null,
      headStartXp: 0,
      knownLabels: [],
      firstSkill: tree.sections[0]?.nodes[0]?.title,
    })
  })
})
