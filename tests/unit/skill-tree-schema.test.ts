import { describe, expect, it } from 'vitest'
import { parseSkillTree } from '../../shared/utils/skill-tree-schema'

const validTree = () => ({
  hobby: 'bouldering',
  sections: [
    {
      title: 'Beginner',
      level: 'beginner',
      nodes: [
        {
          id: 'gear-basics',
          title: 'Gear basics',
          description: 'Shoes, chalk and brushes.',
          prerequisites: [],
          optional: false,
          milestone: false,
          quests: ['Try on shoes', 'Buy chalk', 'Clean a hold'],
        },
      ],
    },
  ],
  mascot: { set: 'bouldering' },
})

describe('parseSkillTree', () => {
  it('accepts a valid tree', () => {
    const tree = validTree()
    expect(parseSkillTree(tree)).toEqual({ ok: true, value: tree })
  })

  it('strips unknown keys without errors', () => {
    const input = { ...validTree(), extra: 1, mascot: { set: 'x', hat: 'red' } }
    const result = parseSkillTree(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).not.toHaveProperty('extra')
      expect(result.value.mascot).toEqual({ set: 'x' })
    }
  })

  it.each([null, [], 'tree', 42, true, undefined])('rejects non-object root %j with path []', (input) => {
    const result = parseSkillTree(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatchObject({ kind: 'schema', path: [] })
    }
  })

  it('reports every mismatch at its path', () => {
    const tree = validTree()
    const node = tree.sections[0]!.nodes[0]!
    const input = {
      ...tree,
      hobby: '   ',
      sections: [{ ...tree.sections[0], level: 'expert', nodes: [{ ...node, quests: ['a', 'b'] }] }],
    }
    const result = parseSkillTree(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path)
      expect(paths).toEqual(
        expect.arrayContaining([['hobby'], ['sections', 0, 'level'], ['sections', 0, 'nodes', 0, 'quests']]),
      )
      expect(paths).toHaveLength(3)
    }
  })

  it('rejects empty sections and nodes lists', () => {
    const result = parseSkillTree({ ...validTree(), sections: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.map((e) => e.path)).toEqual([['sections']])
    const tree = validTree()
    const result2 = parseSkillTree({ ...tree, sections: [{ ...tree.sections[0], nodes: [] }] })
    expect(result2.ok).toBe(false)
    if (!result2.ok) expect(result2.errors.map((e) => e.path)).toEqual([['sections', 0, 'nodes']])
  })

  it('ignores graph rules', () => {
    const tree = validTree()
    const node = tree.sections[0]!.nodes[0]!
    const looped = { ...node, prerequisites: ['gear-basics', 'unknown'] }
    const input = { ...tree, sections: [{ ...tree.sections[0], nodes: [looped, looped] }] }
    expect(parseSkillTree(input).ok).toBe(true)
  })
})
