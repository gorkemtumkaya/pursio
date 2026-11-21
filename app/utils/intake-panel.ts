// Panel state of path intake (spec: path-intake, Requirements 4 to 6 and 14). Pure, no Nuxt imports.
import type { FinalProfile, GoalOption, IntakeProfile, Option } from '#shared/types/learner-profile'
import { KNOWN_MAX } from '#shared/utils/learner-profile'

export type ProfileField = 'level' | 'goal' | 'avoid' | 'taste'
export type QuestionKind = 'goal' | 'known' | 'taste'

/** Chip order (Req 4.2). */
export const PROFILE_FIELDS: readonly ProfileField[] = ['level', 'goal', 'avoid', 'taste']

export interface PanelState {
  /** The Intake_Profile, with the fields of removed Chips cleared. */
  profile: IntakeProfile
  /** Selection of the goal question (single select). */
  goalId: string | null
  /** Selections of the known skills question, in tap order. */
  knownIds: string[]
  /** Selections of the taste question, in tap order. */
  tasteIds: string[]
}

export function openPanel(profile: IntakeProfile): PanelState {
  return { profile, goalId: null, knownIds: [], tasteIds: [] }
}

function isDetected(profile: IntakeProfile, field: ProfileField): boolean {
  switch (field) {
    case 'level':
      return profile.level !== null
    case 'goal':
      return profile.goal !== null
    case 'avoid':
      return profile.avoid.length > 0
    case 'taste':
      return profile.taste.length > 0
  }
}

/** The Detected_Fields, in Chip order: level, goal, avoid, taste (Req 4.2). */
export function detectedFields(profile: IntakeProfile): ProfileField[] {
  return PROFILE_FIELDS.filter((field) => isDetected(profile, field))
}

/** At most 2 questions, only for what is missing, in the order goal, known, taste (Req 5.1). */
export function selectQuestions(profile: IntakeProfile): QuestionKind[] {
  const list: QuestionKind[] = []
  if (profile.goal === null) list.push('goal')
  // No "What can you already do?" right after the learner said they are new (decision 18).
  if (profile.level !== 'new' && profile.knownOptions.length > 0) list.push('known')
  if (profile.tasteOptions.length > 0 && profile.taste.length === 0) list.push('taste')
  return list.slice(0, 2)
}

/** Drops the selections of every question that is not shown (Req 5.5). */
function keepShownSelections(state: PanelState): PanelState {
  const shown = new Set(selectQuestions(state.profile))
  return {
    ...state,
    goalId: shown.has('goal') ? state.goalId : null,
    knownIds: shown.has('known') ? state.knownIds : [],
    tasteIds: shown.has('taste') ? state.tasteIds : [],
  }
}

/** Sets the field to its empty value; the other fields stay (Req 4.5). Removing an empty field changes nothing. */
export function removeChip(state: PanelState, field: ProfileField): PanelState {
  if (!isDetected(state.profile, field)) return state
  const profile: IntakeProfile = { ...state.profile }
  if (field === 'level') profile.level = null
  else if (field === 'goal') profile.goal = null
  else if (field === 'avoid') profile.avoid = []
  else profile.taste = []
  return keepShownSelections({ ...state, profile })
}

/** Single select: tapping an option selects it, tapping the selected one clears it (Req 5.2, decision 16). */
export function toggleGoal(state: PanelState, id: string): PanelState {
  if (!selectQuestions(state.profile).includes('goal')) return state
  if (!state.profile.goalOptions.some((option) => option.id === id)) return state
  return { ...state, goalId: state.goalId === id ? null : id }
}

/** Multi select of known skills or taste; ids that are not offered, or a question not shown, change nothing. */
export function toggleOption(state: PanelState, kind: 'known' | 'taste', id: string): PanelState {
  if (!selectQuestions(state.profile).includes(kind)) return state
  const offered = kind === 'known' ? state.profile.knownOptions : state.profile.tasteOptions
  if (!offered.some((option) => option.id === id)) return state
  const current = kind === 'known' ? state.knownIds : state.tasteIds
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id]
  return kind === 'known' ? { ...state, knownIds: next } : { ...state, tasteIds: next }
}

/** Selected options in the order they are offered. */
function selected<T extends Option>(offered: readonly T[], ids: readonly string[]): T[] {
  const chosen = new Set(ids)
  return offered.filter((option) => chosen.has(option.id))
}

/**
 * The Final_Profile (Req 6.1, 6.2). `build`: the remaining Chips plus the selections of the shown
 * questions. `skip`: the remaining Chips only; every selection is ignored and `known` is empty.
 */
export function finalProfile(state: PanelState, mode: 'build' | 'skip'): FinalProfile {
  const { profile } = state
  const shown = new Set(selectQuestions(profile))
  const use = mode === 'build'
  const pickedGoal: GoalOption | null =
    use && shown.has('goal') ? (profile.goalOptions.find((option) => option.id === state.goalId) ?? null) : null
  const pickedTaste = use && shown.has('taste') ? selected(profile.tasteOptions, state.tasteIds).map((option) => option.label) : []
  return {
    level: profile.level,
    goal: profile.goal ?? pickedGoal,
    avoid: [...profile.avoid],
    taste: profile.taste.length > 0 ? [...profile.taste] : pickedTaste,
    known: use && shown.has('known') ? selected(profile.knownOptions, state.knownIds).slice(0, KNOWN_MAX) : [],
    goalOptions: profile.goalOptions,
  }
}

/** `intake_shown` (Req 14.2). Field names and a count only. */
export function shownProps(state: PanelState): { detected_fields: ProfileField[]; questions_count: number } {
  return { detected_fields: detectedFields(state.profile), questions_count: selectQuestions(state.profile).length }
}

/** `intake_answered` (Req 14.4): the counts of the Final_Profile built from the Panel. */
export function answeredProps(state: PanelState): { goal_set: boolean; known_count: number; taste_count: number } {
  const final = finalProfile(state, 'build')
  const shown = selectQuestions(state.profile)
  return {
    goal_set: final.goal !== null,
    known_count: final.known.length,
    taste_count: shown.includes('taste') ? selected(state.profile.tasteOptions, state.tasteIds).length : 0,
  }
}

/** Where focus goes after a Chip is removed: the next Chip, else the previous, else the first question (Req 4.6). */
export function focusAfterRemoval(
  before: readonly ProfileField[],
  removed: ProfileField,
): { kind: 'chip'; field: ProfileField } | { kind: 'question' } {
  const index = before.indexOf(removed)
  const next = before[index + 1] ?? (index > 0 ? before[index - 1] : undefined)
  return next === undefined || index === -1 ? { kind: 'question' } : { kind: 'chip', field: next }
}
