import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { levelFor, XP_PER_NODE, xpSummary } from '../../shared/utils/xp'

const node = (id: string): SkillNode => ({
  id,
  title: id,
  description: `${id} description`,
  prerequisites: [],
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
})

const ids = Array.from({ length: 15 }, (_, i) => `n${i}`)
const tree: SkillTree = {
  hobby: 'bouldering',
  mascot: { set: 'bouldering' },
  sections: [{ title: 'Beginner', level: 'beginner', nodes: ids.map(node) }],
}

/** Progress worth exactly `xp` (a multiple of 50). */
const progressWorth = (xp: number): Progress => ({
  completed: ids.slice(0, xp / XP_PER_NODE),
  quests: {},
})

describe('levelFor', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [199, 2],
    [200, 3],
    [399, 3],
    [400, 4],
    [699, 4],
    [700, 5],
    [750, 5],
  ] as const)('%i XP is level %i', (xp, level) => {
    expect(levelFor(xp)).toBe(level)
  })
})

describe('xpSummary', () => {
  it.each([
    [0, 1, 100, 0, '0 / 100 XP'],
    [100, 2, 200, 50, '100 / 200 XP'],
    [200, 3, 400, 50, '200 / 400 XP'],
    [400, 4, 700, 57, '400 / 700 XP'],
  ] as const)('%i XP below level 5', (xp, level, nextLevelXp, barPercent, label) => {
    expect(xpSummary(tree, progressWorth(xp))).toEqual({ xp, level, nextLevelXp, barPercent, label })
  })

  it.each([700, 750])('%i XP at level 5 shows a full bar', (xp) => {
    expect(xpSummary(tree, progressWorth(xp))).toEqual({
      xp,
      level: 5,
      nextLevelXp: null,
      barPercent: 100,
      label: `${xp} XP`,
    })
  })
})
