import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  OPTION_ID,
  OPTION_ID_MAX,
  intakeProfileSchema,
  sanitizeIntakeProfile,
} from '../../shared/utils/learner-profile'
import { arbDamagedProfile, arbIntakeProfile } from '../arbitraries'

const RUNS = { numRuns: 300 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

function nonBlank(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

/** Reference count, written apart from the Sanitizer: goal options that can survive, by distinct id. */
function validGoalOptions(raw: unknown): number {
  if (!isRecord(raw)) return 0
  const list = ownValue(raw, 'goalOptions')
  if (!Array.isArray(list)) return 0
  const ids = new Set<string>()
  for (const entry of list) {
    if (!isRecord(entry)) continue
    const id = ownValue(entry, 'id')
    if (typeof id !== 'string') continue
    const trimmed = id.trim()
    if (trimmed.length < 1 || trimmed.length > OPTION_ID_MAX || !OPTION_ID.test(trimmed)) continue
    if (!nonBlank(ownValue(entry, 'label')) || !nonBlank(ownValue(entry, 'finishLine'))) continue
    ids.add(trimmed)
  }
  return ids.size
}

/** The assertions every input must meet, whatever its shape. */
function check(raw: unknown): void {
  const result = sanitizeIntakeProfile(raw)
  const mustFail = !isRecord(raw) || validGoalOptions(raw) < 2
  expect(result.ok).toBe(!mustFail)
  if (!result.ok) {
    expect(result.reason).toBe(isRecord(raw) ? 'too_few_goals' : 'unparsable')
    return
  }
  // A profile that meets the contract of Requirement 2, criterion 7.
  expect(intakeProfileSchema.safeParse(result.profile).success).toBe(true)
  // Sanitizing the result again changes nothing.
  expect(sanitizeIntakeProfile(result.profile)).toEqual(result)
  // With an empty Note the four learner fields are empty, and the options stay.
  expect(sanitizeIntakeProfile(raw, { noteEmpty: true })).toEqual({
    ok: true,
    profile: { ...result.profile, level: null, goal: null, avoid: [], taste: [] },
  })
}

// Feature: path-intake, Property 3: Sanitizer
// **Validates: Requirements 2.7, 2.8, 2.9, 3.5, 16.17**
describe('Property 3: Sanitizer', () => {
  it('never throws on any JSON value, and fails exactly when it is not an object or has fewer than 2 goal options', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (raw) => {
        expect(() => sanitizeIntakeProfile(raw)).not.toThrow()
        check(raw)
      }),
      RUNS,
    )
  })

  it('repairs a damaged profile into a valid one, or fails for one of the two reasons', () => {
    fc.assert(
      fc.property(arbDamagedProfile, (raw) => {
        expect(() => sanitizeIntakeProfile(raw)).not.toThrow()
        check(raw)
      }),
      RUNS,
    )
  })

  it('is exercised on both outcomes: the damaged cases include repaired profiles and failures', () => {
    const results = fc.sample(arbDamagedProfile, { numRuns: 300, seed: 7 }).map(raw => sanitizeIntakeProfile(raw))
    const repaired = results.filter(result => result.ok).length
    expect(repaired).toBeGreaterThan(30)
    expect(results.length - repaired).toBeGreaterThan(30)
  })

  it('returns a valid profile unchanged', () => {
    fc.assert(
      fc.property(arbIntakeProfile, (profile) => {
        expect(sanitizeIntakeProfile(profile)).toEqual({ ok: true, profile })
      }),
      RUNS,
    )
  })

  it('cuts every list and text to its maximum, keeps ids unique and the goal listed', () => {
    fc.assert(
      fc.property(arbDamagedProfile, (raw) => {
        const result = sanitizeIntakeProfile(raw)
        if (!result.ok) return
        const { goalOptions, knownOptions, tasteOptions, avoid, taste, goal } = result.profile
        expect(goalOptions.length).toBeLessThanOrEqual(4)
        expect(knownOptions.length).toBeLessThanOrEqual(6)
        expect(tasteOptions.length).toBeLessThanOrEqual(5)
        expect(avoid.length).toBeLessThanOrEqual(5)
        expect(taste.length).toBeLessThanOrEqual(5)
        for (const list of [goalOptions, knownOptions, tasteOptions]) {
          expect(new Set(list.map(option => option.id)).size).toBe(list.length)
          for (const option of list) expect(Array.from(option.label).length).toBeLessThanOrEqual(40)
        }
        for (const option of goalOptions) expect(Array.from(option.finishLine).length).toBeLessThanOrEqual(60)
        for (const entry of [...avoid, ...taste]) expect(Array.from(entry).length).toBeLessThanOrEqual(40)
        // The goal is the listed option itself, never a second copy with other texts.
        if (goal !== null) expect(goalOptions).toContainEqual(goal)
      }),
      RUNS,
    )
  })
})
