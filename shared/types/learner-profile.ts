import type { MascotSet } from '../utils/mascot-sets'
import type { ErrorCode } from './llm'

/** Where the learner is now, as intake reads it (spec: path-intake). Stored paths keep `StartLevel`. */
export type IntakeLevel = 'new' | 'returning' | 'regular'

export interface Option {
  /** Lowercase letters, digits and single hyphens, 1 to 40 characters, unique in its list. */
  id: string
  label: string
}

export interface GoalOption extends Option {
  /** The goal written as a final milestone, at most 60 characters. */
  finishLine: string
}

/** What `POST /api/intake` returns, after the Sanitizer. */
export interface IntakeProfile {
  level: IntakeLevel | null
  /** Always one of `goalOptions`, or null. */
  goal: GoalOption | null
  avoid: string[]
  taste: string[]
  /** 2 to 4. */
  goalOptions: GoalOption[]
  /** 0 to 6. */
  knownOptions: Option[]
  /** 0 to 5. */
  tasteOptions: Option[]
  mascotSet: MascotSet
}

/** What the learner confirmed in the Panel. Sent to the Tree_Route. */
export interface FinalProfile {
  level: IntakeLevel | null
  goal: GoalOption | null
  avoid: string[]
  taste: string[]
  /** The Known_Skills, 0 to 6. */
  known: Option[]
  /** 2 to 4. */
  goalOptions: GoalOption[]
}

/** A FinalProfile whose `known` holds only the skills that have a Node in the saved tree. */
export type StoredProfile = FinalProfile

/** Body of `POST /api/intake`. */
export type IntakeResponse = { profile: IntakeProfile } | { error: ErrorCode }
