import type { DailyPick } from '../types/cloud'
import type { Progress, QuestId } from '../types/progress'
import type { SkillNode, SkillTree } from '../types/skill-tree'
import { findCurrentNodeId, isQuestTicked, openNodes, sameQuest } from './progress-engine'

export const DAILY_PICK_SIZE = 3

const INDEXES = [0, 1, 2] as const

function unticked(node: SkillNode, progress: Progress): QuestId[] {
  return INDEXES.map((index): QuestId => ({ id: node.id, index })).filter(
    (q) => !isQuestTicked(progress, q),
  )
}

/**
 * All candidates in pick order: Current_Node, then open side quests, then other
 * open nodes. Within a group: document order, then quest index. Unticked only.
 */
export function candidateQuests(tree: SkillTree, progress: Progress): QuestId[] {
  const open = openNodes(tree, progress)
  const currentId = findCurrentNodeId(tree, progress)
  const current = open.filter((n) => n.id === currentId)
  const side = open.filter((n) => n.id !== currentId && n.optional)
  const other = open.filter((n) => n.id !== currentId && !n.optional)
  return [...current, ...side, ...other].flatMap((n) => unticked(n, progress))
}

/** The first DAILY_PICK_SIZE candidates. */
export function pickDailyQuests(tree: SkillTree, progress: Progress): QuestId[] {
  return candidateQuests(tree, progress).slice(0, DAILY_PICK_SIZE)
}

/** A new pick for `day`, or null when there is no candidate. */
export function newDailyPick(tree: SkillTree, progress: Progress, day: string): DailyPick | null {
  const quests = pickDailyQuests(tree, progress)
  return quests.length === 0 ? null : { day, quests, bonus: false }
}

export function needsNewPick(pick: DailyPick | null, day: string): boolean {
  return pick === null || pick.day !== day
}

/**
 * True when the pick is for `day`, has exactly 3 quests, no bonus yet, all of
 * them ticked in `after`, and this change ticked at least one of them.
 */
export function dailyBonusDue(
  pick: DailyPick | null,
  day: string,
  ticked: readonly QuestId[],
  after: Progress,
): boolean {
  if (pick === null || pick.day !== day || pick.bonus) return false
  if (pick.quests.length !== DAILY_PICK_SIZE) return false
  if (!pick.quests.every((q) => isQuestTicked(after, q))) return false
  return ticked.some((t) => pick.quests.some((q) => sameQuest(q, t)))
}
