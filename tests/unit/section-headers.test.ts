import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { sectionHeaderModels } from '../../app/utils/section-headers'

function node(id: string, prerequisites: string[], extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id,
    title: id.toUpperCase(),
    description: 'd',
    prerequisites,
    optional: false,
    milestone: false,
    quests: ['a', 'b', 'c'],
    ...extra,
  }
}

const tree: SkillTree = {
  hobby: 'test',
  mascot: { set: 'explorer' },
  sections: [
    {
      title: 'Start',
      level: 'beginner',
      nodes: [
        node('a', []),
        node('s', ['a'], { optional: true }),
        node('m1', ['a'], { milestone: true }),
      ],
    },
    { title: 'Middle', level: 'intermediate', nodes: [node('b', ['m1']), node('m2', ['b'], { milestone: true })] },
    { title: 'End', level: 'advanced', nodes: [node('c', ['m2'])] },
  ],
}

const progress = (completed: string[]): Progress => ({ completed, quests: {} })

describe('sectionHeaderModels', () => {
  it('builds a banner for the first section on empty progress', () => {
    const models = sectionHeaderModels(tree, progress([]))
    expect(models.map((m) => m.eyebrow)).toEqual([
      'SECTION 1 · BEGINNER',
      'SECTION 2 · INTERMEDIATE',
      'SECTION 3 · ADVANCED',
    ])
    expect(models[0]).toEqual({
      index: 0,
      eyebrow: 'SECTION 1 · BEGINNER',
      title: 'Start',
      variant: 'banner',
      count: { done: 0, total: 2 },
      lockedBy: null,
    })
    expect(models[1]).toMatchObject({ variant: 'divider', count: null, lockedBy: 'M1' })
    expect(models[2]).toMatchObject({ variant: 'divider', count: null, lockedBy: 'M2' })
  })

  it('excludes side quests from the count', () => {
    const models = sectionHeaderModels(tree, progress(['a', 's']))
    expect(models[0]?.count).toEqual({ done: 1, total: 2 })
  })

  it('moves the banner and clears the lock when the milestone completes', () => {
    const models = sectionHeaderModels(tree, progress(['a', 'm1']))
    expect(models.map((m) => m.variant)).toEqual(['divider', 'banner', 'divider'])
    expect(models[0]).toMatchObject({ count: null, lockedBy: null })
    expect(models[1]).toMatchObject({ count: { done: 0, total: 2 }, lockedBy: null })
    expect(models[2]?.lockedBy).toBe('M2')
  })

  it('makes the last section the banner when everything is done', () => {
    const models = sectionHeaderModels(tree, progress(['a', 'm1', 'b', 'm2', 'c']))
    expect(models.map((m) => m.variant)).toEqual(['divider', 'divider', 'banner'])
    expect(models[2]?.count).toEqual({ done: 1, total: 1 })
    expect(models.every((m) => m.lockedBy === null)).toBe(true)
  })
})
