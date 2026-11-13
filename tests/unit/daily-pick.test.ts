import { describe, expect, it } from 'vitest'
import type { DailyPick } from '../../shared/types/cloud'
import type { Progress, QuestId } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import {
  candidateQuests,
  DAILY_PICK_SIZE,
  needsNewPick,
  newDailyPick,
  pickDailyQuests,
} from '../../shared/utils/daily-pick'

const node = (id: string, opts: Partial<SkillNode> = {}): SkillNode => ({
  id,
  title: id,
  description: `${id} description`,
  prerequisites: [],
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
  ...opts,
})

const treeOf = (nodes: SkillNode[]): SkillTree => ({
  hobby: 'bouldering',
  mascot: { set: 'bouldering' },
  sections: [{ title: 'Beginner', level: 'beginner', nodes }],
})

const none: Progress = { completed: [], quests: {} }
const q = (id: string, index: 0 | 1 | 2): QuestId => ({ id, index })

// Document order: side1, main1 (current), main2 (open, not current), side2, locked.
const mixed = treeOf([
  node('side1', { optional: true }),
  node('main1'),
  node('main2'),
  node('side2', { optional: true }),
  node('locked', { prerequisites: ['main1'] }),
])

describe('candidateQuests group order', () => {
  it('lists Current_Node, then open side quests, then other open nodes', () => {
    const ids = [...new Set(candidateQuests(mixed, none).map((c) => c.id))]
    expect(ids).toEqual(['main1', 'side1', 'side2', 'main2'])
  })

  it('orders quests inside a node by index', () => {
    expect(candidateQuests(treeOf([node('a')]), none)).toEqual([q('a', 0), q('a', 1), q('a', 2)])
  })

  it('keeps document order inside the side quest group', () => {
    const tree = treeOf([node('main'), node('s2', { optional: true }), node('s1', { optional: true })])
    const ids = [...new Set(candidateQuests(tree, none).map((c) => c.id))]
    expect(ids).toEqual(['main', 's2', 's1'])
  })

  it('keeps document order inside the other open nodes group', () => {
    const tree = treeOf([node('cur'), node('z'), node('a')])
    const ids = [...new Set(candidateQuests(tree, none).map((c) => c.id))]
    expect(ids).toEqual(['cur', 'z', 'a'])
  })
})

describe('pickDailyQuests', () => {
  it('limits the pick to 3 quests', () => {
    expect(DAILY_PICK_SIZE).toBe(3)
    const pick = pickDailyQuests(mixed, none)
    expect(pick).toEqual([q('main1', 0), q('main1', 1), q('main1', 2)])
  })

  it('returns fewer than 3 when fewer candidates exist', () => {
    const progress: Progress = { completed: [], quests: { a: [true, false, true] } }
    expect(pickDailyQuests(treeOf([node('a')]), progress)).toEqual([q('a', 1)])
  })

  it('continues into the next group when the current node has fewer left', () => {
    const progress: Progress = { completed: [], quests: { main1: [true, true, false] } }
    expect(pickDailyQuests(mixed, progress)).toEqual([
      q('main1', 2),
      q('side1', 0),
      q('side1', 1),
    ])
  })

  it('excludes ticked quests', () => {
    const progress: Progress = { completed: [], quests: { a: [true, true, true] } }
    const tree = treeOf([node('a'), node('b')])
    const ids = candidateQuests(tree, progress).map((c) => c.id)
    expect(ids).not.toContain('a')
    expect(ids).toEqual(['b', 'b', 'b'])
  })

  it('excludes locked nodes', () => {
    const tree = treeOf([node('a'), node('b', { prerequisites: ['a'] })])
    expect(candidateQuests(tree, none).every((c) => c.id === 'a')).toBe(true)
  })

  it('excludes completed nodes', () => {
    const tree = treeOf([node('a'), node('b', { prerequisites: ['a'] })])
    const ids = candidateQuests(tree, { completed: ['a'], quests: {} }).map((c) => c.id)
    expect(ids).toEqual(['b', 'b', 'b'])
  })

  it('gives the same output for the same input', () => {
    const progress: Progress = { completed: [], quests: { main1: [false, true, false] } }
    expect(pickDailyQuests(mixed, progress)).toEqual(pickDailyQuests(mixed, progress))
    expect(newDailyPick(mixed, progress, '2026-11-09')).toEqual(
      newDailyPick(mixed, progress, '2026-11-09'),
    )
  })
})

describe('newDailyPick', () => {
  it('builds a pick for the day without a bonus', () => {
    expect(newDailyPick(treeOf([node('a')]), none, '2026-11-09')).toEqual({
      day: '2026-11-09',
      quests: [q('a', 0), q('a', 1), q('a', 2)],
      bonus: false,
    })
  })

  it('returns null when there is no candidate', () => {
    const tree = treeOf([node('a')])
    expect(newDailyPick(tree, { completed: ['a'], quests: {} }, '2026-11-09')).toBeNull()
    expect(newDailyPick(tree, { completed: [], quests: { a: [true, true, true] } }, 'd')).toBeNull()
  })
})

describe('needsNewPick', () => {
  const pick: DailyPick = { day: '2026-11-09', quests: [], bonus: false }

  it('is false for a pick of the same day', () => {
    expect(needsNewPick(pick, '2026-11-09')).toBe(false)
  })

  it('is true for a pick of another day', () => {
    expect(needsNewPick(pick, '2026-11-10')).toBe(true)
  })

  it('is true when there is no pick', () => {
    expect(needsNewPick(null, '2026-11-09')).toBe(true)
  })
})
