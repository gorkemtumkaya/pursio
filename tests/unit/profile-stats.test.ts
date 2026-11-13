import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { longestStreak } from '../../shared/utils/streak'
import { xpSummaryOf } from '../../shared/utils/xp'
import type { CloudPath } from '../../app/utils/cloud-library'
import { profileStats } from '../../app/utils/profile-stats'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const bouldering: SkillTree = loaded.value
const nodes: SkillNode[] = bouldering.sections.flatMap(section => section.nodes)

/** Local noon, so day arithmetic stays clear of midnight and DST changes. */
const day = (offset: number): number => new Date(2026, 10, 10 + offset, 12).getTime()
const NOW = day(0)

function path(
  hobby: string,
  completed: string[],
  options: Partial<Pick<CloudPath, 'completedAt' | 'questTicks' | 'dailyBonusCount'>> & {
    archived?: boolean
    quests?: CloudPath['progress']['quests']
  } = {},
): CloudPath {
  const id = hobby.toLowerCase()
  return {
    pathId: `row-${id}`,
    record: { id, tree: { ...bouldering, hobby }, model: 'm', addedAt: 1, archived: options.archived ?? false },
    level: 'new',
    progress: { completed, quests: options.quests ?? {} },
    completedAt: options.completedAt ?? {},
    questTicks: options.questTicks ?? {},
    dailyPick: null,
    dailyBonusCount: options.dailyBonusCount ?? 0,
  }
}

const earned = (paths: CloudPath[], weeklyRewardCount = 0): string[] =>
  profileStats(paths, NOW, weeklyRewardCount).milestones.filter(milestone => milestone.earned).map(milestone => milestone.id)

describe('longestStreak', () => {
  it('is the longest run of consecutive days, wherever it lies', () => {
    expect(longestStreak([])).toBe(0)
    expect(longestStreak([day(0), day(0)])).toBe(1)
    expect(longestStreak([day(-9), day(-8), day(-7), day(-3), day(-2)])).toBe(3)
    expect(longestStreak([day(-30), day(-1), day(0)])).toBe(2)
  })
})

describe('xpSummaryOf', () => {
  it('gives the level and label for an XP total', () => {
    expect(xpSummaryOf(250)).toMatchObject({ xp: 250, level: 3, nextLevelXp: 400, label: '250 / 400 XP' })
    expect(xpSummaryOf(700)).toMatchObject({ level: 5, nextLevelXp: null, barPercent: 100 })
  })
})

describe('profileStats', () => {
  it('is all zero with nothing earned for an account without paths', () => {
    const stats = profileStats([], NOW)
    expect(stats).toMatchObject({ xp: 0, skillsDone: 0, questsDone: 0, streak: 0, hobbies: [] })
    expect(stats.milestones).toHaveLength(8)
    expect(stats.milestones.every(milestone => !milestone.earned)).toBe(true)
  })

  it('adds up every path, ignores ids and quests outside the tree, and lists only paths that are not archived', () => {
    const [a, b, c] = nodes.map(node => node.id) as [string, string, string]
    const stats = profileStats(
      [
        path('Bouldering', [a, b, 'gone'], { quests: { [a]: [true, true, false], gone: [true, true, true] } }),
        path('Guitar', [c], { archived: true, quests: { [c]: [true, false, false] } }),
      ],
      NOW,
    )
    expect(stats.skillsDone).toBe(3)
    // 3 skills x 50 + 3 ticked quests x 10 (the quest of 'gone' is ignored).
    expect(stats.xp).toBe(180)
    expect(stats.questsDone).toBe(3)
    expect(stats.hobbies).toEqual([
      {
        id: 'bouldering',
        hobby: 'Bouldering',
        to: '/path?hobby=bouldering',
        done: 2,
        total: nodes.length,
        level: 2,
        percent: Math.round((2 / nodes.length) * 100),
      },
    ])
  })

  it('totals skill XP, quest XP, daily bonuses and the weekly reward', () => {
    const [a, b] = nodes.map(node => node.id) as [string, string]
    const paths = [
      path('Bouldering', [a], { quests: { [a]: [true, true, true], [b]: [true, false, false] }, dailyBonusCount: 2 }),
      path('Guitar', [], { dailyBonusCount: 1 }),
    ]
    // 50 + 40 + 2 x 20 on the first path, 20 on the second, 3 x 50 weekly reward.
    expect(profileStats(paths, NOW, 3).xp).toBe(130 + 20 + 150)
    expect(profileStats(paths, NOW).xp).toBe(150)
  })

  it('treats bad counts as 0', () => {
    const paths = [path('Bouldering', [], { dailyBonusCount: -2 })]
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(profileStats(paths, NOW, bad).xp).toBe(0)
    }
    expect(profileStats([path('Bouldering', [], { dailyBonusCount: 1.5 })], NOW).xp).toBe(0)
  })

  it('leaves the weekly reward out of the hobby level but counts it for level 5', () => {
    const paths = [path('Bouldering', [])]
    // 14 x 50 = 700 weekly reward XP reaches level 5 in total; the hobby stays at level 1.
    expect(profileStats(paths, NOW, 14).hobbies[0]!.level).toBe(1)
    expect(earned(paths, 14)).toContain('level-5')
    expect(earned(paths, 13)).not.toContain('level-5')
  })

  it('earns each milestone from the matching data', () => {
    const first = nodes[0]!.id
    const side = nodes.find(node => node.optional)!.id
    const milestone = nodes.find(node => node.milestone)!.id
    expect(earned([path('Bouldering', [])])).toEqual([])
    expect(earned([path('Bouldering', [first])])).toEqual(['first-skill'])
    expect(earned([path('Bouldering', [side])])).toEqual(['first-skill', 'side-quest'])
    expect(earned([path('Bouldering', [milestone])])).toEqual(['first-skill', 'first-milestone'])
    expect(earned([path('Bouldering', []), path('Guitar', [], { archived: true })])).toEqual(['two-hobbies'])
    // 13 + 1 skills = 700 XP over two paths.
    const all = nodes.map(node => node.id)
    expect(earned([path('Bouldering', all)])).not.toContain('level-5')
    expect(earned([path('Bouldering', all), path('Guitar', [first])])).toContain('level-5')
  })

  it('keeps a streak milestone after the streak ended', () => {
    const [a, b, c] = nodes.map(node => node.id) as [string, string, string]
    const paths = [path('Bouldering', [a, b, c], { completedAt: { [a]: day(-20), [b]: day(-19), [c]: day(-18) } })]
    expect(profileStats(paths, NOW).streak).toBe(0)
    expect(earned(paths)).toContain('streak-3')
    expect(earned(paths)).not.toContain('streak-7')
  })

  it('counts days with a quest tick in the streak', () => {
    const [a, b] = nodes.map(node => node.id) as [string, string]
    const paths = [
      path('Bouldering', [a], {
        completedAt: { [a]: day(-2) },
        questTicks: { [b]: [day(-1), null, day(0)] },
        quests: { [b]: [true, false, true] },
      }),
    ]
    expect(profileStats(paths, NOW).streak).toBe(3)
  })
})
