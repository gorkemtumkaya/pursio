import type { CompletionResult, NodeState, Progress } from '../types/progress'
import type { QuestTriple, SkillNode, SkillTree } from '../types/skill-tree'

export function emptyProgress(): Progress {
  return { completed: [], quests: {} }
}

/** First Node with the given id, in Section order then Node order. */
function findNode(tree: SkillTree, id: string): SkillNode | undefined {
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (node.id === id) return node
    }
  }
  return undefined
}

function isNodeAvailable(node: SkillNode, done: ReadonlySet<string>): boolean {
  return !done.has(node.id) && node.prerequisites.every((p) => done.has(p))
}

/** Not completed, and every prerequisite completed (Req 4.3, 4.7). Unknown ids are not available. */
export function isAvailable(tree: SkillTree, progress: Progress, id: string): boolean {
  const node = findNode(tree, id)
  return node !== undefined && isNodeAvailable(node, new Set(progress.completed))
}

function currentIdFor(tree: SkillTree, done: ReadonlySet<string>): string | null {
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (!node.optional && isNodeAvailable(node, done)) return node.id
    }
  }
  return null
}

/** First available Main_Node in document order; side quests are never current (Req 4.2, 4.5). */
export function findCurrentNodeId(tree: SkillTree, progress: Progress): string | null {
  return currentIdFor(tree, new Set(progress.completed))
}

/** Ordered rules: completed → current → side_quest → milestone → locked (Req 4.1, 4.4). */
export function deriveNodeStates(tree: SkillTree, progress: Progress): Map<string, NodeState> {
  const done = new Set(progress.completed)
  const currentId = currentIdFor(tree, done)
  const states = new Map<string, NodeState>()
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (states.has(node.id)) continue
      let state: NodeState
      if (done.has(node.id)) state = 'completed'
      else if (node.id === currentId) state = 'current'
      else if (node.optional && isNodeAvailable(node, done)) state = 'side_quest'
      else if (node.milestone) state = 'milestone'
      else state = 'locked'
      states.set(node.id, state)
    }
  }
  return states
}

/**
 * Completes an available Node. Unknown, completed or unavailable ids return the
 * same Progress object with `completed: false` (Req 4.10, 4.13). Quests are kept (Req 9.1).
 */
export function markComplete(tree: SkillTree, progress: Progress, id: string): CompletionResult {
  const node = findNode(tree, id)
  const done = new Set(progress.completed)
  if (node === undefined || !isNodeAvailable(node, done)) {
    return { completed: false, progress }
  }
  const next: Progress = { completed: [...progress.completed, id], quests: progress.quests }
  done.add(id)
  return {
    completed: true,
    progress: next,
    kind: node.optional ? 'side' : 'main',
    nextCurrentId: currentIdFor(tree, done),
  }
}

/** Flips one quest checkbox in a copy; unknown ids return the input unchanged. */
export function toggleQuest(
  tree: SkillTree,
  progress: Progress,
  id: string,
  index: 0 | 1 | 2,
): Progress {
  if (findNode(tree, id) === undefined) return progress
  const prev = progress.quests[id] ?? [false, false, false]
  const triple: QuestTriple<boolean> = [prev[0], prev[1], prev[2]]
  triple[index] = !triple[index]
  return { completed: progress.completed, quests: { ...progress.quests, [id]: triple } }
}

export function checkedCount(progress: Progress, id: string): number {
  const triple = progress.quests[id]
  return triple === undefined ? 0 : triple.filter(Boolean).length
}

/** Ids that went from `locked` to `current` or `side_quest` (Req 9.5). */
export function diffUnlocked(
  before: Map<string, NodeState>,
  after: Map<string, NodeState>,
): string[] {
  const unlocked: string[] = []
  for (const [id, state] of after) {
    if ((state === 'current' || state === 'side_quest') && before.get(id) === 'locked') {
      unlocked.push(id)
    }
  }
  return unlocked
}

/** Section containing the Current_Node, or the last Section when there is none. */
export function activeSectionIndex(tree: SkillTree, progress: Progress): number {
  const currentId = findCurrentNodeId(tree, progress)
  if (currentId !== null) {
    const index = tree.sections.findIndex((s) => s.nodes.some((n) => n.id === currentId))
    if (index !== -1) return index
  }
  return Math.max(0, tree.sections.length - 1)
}
