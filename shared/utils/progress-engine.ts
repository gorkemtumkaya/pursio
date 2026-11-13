import type { CompletionResult, NodeState, Progress, QuestId } from '../types/progress'
import type { QuestTriple, SkillNode, SkillTree } from '../types/skill-tree'

export function emptyProgress(): Progress {
  return { completed: [], quests: {} }
}

/** First Node with the given id, in Section order then Node order. */
export function findNode(tree: SkillTree, id: string): SkillNode | undefined {
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

/** Open_Nodes in document order: not completed, every prerequisite completed. First node wins on a repeated id. */
export function openNodes(tree: SkillTree, progress: Progress): SkillNode[] {
  const done = new Set(progress.completed)
  const seen = new Set<string>()
  const open: SkillNode[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (isNodeAvailable(node, done)) open.push(node)
    }
  }
  return open
}

/** Own entries only, so ids such as `__proto__` never read from the prototype. */
function ownTriple(progress: Progress, id: string): QuestTriple<boolean> | undefined {
  for (const [key, triple] of Object.entries(progress.quests)) {
    if (key === id) return triple
  }
  return undefined
}

export function isQuestTicked(progress: Progress, quest: QuestId): boolean {
  return ownTriple(progress, quest.id)?.[quest.index] === true
}

export function sameQuest(a: QuestId, b: QuestId): boolean {
  return a.id === b.id && a.index === b.index
}

/** Quest_Ids that went false→true (`ticked`) or true→false (`unticked`) between two Progress values. */
export function diffTicks(
  before: Progress,
  after: Progress,
): { ticked: QuestId[]; unticked: QuestId[] } {
  const ticked: QuestId[] = []
  const unticked: QuestId[] = []
  const beforeMap = new Map(Object.entries(before.quests))
  const afterMap = new Map(Object.entries(after.quests))
  const ids = new Set<string>([...beforeMap.keys(), ...afterMap.keys()])
  for (const id of ids) {
    const b = beforeMap.get(id)
    const a = afterMap.get(id)
    for (const index of [0, 1, 2] as const) {
      const was = b?.[index] === true
      const now = a?.[index] === true
      if (!was && now) ticked.push({ id, index })
      else if (was && !now) unticked.push({ id, index })
    }
  }
  return { ticked, unticked }
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

/** Whole percent of the tree's nodes that are completed; ids not in the tree are ignored. */
export function completionPercent(tree: SkillTree, progress: Progress): number {
  const ids = new Set(tree.sections.flatMap((s) => s.nodes.map((n) => n.id)))
  if (ids.size === 0) return 0
  const done = new Set(progress.completed.filter((id) => ids.has(id)))
  return Math.round((done.size / ids.size) * 100)
}
