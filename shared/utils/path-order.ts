import type { SkillNode, SkillTree } from '../types/skill-tree'

export interface PathOrderViolation { nodeId: string; prerequisiteId: string }

export interface PathOrderOptions {
  /**
   * Generation only: a Main_Node may need earlier Main_Nodes and nothing else.
   * Without it, a Main_Node may also need a Side_Quest_Node that is drawn above it (P1b),
   * so that paths saved before the check existed can still be drawn.
   */
  strict?: boolean
}

/**
 * Checks the order the Path_Layout needs (spec: skill-path-ui, design "Path order precondition"):
 * - P1: every prerequisite of a Main_Node is a Main_Node that comes earlier in document order.
 * - P1b (not with `strict`): or a Side_Quest_Node that is drawn above the Main_Node. A side quest
 *   is drawn right below the Main_Node it hangs from: the latest Main_Node among its
 *   prerequisites, where a side quest prerequisite counts as the Main_Node that one hangs from.
 *   A side quest that hangs from no Main_Node is drawn at the top of its own Section.
 * - P2: every prerequisite of a Side_Quest_Node is a Node of the tree, anywhere in it.
 *   A side quest may be listed before the Node it needs (for example before the Section's milestone).
 * Returns the first offending (node, prerequisite) pair in document order, or null.
 * Duplicate ids count once, at their first occurrence.
 */
export function findPathOrderViolation(tree: SkillTree, options: PathOrderOptions = {}): PathOrderViolation | null {
  const nodes: SkillNode[] = []
  const byId = new Map<string, SkillNode>()
  const sectionOf = new Map<string, number>()
  tree.sections.forEach((section, sectionIndex) => {
    for (const node of section.nodes) {
      if (byId.has(node.id)) continue
      byId.set(node.id, node)
      sectionOf.set(node.id, sectionIndex)
      nodes.push(node)
    }
  })
  const mainPosition = new Map<string, number>()
  for (const node of nodes) if (!node.optional) mainPosition.set(node.id, mainPosition.size)

  /** Position of the Main_Node a side quest hangs from; -1 for none. A prerequisite loop counts as none. */
  const anchorCache = new Map<string, number>()
  const visiting = new Set<string>()
  function anchorPosition(side: SkillNode): number {
    const cached = anchorCache.get(side.id)
    if (cached !== undefined) return cached
    if (visiting.has(side.id)) return -1
    visiting.add(side.id)
    let latest = -1
    for (const prerequisiteId of side.prerequisites) {
      const prerequisite = byId.get(prerequisiteId)
      if (!prerequisite) continue
      const position = prerequisite.optional ? anchorPosition(prerequisite) : mainPosition.get(prerequisiteId) ?? -1
      if (position > latest) latest = position
    }
    visiting.delete(side.id)
    anchorCache.set(side.id, latest)
    return latest
  }

  /** P1b: the side quest is drawn above the Main_Node. */
  function drawnAbove(side: SkillNode, main: SkillNode): boolean {
    const anchor = anchorPosition(side)
    if (anchor >= 0) return anchor < (mainPosition.get(main.id) ?? -1)
    return (sectionOf.get(side.id) ?? 0) <= (sectionOf.get(main.id) ?? 0)
  }

  for (const node of nodes) {
    for (const prerequisiteId of node.prerequisites) {
      const prerequisite = byId.get(prerequisiteId)
      let ok: boolean
      if (!prerequisite) ok = false
      else if (node.optional) ok = true
      else if (!prerequisite.optional) ok = (mainPosition.get(prerequisiteId) ?? 0) < (mainPosition.get(node.id) ?? 0)
      else ok = options.strict !== true && drawnAbove(prerequisite, node)
      if (!ok) return { nodeId: node.id, prerequisiteId }
    }
  }
  return null
}
