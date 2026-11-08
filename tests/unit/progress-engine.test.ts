import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import {
  activeSectionIndex,
  checkedCount,
  deriveNodeStates,
  diffUnlocked,
  emptyProgress,
  findCurrentNodeId,
  isAvailable,
  markComplete,
  toggleQuest,
} from '../../shared/utils/progress-engine'

const node = (id: string, prerequisites: string[], extra: Partial<SkillNode> = {}): SkillNode => ({
  id,
  title: id,
  description: `${id} description`,
  prerequisites,
  optional: false,
  milestone: false,
  quests: ['q1', 'q2', 'q3'],
  ...extra,
})

const tree: SkillTree = {
  hobby: 'bouldering',
  mascot: { set: 'bouldering' },
  sections: [
    {
      title: 'Beginner',
      level: 'beginner',
      nodes: [
        node('a', []),
        node('side', ['a'], { optional: true }),
        node('b', ['a']),
        node('m1', ['b'], { milestone: true }),
      ],
    },
    { title: 'Intermediate', level: 'intermediate', nodes: [node('c', ['m1'])] },
  ],
}

describe('progress engine', () => {
  it('derives initial states', () => {
    const states = deriveNodeStates(tree, emptyProgress())
    expect(Object.fromEntries(states)).toEqual({
      a: 'current',
      side: 'locked',
      b: 'locked',
      m1: 'milestone',
      c: 'locked',
    })
    expect(findCurrentNodeId(tree, emptyProgress())).toBe('a')
    expect(activeSectionIndex(tree, emptyProgress())).toBe(0)
  })

  it('completes the current node and unlocks the next ones', () => {
    const before = deriveNodeStates(tree, emptyProgress())
    const result = markComplete(tree, emptyProgress(), 'a')
    expect(result).toMatchObject({ completed: true, kind: 'main', nextCurrentId: 'b' })
    expect(result.progress.completed).toEqual(['a'])
    const after = deriveNodeStates(tree, result.progress)
    expect(after.get('side')).toBe('side_quest')
    expect(diffUnlocked(before, after).sort()).toEqual(['b', 'side'])
  })

  it('reports side quest completion without changing the current node', () => {
    const p = markComplete(tree, emptyProgress(), 'a').progress
    const result = markComplete(tree, p, 'side')
    expect(result).toMatchObject({ completed: true, kind: 'side', nextCurrentId: 'b' })
  })

  it('returns the same object for unknown, completed or unavailable ids', () => {
    const p = markComplete(tree, emptyProgress(), 'a').progress
    for (const id of ['nope', 'a', 'c']) {
      const result = markComplete(tree, p, id)
      expect(result.completed).toBe(false)
      expect(result.progress).toBe(p)
    }
    expect(isAvailable(tree, p, 'c')).toBe(false)
  })

  it('keeps quests when completing and toggles a copy', () => {
    const p0 = emptyProgress()
    const p1 = toggleQuest(tree, p0, 'a', 1)
    expect(p0.quests).toEqual({})
    expect(p1.quests.a).toEqual([false, true, false])
    expect(checkedCount(p1, 'a')).toBe(1)
    expect(checkedCount(p1, 'b')).toBe(0)
    expect(toggleQuest(tree, p1, 'nope', 0)).toBe(p1)
    expect(markComplete(tree, p1, 'a').progress.quests).toEqual(p1.quests)
  })

  it('uses the last section when the path is complete', () => {
    let p = emptyProgress()
    for (const id of ['a', 'b', 'm1', 'c']) p = markComplete(tree, p, id).progress
    expect(findCurrentNodeId(tree, p)).toBeNull()
    expect(activeSectionIndex(tree, p)).toBe(1)
  })
})

function loadSample(): SkillTree {
  const samplePath = fileURLToPath(new URL('../../data/sample-bouldering.json', import.meta.url))
  const result = loadSkillTree(JSON.parse(readFileSync(samplePath, 'utf8')) as unknown)
  if (!result.ok) throw new Error(`Sample_Tree failed to load: ${JSON.stringify(result.errors)}`)
  return result.value
}

describe('progress engine on the Sample_Tree', () => {
  const sample = loadSample()

  it('completing "Reading grades" unlocks only "Warm-up routine" and "Falling safely" (9.5)', () => {
    const afterGear = markComplete(sample, emptyProgress(), 'gear-basics').progress
    const before = deriveNodeStates(sample, afterGear)
    expect(before.get('reading-grades')).toBe('current')

    const result = markComplete(sample, afterGear, 'reading-grades')
    expect(result).toMatchObject({ completed: true, kind: 'main', nextCurrentId: 'warm-up-routine' })

    const after = deriveNodeStates(sample, result.progress)
    expect(after.get('reading-grades')).toBe('completed')
    expect(after.get('warm-up-routine')).toBe('current')
    expect(after.get('falling-safely')).toBe('side_quest')
    expect(diffUnlocked(before, after).sort()).toEqual(['falling-safely', 'warm-up-routine'])
  })

  it('toggleQuest creates [false, false, false] first and ignores unknown ids (8.7)', () => {
    const p0 = emptyProgress()
    const p1 = toggleQuest(sample, p0, 'reading-grades', 2)
    expect(p0.quests).toEqual({})
    expect(p1.quests['reading-grades']).toEqual([false, false, true])
    expect(toggleQuest(sample, p1, 'reading-grades', 2).quests['reading-grades']).toEqual([
      false,
      false,
      false,
    ])
    expect(toggleQuest(sample, p1, 'not-a-skill', 0)).toBe(p1)
  })
})
