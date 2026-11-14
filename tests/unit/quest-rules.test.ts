import { describe, expect, it } from 'vitest'
import type { DailyPick, QuestTicks, WeeklyReward } from '../../shared/types/cloud'
import type { Progress, QuestId } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { localDayKey, weekKeyOf } from '../../shared/utils/streak'
import type { CloudPath } from '../../app/utils/cloud-library'
import { applyProgressChange, weeklyRewardDue, withDailyPick } from '../../app/utils/quest-rules'

const at = (y: number, m: number, d: number, h = 10): number => new Date(y, m - 1, d, h).getTime()

const node = (id: string): SkillNode => ({
  id,
  title: id,
  description: `${id} description`,
  prerequisites: [],
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
})

const tree: SkillTree = {
  hobby: 'bouldering',
  mascot: { set: 'bouldering' },
  sections: [{ title: 'Beginner', level: 'beginner', nodes: [node('a'), node('b')] }],
}

const q = (id: string, index: 0 | 1 | 2): QuestId => ({ id, index })
const none: Progress = { completed: [], quests: {} }
const allA: QuestId[] = [q('a', 0), q('a', 1), q('a', 2)]

function pathOf(over: Partial<CloudPath> = {}): CloudPath {
  return {
    pathId: 'p1',
    record: { id: 'h1', tree, model: 'm', addedAt: 0, archived: false },
    level: 'beginner',
    progress: none,
    completedAt: {},
    questTicks: {},
    dailyPick: null,
    dailyBonusCount: 0,
    ...over,
  }
}

const pickFor = (day: string, quests: QuestId[], bonus = false): DailyPick => ({ day, quests, bonus })

// Thursday 2025-06-05; its week starts Monday 2025-06-02.
const thu = at(2025, 6, 5)
const today = localDayKey(thu)
const twoOfA: Progress = { completed: [], quests: { a: [true, true, false] } }
const threeOfA: Progress = { completed: [], quests: { a: [true, true, true] } }

describe('daily bonus', () => {
  it('is granted once when the third quest of the pick is ticked', () => {
    const paths = [pathOf({ progress: twoOfA, dailyPick: pickFor(today, allA) })]
    const result = applyProgressChange(paths, null, 'p1', threeOfA, thu)
    expect(result?.grantedDailyBonus).toBe(true)
    expect(result?.write.dailyBonusCount).toBe(1)
    expect(result?.write.dailyPick?.bonus).toBe(true)
  })

  it('is not granted again after untick and tick', () => {
    const paths = [pathOf({ progress: twoOfA, dailyPick: pickFor(today, allA) })]
    const first = applyProgressChange(paths, null, 'p1', threeOfA, thu)
    const unticked = applyProgressChange(first!.paths, null, 'p1', twoOfA, thu)
    expect(unticked?.grantedDailyBonus).toBe(false)
    expect(unticked?.write.dailyBonusCount).toBe(1)
    const again = applyProgressChange(unticked!.paths, null, 'p1', threeOfA, thu)
    expect(again?.grantedDailyBonus).toBe(false)
    expect(again?.write.dailyBonusCount).toBe(1)
  })

  it.each([1, 2])('is not granted for a pick of %i quest(s)', (size) => {
    const quests = allA.slice(0, size)
    const before: Progress = { completed: [], quests: { a: [false, true, true] } }
    const paths = [pathOf({ progress: before, dailyPick: pickFor(today, quests) })]
    const result = applyProgressChange(paths, null, 'p1', threeOfA, thu)
    expect(result?.grantedDailyBonus).toBe(false)
    expect(result?.write.dailyBonusCount).toBe(0)
  })

  it('is not granted for a pick of another day', () => {
    const paths = [pathOf({ progress: twoOfA, dailyPick: pickFor('2025-06-04', allA) })]
    const result = applyProgressChange(paths, null, 'p1', threeOfA, thu)
    expect(result?.grantedDailyBonus).toBe(false)
    expect(result?.write.dailyBonusCount).toBe(0)
  })

  it('is granted again on the next Local_Day with a new pick', () => {
    const paths = [pathOf({ progress: twoOfA, dailyPick: pickFor(today, allA) })]
    const first = applyProgressChange(paths, null, 'p1', threeOfA, thu)
    expect(first?.write.dailyBonusCount).toBe(1)

    const fri = at(2025, 6, 6)
    const friPick = pickFor(localDayKey(fri), [q('b', 0), q('b', 1), q('b', 2)])
    const prepared = first!.paths.map((p) => ({ ...p, dailyPick: friPick }))
    const before: Progress = { completed: [], quests: { a: [true, true, true], b: [true, true, false] } }
    const after: Progress = { completed: [], quests: { a: [true, true, true], b: [true, true, true] } }
    const second = applyProgressChange(
      prepared.map((p) => ({ ...p, progress: before })),
      null,
      'p1',
      after,
      fri,
    )
    expect(second?.grantedDailyBonus).toBe(true)
    expect(second?.write.dailyBonusCount).toBe(2)
  })
})

