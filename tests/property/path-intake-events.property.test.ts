import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { IntakeProfile } from '../../shared/types/learner-profile'
import { PROFILE_FIELDS, answeredProps, openPanel, removeChip, shownProps, toggleGoal, toggleOption } from '../../app/utils/intake-panel'
import { arbIntakeProfile } from '../arbitraries'

const RUNS = { numRuns: 300 }

/** Every text the learner or the model put in the profile. */
function texts(profile: IntakeProfile): string[] {
  return [
    ...profile.avoid,
    ...profile.taste,
    ...profile.goalOptions.flatMap((option) => [option.label, option.finishLine, option.id]),
    ...profile.knownOptions.flatMap((option) => [option.label, option.id]),
    ...profile.tasteOptions.flatMap((option) => [option.label, option.id]),
  ]
}

function pickId(list: readonly { id: string }[], pick: number): string {
  return list[pick % Math.max(1, list.length)]?.id ?? ''
}

// Feature: path-intake, Property 10: Events carry no text
// **Validates: Requirements 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 16.13**
describe('Property 10: Events carry no text', () => {
  it('sends only field names, counts and booleans', () => {
    fc.assert(
      fc.property(arbIntakeProfile, fc.array(fc.nat(), { maxLength: 6 }), fc.subarray([...PROFILE_FIELDS]), (profile, picks, removed) => {
        let state = openPanel(profile)
        for (const pick of picks) {
          state = toggleGoal(state, pickId(profile.goalOptions, pick))
          state = toggleOption(state, 'known', pickId(profile.knownOptions, pick))
          state = toggleOption(state, 'taste', pickId(profile.tasteOptions, pick))
        }
        for (const field of removed) state = removeChip(state, field)

        const shown = shownProps(state)
        expect(Object.keys(shown).sort()).toEqual(['detected_fields', 'questions_count'])
        for (const field of shown.detected_fields) expect(PROFILE_FIELDS).toContain(field)
        expect(Number.isInteger(shown.questions_count)).toBe(true)

        const answered = answeredProps(state)
        expect(Object.keys(answered).sort()).toEqual(['goal_set', 'known_count', 'taste_count'])
        expect(typeof answered.goal_set).toBe('boolean')
        expect(answered.known_count).toBeLessThanOrEqual(6)
        expect(answered.taste_count).toBeLessThanOrEqual(5)

        // No value equals or contains a text of the case. Field names are allowed (Req 14.7).
        const values = [...shown.detected_fields, shown.questions_count, ...Object.values(answered)].map(String)
        for (const text of texts(profile)) {
          if (text.length < 3 || (PROFILE_FIELDS as readonly string[]).includes(text)) continue
          for (const value of values) expect(value.includes(text)).toBe(false)
        }
      }),
      RUNS,
    )
  })
})
