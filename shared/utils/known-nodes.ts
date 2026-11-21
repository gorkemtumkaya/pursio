// Known_Nodes: Nodes built for a skill the learner already has (spec: path-intake). Pure.
import type { FinalProfile, StoredProfile } from '../types/learner-profile'
import type { SkillNode, SkillTree } from '../types/skill-tree'
import { KNOWN_MAX, toStoredProfile } from './learner-profile'

/** XP of one Known_Node, given once with the path (decision 8). */
export const HEAD_START_XP_PER_SKILL = 30

function carriesId(node: SkillNode): node is SkillNode & { knownOptionId: string } {
  return typeof node.knownOptionId === 'string'
}

/**
 * Ids of the Nodes that carry a `knownOptionId`, in document order, at most 6.
 * On an aligned tree these are exactly the Known_Nodes.
 */
export function knownNodeIds(tree: SkillTree): string[] {
  const ids: string[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (ids.length < KNOWN_MAX && carriesId(node)) ids.push(node.id)
    }
  }
  return ids
}

/** A copy of the Node without the `knownOptionId` key. */
function withoutKnownId(node: SkillNode): SkillNode {
  const { knownOptionId: _dropped, ...rest } = node
  return rest
}

/**
 * Keeps a `knownOptionId` only when it is in `knownIds`, was not kept on an earlier Node,
 * sits on a Main_Node that is not a milestone, and fewer than 6 were kept. Every other
 * `knownOptionId`, null included, is removed. Never rejects, never matches by title
 * (Req 8.8, 9.1, AS14). Returns the option ids that kept a Node, in document order.
 * A tree that needs no change is returned as the same object.
 */
export function alignKnownNodes(tree: SkillTree, knownIds: readonly string[]): { tree: SkillTree; keptIds: string[] } {
  const allowed = new Set(knownIds)
  const kept: string[] = []
  let changed = false
  const sections = tree.sections.map((section) => {
    let sectionChanged = false
    const nodes = section.nodes.map((node) => {
      if (!Object.hasOwn(node, 'knownOptionId')) return node
      const id = node.knownOptionId
      const keep =
        typeof id === 'string' &&
        allowed.has(id) &&
        !kept.includes(id) &&
        !node.optional &&
        !node.milestone &&
        kept.length < KNOWN_MAX
      if (keep) {
        kept.push(id)
        return node
      }
      sectionChanged = true
      return withoutKnownId(node)
    })
    if (!sectionChanged) return section
    changed = true
    return { ...section, nodes }
  })
  return { tree: changed ? { ...tree, sections } : tree, keptIds: kept }
}

/**
 * The tree as saved for `profile`, and the profile as stored. Never rejects (Req 8.3, 8.8, 11.3).
 * 1. Aligns the `knownOptionId` values with the profile's Known_Skills (none for a null profile).
 * 2. With a goal, sets the title of the Final_Milestone to the Finish_Line (decision 30).
 * 3. Cuts the stored `known` down to the skills that kept a Node, in profile order.
 */
export function applyProfileToTree(
  tree: SkillTree,
  profile: FinalProfile | null,
): { tree: SkillTree; profile: StoredProfile | null } {
  const aligned = alignKnownNodes(tree, profile?.known.map((option) => option.id) ?? [])
  let saved = aligned.tree
  const finishLine = profile?.goal?.finishLine
  const lastSection = saved.sections.at(-1)
  const lastNode = lastSection?.nodes.at(-1)
  if (finishLine !== undefined && lastSection !== undefined && lastNode !== undefined && lastNode.title !== finishLine) {
    const lastIndex = saved.sections.length - 1
    saved = {
      ...saved,
      sections: saved.sections.map((section, index) =>
        index === lastIndex
          ? {
              ...section,
              nodes: section.nodes.map((node, i) =>
                i === section.nodes.length - 1 ? { ...node, title: finishLine } : node,
              ),
            }
          : section,
      ),
    }
  }
  return { tree: saved, profile: profile === null ? null : toStoredProfile(profile, aligned.keptIds) }
}
