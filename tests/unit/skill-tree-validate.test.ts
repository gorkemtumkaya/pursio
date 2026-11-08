import { describe, expect, it } from 'vitest'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { validateSkillTree } from '../../shared/utils/skill-tree-validate'

const node = (id: string, prerequisites: string[] = []): SkillNode => ({
  id,
  title: id,
  description: `About ${id}`,
  prerequisites,
  optional: false,
  milestone: false,
  quests: ['One', 'Two', 'Three'],
})

const tree = (...sections: SkillNode[][]): SkillTree => ({
  hobby: 'bouldering',
  sections: sections.map((nodes, i) => ({ title: `S${i}`, level: 'beginner', nodes })),
  mascot: { set: 'bouldering' },
})

describe('validateSkillTree', () => {
  it('returns no errors for a valid tree with cross-section prerequisites', () => {
    expect(validateSkillTree(tree([node('a'), node('b', ['a'])], [node('c', ['b'])]))).toEqual([])
  })

  it('reports each repeated id once, across sections', () => {
    const errors = validateSkillTree(tree([node('a'), node('b'), node('a')], [node('a'), node('b')]))
    expect(errors).toEqual([
      { kind: 'duplicate_id', id: 'a' },
      { kind: 'duplicate_id', id: 'b' },
    ])
  })

  it('reports each (node, unknown id) pair once and ignores it for cycles', () => {
    const errors = validateSkillTree(tree([node('a', ['x', 'x', 'y']), node('b', ['a', 'x'])]))
    expect(errors).toEqual([
      { kind: 'missing_prerequisite', nodeId: 'a', prerequisiteId: 'x' },
      { kind: 'missing_prerequisite', nodeId: 'a', prerequisiteId: 'y' },
      { kind: 'missing_prerequisite', nodeId: 'b', prerequisiteId: 'x' },
    ])
  })

  it('reports self edges and multi-node cycles in prerequisite order', () => {
    const errors = validateSkillTree(
      tree([node('s', ['s']), node('a', ['c']), node('b', ['a'])], [node('c', ['b'])]),
    )
    expect(errors).toEqual([
      { kind: 'cycle', nodeIds: ['s'] },
      { kind: 'cycle', nodeIds: ['a', 'b', 'c'] },
    ])
  })

  it('orders kinds duplicate, missing, cycle and leaves the input unchanged', () => {
    const input = tree([node('a', ['b']), node('b', ['a', 'zz']), node('b')])
    const snapshot = structuredClone(input)
    expect(validateSkillTree(input).map((e) => e.kind)).toEqual([
      'duplicate_id',
      'missing_prerequisite',
      'cycle',
    ])
    expect(input).toEqual(snapshot)
  })
})
