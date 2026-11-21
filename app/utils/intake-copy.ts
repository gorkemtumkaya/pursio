// Fixed copy of path intake (spec: path-intake, Requirement 15.2). No dash characters (decision 13).
import type { IntakeLevel } from '#shared/types/learner-profile'

export const INTAKE_COPY = {
  noteLabel: 'Tell Wick more',
  noteOptional: 'optional',
  notePlaceholder: 'Where you are now, where you want to get, what you like or want to skip.',
  /** Shown while 40 or fewer characters are left. */
  noteLeft: (left: number): string => `${left} left`,
  wickReading: 'Give me a second…',
  wickPanel: 'Got it. Anything to fix?',
  wickPanelNoChips: 'A couple of quick questions.',
  chipsHeading: 'Here\'s what I got',
  questionGoal: 'What does done look like?',
  questionKnown: 'What can you already do?',
  questionKnownHint: 'these start as done',
  questionTaste: 'What do you like?',
  build: 'Build my path',
  skip: 'Skip, just build it',
  statusReading: 'Reading what you wrote.',
  statusPanel: 'Here is what Wick understood, with a few quick questions.',
  finishLine: 'Your finish line',
  headStart: 'You start with a head start',
  headStartXp: (xp: number): string => `+${xp} XP`,
  headStartNote: 'Marked done on your path. Their quests stay open if you want a refresher.',
  knownSkillNote: 'You already know this one. These quests are an optional refresher and give no XP.',
} as const

/** Tag of each Chip, in Chip order. */
export const CHIP_TAGS = {
  level: 'Level',
  goal: 'Goal',
  avoid: 'Not for you',
  taste: 'Taste',
} as const

/** Accessible name of each Chip's × button. */
export const CHIP_REMOVE_LABELS = {
  level: 'Remove level',
  goal: 'Remove goal',
  avoid: 'Remove not for you',
  taste: 'Remove taste',
} as const

export const INTAKE_LEVEL_LABELS: Record<IntakeLevel, string> = {
  new: 'New to it',
  returning: 'Coming back to it',
  regular: 'Doing it regularly',
}
