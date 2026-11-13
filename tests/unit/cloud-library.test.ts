import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillTree } from '../../shared/types/skill-tree'
import { completionPercent } from '../../shared/utils/progress-engine'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { streakDays, weekDays } from '../../shared/utils/streak'
import {
  cloudEntries,
  completionTimes,
  stampCompletions,
  toHobbyLibrary,
  upsertGenerated,
  withArchived,
  withoutPath,
  withPath,
} from '../../app/utils/cloud-library'
import type { CloudPath } from '../../app/utils/cloud-library'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const bouldering: SkillTree = loaded.value
const withHobby = (hobby: string): SkillTree => ({ ...bouldering, hobby })
const guitar = withHobby('Guitar')
const chess = withHobby('Chess')
const [firstId, secondId] = bouldering.sections.flatMap(section => section.nodes.map(node => node.id)) as [
  string,
  string,
]

/** Local noon, so day arithmetic stays clear of midnight and DST changes. */
const noon = (year: number, month: number, day: number): number => new Date(year, month - 1, day, 12).getTime()

function cloudPath(pathId: string, tree: SkillTree, addedAt: number, overrides: Partial<CloudPath> = {}): CloudPath {
  return {
    pathId,
    record: { id: tree.hobby.toLowerCase(), tree, model: 'model-1', addedAt, archived: false },
    level: 'new',
    progress: { completed: [], quests: {} },
    completedAt: {},
    questTicks: {},
    dailyPick: null,
    dailyBonusCount: 0,
    ...overrides,
  }
}

const archived = (path: CloudPath): CloudPath => ({ ...path, record: { ...path.record, archived: true } })

describe('upsertGenerated', () => {
  it('appends a new hobby with the current time and empty Progress', () => {
    const paths = [cloudPath('p1', bouldering, 1)]
    const next = upsertGenerated(paths, { pathId: 'p2', tree: guitar, model: 'model-2', level: 'some' }, 50)
    expect(next).toEqual([
      paths[0],
      {
        pathId: 'p2',
        record: { id: 'guitar', tree: guitar, model: 'model-2', addedAt: 50, archived: false },
        level: 'some',
        progress: { completed: [], quests: {} },
        completedAt: {},
        questTicks: {},
        dailyPick: null,
        dailyBonusCount: 0,
      },
    ])
    expect(paths.length).toBe(1)
  })

  it('replaces a path with the same Hobby_Id in place, keeps addedAt and resets Progress and archived (Req 9.8)', () => {
    const old = archived(
      cloudPath('p2', guitar, 20, {
        level: 'new',
        progress: { completed: [firstId], quests: { [firstId]: [true, true, true] } },
        completedAt: { [firstId]: 123 },
        questTicks: { [firstId]: [124, null, null] },
        dailyPick: { day: '2026-01-14', quests: [{ id: firstId, index: 0 }], bonus: true },
        dailyBonusCount: 3,
      }),
    )
    const paths = [cloudPath('p1', bouldering, 10), old, cloudPath('p3', chess, 30)]
    const tree = withHobby('  GUITAR ')

    const next = upsertGenerated(paths, { pathId: 'p9', tree, model: 'model-9', level: 'serious' }, 99)

    expect(next.map(path => path.record.id)).toEqual(['bouldering', 'guitar', 'chess'])
    expect(next[0]).toBe(paths[0])
    expect(next[2]).toBe(paths[2])
    expect(next[1]).toEqual({
      pathId: 'p9',
      record: { id: 'guitar', tree, model: 'model-9', addedAt: 20, archived: false },
      level: 'serious',
      progress: { completed: [], quests: {} },
      completedAt: {},
      questTicks: {},
      dailyPick: null,
      dailyBonusCount: 0,
    })
    // Its old timestamps no longer count.
    expect(completionTimes(next)).toEqual([])
  })
})

