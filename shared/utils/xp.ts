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
/** Level n starts at LEVEL_THRESHOLDS[n - 1]. */
export const LEVEL_THRESHOLDS = [0, 100, 200, 400, 700] as const
export const STATIC_STREAK = 6

/** 50 × the number of distinct completed ids that exist in the tree. */
export function xpFor(tree: SkillTree, progress: Progress): number {
  const ids = new Set<string>()
  for (const section of tree.sections) {
    for (const node of section.nodes) ids.add(node.id)
  }
  const counted = new Set(progress.completed.filter((id) => ids.has(id)))
  return counted.size * XP_PER_NODE
}

export function levelFor(xp: number): XpLevel {
  if (xp >= LEVEL_THRESHOLDS[4]) return 5
  if (xp >= LEVEL_THRESHOLDS[3]) return 4
  if (xp >= LEVEL_THRESHOLDS[2]) return 3
  if (xp >= LEVEL_THRESHOLDS[1]) return 2
  return 1
}

export function xpSummary(tree: SkillTree, progress: Progress): XpSummary {
  const xp = xpFor(tree, progress)
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
