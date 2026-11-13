import type { QuestTriple } from './skill-tree'

export interface Progress {
  /** Unique node ids, in completion order. */
  completed: string[]
  /** Checked state per node; an absent entry means all unchecked. */
  quests: Record<string, QuestTriple<boolean>>
}

/** One quest of one node. */
export interface QuestId {
  id: string
  index: 0 | 1 | 2
}

export type NodeState = 'locked' | 'current' | 'completed' | 'side_quest' | 'milestone'

export type CompletionResult =
  | { completed: false; progress: Progress }
  | { completed: true; progress: Progress; kind: 'main' | 'side'; nextCurrentId: string | null }
