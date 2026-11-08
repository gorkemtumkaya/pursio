import type { SkillTree } from '#shared/types/skill-tree'

export interface TreeSummary {
  skills: number
  sections: number
  quests: number
  firstSkill: string
}

/** Counts shown on the "ready" card after a tree is generated. */
export function summarizeTree(tree: SkillTree): TreeSummary {
  const nodes = tree.sections.flatMap(section => section.nodes)
  return {
    skills: nodes.length,
    sections: tree.sections.length,
    quests: nodes.reduce((total, node) => total + node.quests.length, 0),
    firstSkill: tree.sections[0]?.nodes[0]?.title ?? '',
  }
}
