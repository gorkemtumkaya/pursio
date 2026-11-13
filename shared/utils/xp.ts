import type { Progress } from '../types/progress'
import type { SkillTree } from '../types/skill-tree'

export type XpLevel = 1 | 2 | 3 | 4 | 5

export interface XpSummary {
  xp: number
  level: XpLevel
  /** First XP value of the next level, or null at level 5. */
  nextLevelXp: number | null
  /** Whole percent, 0–100. */
  barPercent: number
  label: string
}

export const XP_PER_NODE = 50
export const XP_PER_QUEST = 10
export const XP_PER_DAILY_BONUS = 20
export const XP_PER_WEEKLY_REWARD = 50
/** Level n starts at LEVEL_THRESHOLDS[n - 1]. */
export const LEVEL_THRESHOLDS = [0, 100, 200, 400, 700] as const

function treeIds(tree: SkillTree): Set<string> {
  const ids = new Set<string>()
  for (const section of tree.sections) {
    for (const node of section.nodes) ids.add(node.id)
  }
  return ids
}

/** A negative, fractional or non-finite count counts as 0. */
function cleanCount(count: number): number {
  return Number.isInteger(count) && count > 0 ? count : 0
}

/** 50 × the number of distinct completed ids that exist in the tree. */
export function skillXpFor(tree: SkillTree, progress: Progress): number {
  const ids = treeIds(tree)
  const counted = new Set(progress.completed.filter((id) => ids.has(id)))
  return counted.size * XP_PER_NODE
}

/** 10 × the number of ticked quests of Nodes that exist in the tree. */
export function questXpFor(tree: SkillTree, progress: Progress): number {
  const ids = treeIds(tree)
  let ticked = 0
  for (const id of ids) {
    const triple = progress.quests[id]
    if (!triple) continue
    for (const done of triple) if (done === true) ticked += 1
  }
  return ticked * XP_PER_QUEST
}

/** Hobby_XP = skill XP + quest XP + 20 × dailyBonusCount. */
export function xpFor(tree: SkillTree, progress: Progress, dailyBonusCount = 0): number {
  return (
    skillXpFor(tree, progress) +
    questXpFor(tree, progress) +
    cleanCount(dailyBonusCount) * XP_PER_DAILY_BONUS
  )
}

/** Weekly_Reward_XP = 50 × count. Not part of Hobby_XP. */
export function weeklyRewardXp(count: number): number {
  return cleanCount(count) * XP_PER_WEEKLY_REWARD
}

export function levelFor(xp: number): XpLevel {
  if (xp >= LEVEL_THRESHOLDS[4]) return 5
  if (xp >= LEVEL_THRESHOLDS[3]) return 4
  if (xp >= LEVEL_THRESHOLDS[2]) return 3
  if (xp >= LEVEL_THRESHOLDS[1]) return 2
  return 1
}

export function xpSummary(tree: SkillTree, progress: Progress, dailyBonusCount = 0): XpSummary {
  return xpSummaryOf(xpFor(tree, progress, dailyBonusCount))
}

/** The summary for an XP total, e.g. the sum over every path on the Profile_Page. */
export function xpSummaryOf(xp: number): XpSummary {
  const level = levelFor(xp)
  if (level === 5) {
    return { xp, level, nextLevelXp: null, barPercent: 100, label: `${xp} XP` }
  }
  const nextLevelXp: number = LEVEL_THRESHOLDS[level]
  return {
    xp,
    level,
    nextLevelXp,
    barPercent: Math.round((100 * xp) / nextLevelXp),
    label: `${xp} / ${nextLevelXp} XP`,
  }
}
