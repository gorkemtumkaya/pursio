import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { HEAD_START_XP_PER_SKILL, applyProfileToTree, knownNodeIds } from '../../shared/utils/known-nodes'
import { finalNode, loadSkillTree } from '../../shared/utils/skill-tree-load'
import { allNodes, arbFinalProfile, arbFinalProfileWithGoal, arbPathTree, arbTreeAndProfile } from '../arbitraries'

const RUNS = { numRuns: 300 }

function titles(tree: SkillTree): string[] {
  return allNodes(tree).map(node => node.title)
}

/** The tree with its last Node forced to be a milestone or not. */
function withLastMilestone(tree: SkillTree, milestone: boolean): SkillTree {
  const lastIndex = tree.sections.length - 1
  return {
    ...tree,
    sections: tree.sections.map((section, s) =>
      s !== lastIndex
        ? section
        : { ...section, nodes: section.nodes.map((node, i) => (i === section.nodes.length - 1 ? { ...node, milestone, optional: false } : node)) },
    ),
  }
}

function renamed(tree: SkillTree, suffix: string): SkillTree {
  return {
    ...tree,
    sections: tree.sections.map(section => ({
      ...section,
      nodes: section.nodes.map(node => ({ ...node, title: `${node.title} ${suffix}` })),
    })),
  }
}

// Feature: path-intake, Property 4: Final milestone
// **Validates: Requirements 8.3, 8.4, 8.9, 16.4**
describe('Property 4: Final milestone', () => {
  it('accepts a last milestone with any title, and the saved title is exactly the Finish_Line', () => {
    fc.assert(
      fc.property(arbPathTree, arbFinalProfileWithGoal, (raw, profile) => {
        const tree = withLastMilestone(raw, true)
        expect(loadSkillTree(tree, { requireFinalMilestone: true }).ok).toBe(true)
        const saved = applyProfileToTree(tree, profile).tree
        expect(finalNode(saved)?.title).toBe(profile.goal?.finishLine)
        // Every other title is unchanged.
        expect(titles(saved).slice(0, -1)).toEqual(titles(tree).slice(0, -1))
      }),
      RUNS,
    )
  })

  it('rejects a tree whose last Node is not a milestone, naming that Node', () => {
    fc.assert(
      fc.property(arbPathTree, (raw) => {
        const tree = withLastMilestone(raw, false)
        const loaded = loadSkillTree(tree, { requireFinalMilestone: true })
        expect(loaded.ok).toBe(false)
        if (!loaded.ok) expect(loaded.errors).toEqual([{ kind: 'final_milestone', nodeId: finalNode(tree)?.id }])
        // Without the option the same tree loads, as today.
        expect(loadSkillTree(tree).ok).toBe(true)
      }),
      RUNS,
    )
  })

  it('changes no title for a profile without a goal, or no profile', () => {
    fc.assert(
      fc.property(arbPathTree, arbFinalProfile, (tree, profile) => {
        expect(titles(applyProfileToTree(tree, { ...profile, goal: null }).tree)).toEqual(titles(tree))
        expect(titles(applyProfileToTree(tree, null).tree)).toEqual(titles(tree))
      }),
      RUNS,
    )
  })
})

/** Main_Node that is not a milestone: the only place a Known_Node may be. */
function knownSpot(node: SkillNode): boolean {
  return !node.optional && !node.milestone
}

// Feature: path-intake, Property 5: Known skill repair
// **Validates: Requirements 8.7, 8.8, 9.1, 11.3, 16.5**
describe('Property 5: Known skill repair', () => {
  it('never throws, and leaves only valid, unique knownOptionIds on Main_Nodes that are not milestones', () => {
    fc.assert(
      fc.property(arbTreeAndProfile, ({ tree, profile }) => {
        const { tree: saved } = applyProfileToTree(tree, profile)
        const ids = new Set(profile.known.map(option => option.id))
        const carried = allNodes(saved).filter(node => Object.hasOwn(node, 'knownOptionId'))
        for (const node of carried) {
          expect(typeof node.knownOptionId).toBe('string')
          expect(ids.has(node.knownOptionId ?? '')).toBe(true)
          expect(knownSpot(node)).toBe(true)
        }
        const values = carried.map(node => node.knownOptionId)
        expect(new Set(values).size).toBe(values.length)
        expect(values.length).toBeLessThanOrEqual(6)
      }),
      RUNS,
    )
  })

  it('keeps an id on the first Node in document order that may hold it', () => {
    fc.assert(
      fc.property(arbTreeAndProfile, ({ tree, profile }) => {
        const { tree: saved } = applyProfileToTree(tree, profile)
        const ids = new Set(profile.known.map(option => option.id))
        // Reference: walk the input, keep the first eligible Node per id, at most 6.
        const expected = new Map<string, string>()
        for (const node of allNodes(tree)) {
          const id = node.knownOptionId
          if (typeof id !== 'string' || !ids.has(id) || expected.has(id) || !knownSpot(node) || expected.size >= 6) continue
          expected.set(id, node.id)
        }
        const actual = new Map(
          allNodes(saved)
            .filter(node => typeof node.knownOptionId === 'string')
            .map(node => [node.knownOptionId ?? '', node.id]),
        )
        expect(actual).toEqual(expected)
      }),
      RUNS,
    )
  })

  it('stores exactly the Known_Skills that kept a Node, in profile order, and their head start', () => {
    fc.assert(
      fc.property(arbTreeAndProfile, ({ tree, profile }) => {
        const { tree: saved, profile: stored } = applyProfileToTree(tree, profile)
        const kept = new Set(allNodes(saved).map(node => node.knownOptionId).filter((id): id is string => typeof id === 'string'))
        expect(stored?.known).toEqual(profile.known.filter(option => kept.has(option.id)))
        expect(knownNodeIds(saved).length * HEAD_START_XP_PER_SKILL).toBe((stored?.known.length ?? 0) * 30)
        // Everything but `known` is stored as sent.
        expect({ ...stored, known: [] }).toEqual({ ...profile, known: [] })
      }),
      RUNS,
    )
  })

  it('does not depend on titles, and matching titles alone make no Known_Node', () => {
    fc.assert(
      fc.property(arbTreeAndProfile, ({ tree, profile }) => {
        const goalless = { ...profile, goal: null }
        const plain = applyProfileToTree(tree, goalless)
        const other = applyProfileToTree(renamed(tree, 'x'), goalless)
        expect(knownNodeIds(other.tree)).toEqual(knownNodeIds(plain.tree))
        expect(other.profile).toEqual(plain.profile)
        // Titles equal to the labels, but no knownOptionId: nothing is known.
        const labels = profile.known.map(option => option.label)
        let i = 0
        const lookalike: SkillTree = {
          ...tree,
          sections: tree.sections.map(section => ({
            ...section,
            nodes: section.nodes.map(({ knownOptionId: _drop, ...node }) => ({ ...node, title: labels[i++ % Math.max(1, labels.length)] ?? node.title })),
          })),
        }
        expect(knownNodeIds(applyProfileToTree(lookalike, profile).tree)).toEqual([])
      }),
      RUNS,
    )
  })

  it('leaves no knownOptionId for a null profile, and is stable when applied to its own output', () => {
    fc.assert(
      fc.property(arbTreeAndProfile, ({ tree, profile }) => {
        expect(knownNodeIds(applyProfileToTree(tree, null).tree)).toEqual([])
        const once = applyProfileToTree(tree, profile)
        const twice = applyProfileToTree(once.tree, profile)
        expect(twice.tree).toEqual(once.tree)
        expect(twice.profile).toEqual(once.profile)
      }),
      RUNS,
    )
  })
})
