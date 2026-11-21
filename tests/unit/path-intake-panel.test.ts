import { describe, expect, it } from 'vitest'
import type { IntakeProfile } from '../../shared/types/learner-profile'
import {
  detectedFields,
  finalProfile,
  focusAfterRemoval,
  openPanel,
  removeChip,
  selectQuestions,
  toggleGoal,
  toggleOption,
} from '../../app/utils/intake-panel'

const GOALS = [
  { id: 'songs-at-home', label: 'Play songs I love at home', finishLine: 'Play 5 songs you love, start to finish' },
  { id: 'campfire', label: 'Play around a campfire', finishLine: 'Lead a 3 song campfire sing along' },
]
const KNOWN = [
  { id: 'open-chords', label: 'Open chords' },
  { id: 'basic-strumming', label: 'Basic strumming' },
]
const TASTE = [
  { id: 'spicy', label: 'Spicy' },
  { id: 'quick', label: 'Quick to make' },
]

function profile(over: Partial<IntakeProfile> = {}): IntakeProfile {
  return {
    level: null,
    goal: null,
    avoid: [],
    taste: [],
    goalOptions: GOALS,
    knownOptions: KNOWN,
    tasteOptions: [],
    mascotSet: 'guitar',
    ...over,
  }
}

describe('the Panel by scenario (spec: path-intake, scenarios B, C, D, E)', () => {
  it('B2: four Chips in order Level, Goal, Not for you, Taste', () => {
    const full = profile({ level: 'returning', goal: GOALS[0] ?? null, avoid: ['performing'], taste: ['blues'] })
    expect(detectedFields(full)).toEqual(['level', 'goal', 'avoid', 'taste'])
  })

  it('B3: nothing detected gives no Chip and 2 questions', () => {
    expect(detectedFields(profile())).toEqual([])
    expect(selectQuestions(profile())).toEqual(['goal', 'known'])
  })

  it('B4: only "Not for you" gives one Chip and the goal question', () => {
    const p = profile({ avoid: ['performing'] })
    expect(detectedFields(p)).toEqual(['avoid'])
    expect(selectQuestions(p)[0]).toBe('goal')
  })

  it('C1, C2: removing Goal brings the goal question first and drops the taste question and its picks', () => {
    let state = openPanel(profile({ goal: GOALS[0] ?? null, tasteOptions: TASTE }))
    expect(selectQuestions(state.profile)).toEqual(['known', 'taste'])
    state = toggleOption(state, 'taste', 'spicy')
    state = removeChip(state, 'goal')
    expect(selectQuestions(state.profile)).toEqual(['goal', 'known'])
    expect(state.tasteIds).toEqual([])
  })

  it('C3, D8: a "New to it" Level hides the known question until its Chip is removed', () => {
    let state = openPanel(profile({ level: 'new', goal: GOALS[0] ?? null }))
    expect(selectQuestions(state.profile)).toEqual([])
    state = removeChip(state, 'level')
    expect(selectQuestions(state.profile)).toEqual(['known'])
  })

  it('D4, D5, D6: the question order and the limit of 2', () => {
    expect(selectQuestions(profile({ tasteOptions: TASTE }))).toEqual(['goal', 'known'])
    expect(selectQuestions(profile({ goal: GOALS[0] ?? null, tasteOptions: TASTE }))).toEqual(['known', 'taste'])
    expect(selectQuestions(profile({ goal: GOALS[0] ?? null }))).toEqual(['known'])
  })

  it('D7: the goal question is single select', () => {
    let state = openPanel(profile())
    state = toggleGoal(state, 'songs-at-home')
    state = toggleGoal(state, 'campfire')
    expect(state.goalId).toBe('campfire')
    state = toggleGoal(state, 'campfire')
    expect(state.goalId).toBeNull()
  })

  it('D10: no known options means no known question', () => {
    expect(selectQuestions(profile({ knownOptions: [], tasteOptions: TASTE }))).toEqual(['goal', 'taste'])
  })

  it('E1, E3: build takes the picks, skip ignores them', () => {
    let state = openPanel(profile({ avoid: ['performing'] }))
    state = toggleGoal(state, 'songs-at-home')
    state = toggleOption(state, 'known', 'basic-strumming')
    state = toggleOption(state, 'known', 'open-chords')
    const built = finalProfile(state, 'build')
    expect(built.goal?.id).toBe('songs-at-home')
    expect(built.known.map((option) => option.id)).toEqual(['open-chords', 'basic-strumming'])
    expect(built.avoid).toEqual(['performing'])
    expect(finalProfile(state, 'skip')).toMatchObject({ goal: null, known: [], avoid: ['performing'] })
  })

  it('focus after a removal: next Chip, else previous, else the first question', () => {
    expect(focusAfterRemoval(['level', 'goal', 'avoid'], 'goal')).toEqual({ kind: 'chip', field: 'avoid' })
    expect(focusAfterRemoval(['level', 'goal'], 'goal')).toEqual({ kind: 'chip', field: 'level' })
    expect(focusAfterRemoval(['goal'], 'goal')).toEqual({ kind: 'question' })
  })
})
