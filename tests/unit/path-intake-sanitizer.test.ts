// The Sanitizer at each limit of Requirement 16.6 (spec: path-intake).
import { describe, expect, it } from 'vitest'
import type { IntakeProfile } from '../../shared/types/learner-profile'
import { sanitizeIntakeProfile } from '../../shared/utils/learner-profile'

const goal = (i: number) => ({ id: `goal-${i}`, label: `Goal ${i}`, finishLine: `Finish ${i}` })
const option = (i: number) => ({ id: `skill-${i}`, label: `Skill ${i}` })
const goals = (n: number) => Array.from({ length: n }, (_, i) => goal(i))
const options = (n: number) => Array.from({ length: n }, (_, i) => option(i))

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    level: 'returning',
    goal: goal(0),
    avoid: ['performing'],
    taste: [],
    goalOptions: goals(4),
    knownOptions: options(4),
    tasteOptions: [],
    mascotSet: 'guitar',
    ...over,
  }
}

function profileOf(raw: unknown): IntakeProfile {
  const result = sanitizeIntakeProfile(raw)
  if (!result.ok) throw new Error(`expected a profile, got ${result.reason}`)
  return result.profile
}

describe('sanitizeIntakeProfile at each limit (Req 2.8, 16.6)', () => {
  it('goal options: 1 fails, 2 and 4 pass, 5 is cut to 4', () => {
    expect(sanitizeIntakeProfile(base({ goalOptions: goals(1), goal: null }))).toEqual({ ok: false, reason: 'too_few_goals' })
    expect(profileOf(base({ goalOptions: goals(2) })).goalOptions).toHaveLength(2)
    expect(profileOf(base({ goalOptions: goals(4) })).goalOptions).toHaveLength(4)
    expect(profileOf(base({ goalOptions: goals(5) })).goalOptions.map(o => o.id)).toEqual(['goal-0', 'goal-1', 'goal-2', 'goal-3'])
  })

  it('known options: 0 and 6 pass, 7 is cut to 6', () => {
    expect(profileOf(base({ knownOptions: [] })).knownOptions).toEqual([])
    expect(profileOf(base({ knownOptions: options(6) })).knownOptions).toHaveLength(6)
    expect(profileOf(base({ knownOptions: options(7) })).knownOptions).toEqual(options(6))
  })

  it('taste options: 5 pass, 6 is cut to 5', () => {
    expect(profileOf(base({ tasteOptions: options(5) })).tasteOptions).toHaveLength(5)
    expect(profileOf(base({ tasteOptions: options(6) })).tasteOptions).toEqual(options(5))
  })

  it('labels: 40 characters stay, 41 are cut to 40', () => {
    const at40 = 'a'.repeat(40)
    expect(profileOf(base({ knownOptions: [{ id: 'k', label: at40 }] })).knownOptions[0]?.label).toBe(at40)
    expect(profileOf(base({ knownOptions: [{ id: 'k', label: `${at40}b` }] })).knownOptions[0]?.label).toBe(at40)
  })

  it('finish line: 60 characters stay, 61 are cut to 60', () => {
    const at60 = 'f'.repeat(60)
    const listed = (finishLine: string) => [{ id: 'g', label: 'G', finishLine }, goal(1)]
    expect(profileOf(base({ goalOptions: listed(at60), goal: null })).goalOptions[0]?.finishLine).toBe(at60)
    expect(profileOf(base({ goalOptions: listed(`${at60}x`), goal: null })).goalOptions[0]?.finishLine).toBe(at60)
  })

  it('a repeated id keeps the first option; an option without a label or with a bad id is dropped', () => {
    const known = [option(1), { id: 'skill-1', label: 'Second copy' }, { id: 'no-label' }, { id: 'Bad Id', label: 'x' }, option(2)]
    expect(profileOf(base({ knownOptions: known })).knownOptions).toEqual([option(1), option(2)])
  })

  it('a goal that is not one of the options becomes null; a listed one is the option itself', () => {
    expect(profileOf(base({ goal: { id: 'other', label: 'x', finishLine: 'y' } })).goal).toBeNull()
    expect(profileOf(base({ goal: { id: 'goal-2', label: 'changed label', finishLine: 'changed' } })).goal).toEqual(goal(2))
  })

  it('an unknown outfit becomes explorer; a wrong level becomes null', () => {
    const profile = profileOf(base({ mascotSet: 'wizard', level: 'expert' }))
    expect(profile.mascotSet).toBe('explorer')
    expect(profile.level).toBeNull()
  })

  it('an answer that is not an object fails as unparsable', () => {
    for (const raw of [null, 'text', 3, [base()]]) {
      expect(sanitizeIntakeProfile(raw)).toEqual({ ok: false, reason: 'unparsable' })
    }
  })

  it('with an empty Note, level, goal, avoid and taste are emptied and the options stay', () => {
    const result = sanitizeIntakeProfile(base({ taste: ['spicy'] }), { noteEmpty: true })
    expect(result.ok && result.profile).toMatchObject({ level: null, goal: null, avoid: [], taste: [] })
    expect(result.ok && result.profile.goalOptions).toHaveLength(4)
  })
})