describe('weekly reward', () => {
  // Monday to Wednesday already have ticks; the Thursday tick makes the fourth active day.
  const ticks: QuestTicks = { a: [at(2025, 6, 2), at(2025, 6, 3), at(2025, 6, 4)] }
  const before: Progress = { completed: [], quests: { a: [true, true, true] } }
  const after: Progress = { completed: [], quests: { a: [true, true, true], b: [true, false, false] } }
  const weekly: WeeklyReward = { week: null, count: 0 }

  it('is granted once at the fourth active day of the week', () => {
    const paths = [pathOf({ progress: before, questTicks: ticks })]
    const result = applyProgressChange(paths, weekly, 'p1', after, thu)
    expect(result?.grantedWeeklyReward).toBe(true)
    expect(result?.weeklyReward).toEqual({ week: weekKeyOf(thu), count: 1 })

    const more: Progress = { completed: [], quests: { a: [true, true, true], b: [true, true, false] } }
    const second = applyProgressChange(result!.paths, result!.weeklyReward, 'p1', more, thu)
    expect(second?.grantedWeeklyReward).toBe(false)
    expect(second?.weeklyReward).toEqual({ week: weekKeyOf(thu), count: 1 })
  })

  it('is not granted with only three active days', () => {
    const three: QuestTicks = { a: [at(2025, 6, 2), at(2025, 6, 3), null] }
    const paths = [pathOf({ progress: { completed: [], quests: { a: [true, true, false] } }, questTicks: three })]
    const result = applyProgressChange(paths, weekly, 'p1', before, at(2025, 6, 4))
    expect(result?.grantedWeeklyReward).toBe(false)
    expect(result?.weeklyReward).toEqual(weekly)
  })

  it('is granted again in the next week', () => {
    const rewarded: WeeklyReward = { week: weekKeyOf(thu), count: 1 }
    const nextWeek = [at(2025, 6, 9), at(2025, 6, 10), at(2025, 6, 11), at(2025, 6, 12)]
    expect(weeklyRewardDue(nextWeek, rewarded, at(2025, 6, 12))).toBe(true)
    expect(weeklyRewardDue(nextWeek, { week: weekKeyOf(at(2025, 6, 12)), count: 2 }, at(2025, 6, 12))).toBe(false)
  })

  it('keeps retained history and stamps only the new tick (reset-progress Req 3.6)', () => {
    const kept: QuestTicks = { a: [at(2025, 6, 2), null, null], b: [at(2025, 6, 3), null, null] }
    const paths = [pathOf({ progress: none, questTicks: kept, completedAt: { a: at(2025, 6, 2) } })]
    const result = applyProgressChange(paths, null, 'p1', { completed: [], quests: { a: [false, true, false] } }, thu)
    const path = result?.paths[0]
    expect(path?.questTicks).toEqual({ a: [at(2025, 6, 2), thu, null], b: [at(2025, 6, 3), null, null] })
    expect(path?.completedAt).toEqual({ a: at(2025, 6, 2) })
  })

  it('is not granted when weekly is null', () => {
    const paths = [pathOf({ progress: before, questTicks: ticks })]
    const result = applyProgressChange(paths, null, 'p1', after, thu)
    expect(result?.grantedWeeklyReward).toBe(false)
    expect(result?.weeklyReward).toBeNull()
    expect(weeklyRewardDue([at(2025, 6, 2), at(2025, 6, 3), at(2025, 6, 4), thu], null, thu)).toBe(false)
  })
})

describe('unticking', () => {
  it('leaves the daily and weekly counts unchanged', () => {
    const weekly: WeeklyReward = { week: weekKeyOf(thu), count: 3 }
    const paths = [
      pathOf({
        progress: threeOfA,
        questTicks: { a: [at(2025, 6, 2), at(2025, 6, 3), at(2025, 6, 4)] },
        dailyPick: pickFor(today, allA, true),
        dailyBonusCount: 5,
      }),
    ]
    const result = applyProgressChange(paths, weekly, 'p1', twoOfA, thu)
    expect(result?.grantedDailyBonus).toBe(false)
    expect(result?.grantedWeeklyReward).toBe(false)
    expect(result?.write.dailyBonusCount).toBe(5)
    expect(result?.weeklyReward).toEqual(weekly)
  })
})

describe('withDailyPick', () => {
  it('keeps the bonus count when it stores a new pick', () => {
    const paths = [pathOf({ dailyPick: pickFor('2025-06-04', allA, true), dailyBonusCount: 4 })]
    const result = withDailyPick(paths, 'p1', thu)
    expect(result?.[0]?.dailyPick?.day).toBe(today)
    expect(result?.[0]?.dailyBonusCount).toBe(4)
  })

  it('returns null when the path already has a pick for the day', () => {
    const paths = [pathOf({ dailyPick: pickFor(today, allA) })]
    expect(withDailyPick(paths, 'p1', thu)).toBeNull()
  })
})
