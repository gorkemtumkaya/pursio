// Pure numbers behind the Profile_Page: totals, hobby rows and milestones.
import type { SkillNode } from '#shared/types/skill-tree'
import { completionPercent } from '#shared/utils/progress-engine'
import { longestStreak, streakDays } from '#shared/utils/streak'
import { LEVEL_THRESHOLDS, levelFor, XP_PER_NODE, type XpLevel } from '#shared/utils/xp'
import { completionTimes, type CloudPath } from './cloud-library'
import { hobbyPath } from './hobby-store'

/** One row of the "Your hobbies" card. */
export interface ProfileHobby {
  id: string
  hobby: string
  to: string
  /** Completed skills and all skills of the path. */
  done: number
  total: number
  level: XpLevel
  /** Whole percent, 0 to 100. */
  percent: number
}

export interface ProfileMilestone {
  id: string
  label: string
  earned: boolean
}

export interface ProfileStats {
  /** XP over every path, archived ones included, like the Streak. */
  xp: number
  skillsDone: number
  questsDone: number
  streak: number
  /** Paths that are not archived, in the order added. */
  hobbies: ProfileHobby[]
  milestones: ProfileMilestone[]
}

interface PathCount {
  done: SkillNode[]
  total: number
  quests: number
}

/** Completed Nodes and checked quests of one path; ids that are not in the tree are ignored. */
function countPath({ record, progress }: CloudPath): PathCount {
  const nodes = record.tree.sections.flatMap((section) => section.nodes)
  const completed = new Set(progress.completed)
  const quests = nodes.reduce(
    (sum, node) => sum + (progress.quests[node.id]?.filter((checked) => checked === true).length ?? 0),
    0,
  )
  return { done: nodes.filter((node) => completed.has(node.id)), total: nodes.length, quests }
}

export function profileStats(paths: readonly CloudPath[], now: number): ProfileStats {
  const counts = paths.map(countPath)
  const done = counts.flatMap((count) => count.done)
  const skillsDone = done.length
  const questsDone = counts.reduce((sum, count) => sum + count.quests, 0)
  const xp = skillsDone * XP_PER_NODE
  const times = completionTimes(paths)
  const bestStreak = longestStreak(times)

  const hobbies = paths.flatMap((path, index): ProfileHobby[] => {
    const count = counts[index]
    if (path.record.archived || !count) return []
    return [
      {
        id: path.record.id,
        hobby: path.record.tree.hobby,
        to: hobbyPath(path.record.id),
        done: count.done.length,
        total: count.total,
        level: levelFor(count.done.length * XP_PER_NODE),
        percent: completionPercent(path.record.tree, path.progress),
      },
    ]
  })

  const milestones: ProfileMilestone[] = [
    { id: 'first-skill', label: 'First skill', earned: skillsDone >= 1 },
    { id: 'streak-3', label: '3-day streak', earned: bestStreak >= 3 },
    { id: 'first-milestone', label: 'First milestone', earned: done.some((node) => node.milestone) },
    { id: 'side-quest', label: 'Side quest hero', earned: done.some((node) => node.optional) },
    { id: 'streak-7', label: '7-day streak', earned: bestStreak >= 7 },
    { id: 'two-hobbies', label: 'Two hobbies', earned: paths.length >= 2 },
    { id: 'level-5', label: 'Level 5', earned: xp >= LEVEL_THRESHOLDS[4] },
    { id: 'quests-100', label: '100 quests', earned: questsDone >= 100 },
  ]

  return { xp, skillsDone, questsDone, streak: streakDays(times, now), hobbies, milestones }
}
