import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { IntakeProfile } from '../../shared/types/learner-profile'
import { parseFinalProfile } from '../../shared/utils/learner-profile'
import {
  answeredProps,
  detectedFields,
  finalProfile,
  openPanel,
  PROFILE_FIELDS,
  removeChip,
  selectQuestions,
  toggleGoal,
  toggleOption,
  type PanelState,
  type QuestionKind,
} from '../../app/utils/intake-panel'
import { arbPanelRun, type PanelOp } from '../arbitraries'

const RUNS = { numRuns: 300 }

function idFor(state: PanelState, op: Exclude<PanelOp, { kind: 'remove' }>): string {
  if (op.stray) return `stray-${op.pick}`
  const list = op.kind === 'goal' ? state.profile.goalOptions : op.kind === 'known' ? state.profile.knownOptions : state.profile.tasteOptions
  return list[op.pick % Math.max(1, list.length)]?.id ?? 'none'
}

function apply(state: PanelState, op: PanelOp): PanelState {
  if (op.kind === 'remove') return removeChip(state, op.field)
  if (op.kind === 'goal') return toggleGoal(state, idFor(state, op))
  return toggleOption(state, op.kind, idFor(state, op))
}

/** Every state a run passes through, starting with the opened Panel. */
function states({ profile, ops }: { profile: IntakeProfile; ops: PanelOp[] }): PanelState[] {
  const all = [openPanel(profile)]
  for (const op of ops) all.push(apply(all[all.length - 1] ?? openPanel(profile), op))
  return all
}

/** The questions Requirement 5.1 allows, written apart from `selectQuestions`. */
function allowed(profile: IntakeProfile): Set<QuestionKind> {
  const set = new Set<QuestionKind>()
  if (profile.goal === null) set.add('goal')
  if (profile.level !== 'new' && profile.knownOptions.length > 0) set.add('known')
  if (profile.tasteOptions.length > 0 && profile.taste.length === 0) set.add('taste')
  return set
}

const ORDER: QuestionKind[] = ['goal', 'known', 'taste']

// Feature: path-intake, Property 1: Question selection
// **Validates: Requirements 5.1, 16.1**
describe('Property 1: Question selection', () => {
  it('asks at most 2 questions, in order, only for what is allowed, and none allowed is skipped below 2', () => {
    fc.assert(
      fc.property(arbPanelRun, (run) => {
        for (const state of states(run)) {
          const questions = selectQuestions(state.profile)
          const ok = allowed(state.profile)
          expect(questions.length).toBeLessThanOrEqual(2)
          expect(new Set(questions).size).toBe(questions.length)
          expect(questions).toEqual(ORDER.filter(kind => questions.includes(kind)))
          for (const kind of questions) expect(ok.has(kind)).toBe(true)
          if (questions.length < 2) expect(questions.length).toBe(ok.size)
          // The first allowed kinds are the ones asked.
          expect(questions).toEqual(ORDER.filter(kind => ok.has(kind)).slice(0, 2))
        }
      }),
      RUNS,
    )
  })
})

// Feature: path-intake, Property 2: Chip removal
// **Validates: Requirements 4.5, 5.5, 16.2**
describe('Property 2: Chip removal', () => {
  it('empties exactly the removed field, never adds a Chip, and only then allows its question', () => {
    fc.assert(
      fc.property(arbPanelRun, fc.constantFrom(...PROFILE_FIELDS), (run, field) => {
        for (const before of states(run)) {
          const after = removeChip(before, field)
          const wasDetected = detectedFields(before.profile).includes(field)
          if (!wasDetected) {
            expect(after).toBe(before)
            continue
          }
          expect(detectedFields(after.profile)).toEqual(detectedFields(before.profile).filter(f => f !== field))
          for (const other of PROFILE_FIELDS.filter(f => f !== field)) expect(after.profile[other]).toEqual(before.profile[other])
          expect(after.profile[field]).toEqual(field === 'level' || field === 'goal' ? null : [])
          // The question of a detected goal or taste is never asked before the removal.
          if (field === 'goal') expect(selectQuestions(before.profile)).not.toContain('goal')
          if (field === 'taste') expect(selectQuestions(before.profile)).not.toContain('taste')
          // Selections of questions that are not shown are dropped.
          const shown = selectQuestions(after.profile)
          if (!shown.includes('goal')) expect(after.goalId).toBeNull()
          if (!shown.includes('known')) expect(after.knownIds).toEqual([])
          if (!shown.includes('taste')) expect(after.tasteIds).toEqual([])
        }
      }),
      RUNS,
    )
  })
})

// Feature: path-intake, Property 9: Final profile
// **Validates: Requirements 6.1, 6.2, 7.2, 14.4, 16.9**
describe('Property 9: Final profile', () => {
  it('skip ignores every selection; build takes offered selections; both pass the request check', () => {
    fc.assert(
      fc.property(arbPanelRun, (run) => {
        for (const state of states(run)) {
          const skip = finalProfile(state, 'skip')
          expect(skip.known).toEqual([])
          expect(skip.goal).toEqual(state.profile.goal)
          expect(skip.taste).toEqual(state.profile.taste)

          const build = finalProfile(state, 'build')
          const knownIds = new Set(state.profile.knownOptions.map(option => option.id))
          expect(build.known.length).toBeLessThanOrEqual(6)
          expect(new Set(build.known.map(option => option.id)).size).toBe(build.known.length)
          for (const option of build.known) expect(knownIds.has(option.id)).toBe(true)
          // The goal comes from the Chip or from the question, never both.
          if (state.profile.goal !== null) expect(build.goal).toEqual(state.profile.goal)
          else expect(build.goal?.id ?? null).toBe(state.goalId)

          for (const final of [skip, build]) {
            expect(parseFinalProfile(JSON.parse(JSON.stringify(final)))).toEqual({ ok: true, profile: final })
          }
          const props = answeredProps(state)
          expect(props.goal_set).toBe(build.goal !== null)
          expect(props.known_count).toBe(build.known.length)
        }
      }),
      RUNS,
    )
  })
})
