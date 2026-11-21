import type { StoredProfile } from '#shared/types/learner-profile'
import type { SkillTree } from '#shared/types/skill-tree'
import { emptyProgress, findCurrentNodeId, findNode } from '#shared/utils/progress-engine'
import { headStartXp } from '#shared/utils/xp'

export interface TreeSummary {
  skills: number
  sections: number
  quests: number
  /** The first skill to work on: the Current_Node, never a Known_Node (spec: path-intake, Req 12.4). */
  firstSkill: string
  /** The goal as the final milestone, or null without a goal (Req 12.1). */
  finishLine: string | null
  /** 30 per Known_Node; 0 without any (Req 12.2). */
  headStartXp: number
  /** Labels of the Known_Skills that have a Node, in profile order (Req 12.2, decision 31). */
  knownLabels: readonly string[]
}

/**
 * Counts and lines shown on the "ready" card after a tree is generated. The counts include
 * Known_Nodes. `profile` is the Stored_Profile, whose `known` holds only skills with a Node.
 */
export function summarizeTree(tree: SkillTree, profile: StoredProfile | null = null): TreeSummary {
  const nodes = tree.sections.flatMap(section => section.nodes)
  const currentId = findCurrentNodeId(tree, emptyProgress())
  const first = (currentId === null ? undefined : findNode(tree, currentId)) ?? nodes[0]
  return {
    skills: nodes.length,
    sections: tree.sections.length,
    quests: nodes.reduce((total, node) => total + node.quests.length, 0),
    firstSkill: first?.title ?? '',
    finishLine: profile?.goal?.finishLine ?? null,
    headStartXp: headStartXp(tree),
    knownLabels: profile?.known.map(option => option.label) ?? [],
  }
}
