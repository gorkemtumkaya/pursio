import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import type { ValidationError } from '../../shared/types/validation'
import { formatValidationError, loadSkillTree } from '../../shared/utils/skill-tree-load'
import { validateSkillTree } from '../../shared/utils/skill-tree-validate'

// Wrap the real validator in a spy so calls can be counted without changing its behavior.
vi.mock('../../shared/utils/skill-tree-validate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/utils/skill-tree-validate')>()
  return { validateSkillTree: vi.fn(actual.validateSkillTree) }
})

const node = (id: string, prerequisites: string[] = []): SkillNode => ({
  id,
  title: id,
  description: `About ${id}`,
  prerequisites,
  optional: false,
  milestone: false,
  quests: ['One', 'Two', 'Three'],
})

const tree = (...nodes: SkillNode[]): SkillTree => ({
  hobby: 'bouldering',
  sections: [{ title: 'Basics', level: 'beginner', nodes }],
  mascot: { set: 'bouldering' },
})

afterEach(() => {
  vi.mocked(validateSkillTree).mockClear()
})

describe('loadSkillTree', () => {
  it('returns a valid tree unchanged after running the validator once', () => {
    const input = tree(node('a'), node('b', ['a']))
    const result = loadSkillTree(input)
    expect(result).toEqual({ ok: true, value: input })
    expect(validateSkillTree).toHaveBeenCalledTimes(1)
  })

  it('returns only schema errors and skips the validator for schema-invalid input', () => {
    // Also graph-invalid (duplicate id, self loop), so any graph error would be visible.
    const bad = {
      hobby: 'bouldering',
      sections: [{ title: 'Basics', level: 'beginner', nodes: [{ ...node('a', ['a']), quests: ['One', 'Two'] }, node('a')] }],
      mascot: { set: 'bouldering' },
    }

    const result = loadSkillTree(bad)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.every(error => error.kind === 'schema')).toBe(true)
    expect(result.errors.some(error => error.kind === 'schema' && error.path.join('.') === 'sections.0.nodes.0.quests')).toBe(true)
    expect(validateSkillTree).not.toHaveBeenCalled()
  })

  it('returns schema errors for non-object input without running the validator', () => {
    const result = loadSkillTree(null)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.every(error => error.kind === 'schema')).toBe(true)
    expect(validateSkillTree).not.toHaveBeenCalled()
  })

  it('returns graph errors for schema-valid but graph-invalid input', () => {
    const result = loadSkillTree(tree(node('a', ['b']), node('b', ['a', 'zz']), node('b')))
    expect(result).toEqual({
      ok: false,
      errors: [
        { kind: 'duplicate_id', id: 'b' },
        { kind: 'missing_prerequisite', nodeId: 'b', prerequisiteId: 'zz' },
        { kind: 'cycle', nodeIds: ['a', 'b'] },
      ],
    })
    expect(validateSkillTree).toHaveBeenCalledTimes(1)
  })
})

describe('formatValidationError', () => {
  const cases: [ValidationError, string][] = [
    [{ kind: 'schema', path: ['sections', 0, 'nodes', 2, 'quests'], message: 'Expected 3 items' }, 'sections.0.nodes.2.quests: Expected 3 items'],
    [{ kind: 'schema', path: [], message: 'Expected object' }, 'Expected object'],
    [{ kind: 'duplicate_id', id: 'gear-basics' }, 'Duplicate id "gear-basics"'],
    [{ kind: 'missing_prerequisite', nodeId: 'flagging', prerequisiteId: 'first-v3' }, '"flagging" needs unknown skill "first-v3"'],
    [{ kind: 'cycle', nodeIds: ['a', 'b'] }, 'Prerequisite loop: a → b → a'],
    [{ kind: 'cycle', nodeIds: ['s'] }, 'Prerequisite loop: s → s'],
  ]

  it.each(cases)('formats %o', (error, expected) => {
    expect(formatValidationError(error)).toBe(expected)
  })
})