describe('Streak and Week from Completion_Timestamps', () => {
  const now = noon(2026, 1, 14) // a Wednesday

  it('no timestamps gives Streak 0 and no done days (Req 6.8)', () => {
    const paths = [cloudPath('p1', bouldering, 1), archived(cloudPath('p2', guitar, 2))]
    const times = completionTimes(paths)
    expect(times).toEqual([])
    expect(streakDays(times, now)).toBe(0)
    expect(weekDays(times, now).map(day => day.status)).toEqual([
      'missed',
      'missed',
      'missed',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ])
    expect(streakDays(completionTimes([]), now)).toBe(0)
  })

  it('counts the timestamps of every path, archived ones included', () => {
    const paths = [
      cloudPath('p1', bouldering, 1, { completedAt: { [firstId]: noon(2026, 1, 14) } }),
      archived(cloudPath('p2', guitar, 2, { completedAt: { [firstId]: noon(2026, 1, 13), [secondId]: noon(2026, 1, 12) } })),
    ]
    const times = completionTimes(paths)
    expect([...times].sort((a, b) => a - b)).toEqual([noon(2026, 1, 12), noon(2026, 1, 13), noon(2026, 1, 14)])
    expect(streakDays(times, now)).toBe(3)
    expect(weekDays(times, now).filter(day => day.status === 'done').map(day => day.name)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
    ])
    // Without the archived path only today is left.
    expect(streakDays(completionTimes(withoutPath(paths, 'guitar')), now)).toBe(1)
  })
})

describe('stampCompletions', () => {
  it('keeps a set timestamp, stamps a new id and drops ids that are no longer completed', () => {
    const first = stampCompletions({}, { completed: [firstId], quests: {} }, 100)
    expect(first).toEqual({ [firstId]: 100 })
    const second = stampCompletions(first, { completed: [firstId, secondId], quests: {} }, 200)
    expect(second).toEqual({ [firstId]: 100, [secondId]: 200 })
    expect(stampCompletions(second, { completed: [secondId], quests: {} }, 300)).toEqual({ [secondId]: 200 })
    expect(first).toEqual({ [firstId]: 100 })
  })
})

describe('list operations', () => {
  const paths = [cloudPath('p1', bouldering, 10), archived(cloudPath('p2', guitar, 20)), cloudPath('p3', chess, 30)]

  it('toHobbyLibrary keeps the records in order and drops an unknown activeId', () => {
    expect(toHobbyLibrary(paths, 'chess')).toEqual({ hobbies: paths.map(path => path.record), activeId: 'chess' })
    expect(toHobbyLibrary(paths, 'knitting').activeId).toBeNull()
    expect(toHobbyLibrary(paths, null).activeId).toBeNull()
    expect(toHobbyLibrary([], 'chess')).toEqual({ hobbies: [], activeId: null })
  })

  it('cloudEntries lists visible paths, or archived ones alone, with their percent', () => {
    const withProgress = [
      cloudPath('p1', bouldering, 10, { progress: { completed: [firstId], quests: {} } }),
      paths[1] as CloudPath,
      paths[2] as CloudPath,
    ]
    const visible = cloudEntries(withProgress)
    expect(visible.map(entry => [entry.id, entry.hobby, entry.to])).toEqual([
      ['bouldering', 'Bouldering', '/path?hobby=bouldering'],
      ['chess', 'Chess', '/path?hobby=chess'],
    ])
    expect(visible[0]?.percent).toBe(completionPercent(bouldering, { completed: [firstId], quests: {} }))
    expect(visible[0]?.percent).toBeGreaterThan(0)
    expect(visible[1]?.percent).toBe(0)
    expect(cloudEntries(withProgress, { archived: true }).map(entry => entry.id)).toEqual(['guitar'])
  })

  it('withArchived changes one path and leaves an unknown id alone', () => {
    expect(withArchived(paths, 'chess', true).map(path => path.record.archived)).toEqual([false, true, true])
    expect(withArchived(paths, 'guitar', false).map(path => path.record.archived)).toEqual([false, false, false])
    expect(withArchived(paths, 'knitting', true)).toEqual(paths)
  })

  it('withPath puts a removed path back in its place and replaces a path with the same Hobby_Id', () => {
    const guitarPath = paths[1] as CloudPath
    const without = withoutPath(paths, 'guitar')
    expect(without.map(path => path.record.id)).toEqual(['bouldering', 'chess'])
    expect(withPath(without, guitarPath)).toEqual(paths)
    // The last and the first place.
    expect(withPath(withoutPath(paths, 'chess'), paths[2] as CloudPath)).toEqual(paths)
    expect(withPath(withoutPath(paths, 'bouldering'), paths[0] as CloudPath)).toEqual(paths)
    // A path with the same Hobby_Id built meanwhile is replaced, not doubled.
    const rebuilt = [...without, cloudPath('p7', guitar, 40)]
    expect(withPath(rebuilt, guitarPath).map(path => path.pathId)).toEqual(['p1', 'p2', 'p3'])
  })
})
