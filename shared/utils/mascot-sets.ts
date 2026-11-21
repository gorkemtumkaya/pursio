/** Outfit keys the AI may return, in `mascot.set` of a tree and in `mascotSet` of an Intake_Profile. */
export const MASCOT_SETS = [
  'bouldering',
  'photography',
  'cooking',
  'guitar',
  'gardening',
  'reading',
  'explorer',
] as const

export type MascotSet = (typeof MASCOT_SETS)[number]

/** The outfit used when the AI names none, or one that is not in the list. */
export const DEFAULT_MASCOT_SET: MascotSet = 'explorer'

export function isMascotSet(value: unknown): value is MascotSet {
  return typeof value === 'string' && (MASCOT_SETS as readonly string[]).includes(value)
}
