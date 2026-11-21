// Learner_Profile rules shared by the server and the page (spec: path-intake). Pure, no Nuxt imports.
import { z } from 'zod'
import type {
  FinalProfile,
  GoalOption,
  IntakeLevel,
  IntakeProfile,
  Option,
  StoredProfile,
} from '../types/learner-profile'
import type { StartLevel } from '../types/llm'
import { DEFAULT_MASCOT_SET, MASCOT_SETS, isMascotSet } from './mascot-sets'

/** Longest Note after trim (decision 40: raised from 400). */
export const NOTE_MAX = 800
export const LABEL_MAX = 40
export const FINISH_LINE_MAX = 60
/** Longest `avoid` or `taste` entry. */
export const ENTRY_MAX = 40
/** Most `avoid` or `taste` entries. */
export const LIST_MAX = 5
export const GOAL_OPTIONS_MIN = 2
export const GOAL_OPTIONS_MAX = 4
export const KNOWN_MAX = 6
export const TASTE_OPTIONS_MAX = 5
export const OPTION_ID_MAX = 40
/** Lowercase letters, digits and single hyphens. */
export const OPTION_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const INTAKE_LEVELS = ['new', 'returning', 'regular'] as const satisfies readonly IntakeLevel[]

export type SanitizeFailure = 'unparsable' | 'too_few_goals'
export type SanitizeResult = { ok: true; profile: IntakeProfile } | { ok: false; reason: SanitizeFailure }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An own property only, so keys such as `__proto__` never read from the prototype. */
function own(record: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined
}

/** Length in code points, so a character outside the basic plane counts once. */
function codePoints(text: string): number {
  return Array.from(text).length
}

/**
 * A trimmed text of at most `max` code points, or null when the value is not a string
 * or is empty after trim. A cut never splits a surrogate pair.
 */
function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed === '') return null
  const points = Array.from(trimmed)
  const cut = points.length <= max ? trimmed : points.slice(0, max).join('').trimEnd()
  return cut === '' ? null : cut
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  return id.length >= 1 && id.length <= OPTION_ID_MAX && OPTION_ID.test(id) ? id : null
}

function isLevel(value: unknown): value is IntakeLevel {
  return typeof value === 'string' && (INTAKE_LEVELS as readonly string[]).includes(value)
}

/** Valid entries in order, the first of each id only, cut to `max`. */
function cleanOptions<T extends Option>(value: unknown, max: number, read: (entry: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const options: T[] = []
  for (const entry of value) {
    if (!isRecord(entry)) continue
    const option = read(entry)
    if (option === null || seen.has(option.id)) continue
    seen.add(option.id)
    options.push(option)
  }
  return options.slice(0, max)
}

function readOption(entry: Record<string, unknown>): Option | null {
  const id = cleanId(own(entry, 'id'))
  const label = cleanText(own(entry, 'label'), LABEL_MAX)
  return id === null || label === null ? null : { id, label }
}

function readGoalOption(entry: Record<string, unknown>): GoalOption | null {
  const option = readOption(entry)
  const finishLine = cleanText(own(entry, 'finishLine'), FINISH_LINE_MAX)
  return option === null || finishLine === null ? null : { ...option, finishLine }
}

/** Text entries, trimmed and cut, repeats dropped without regard to case, at most LIST_MAX. */
function cleanEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const entries: string[] = []
  for (const item of value) {
    const text = cleanText(item, ENTRY_MAX)
    if (text === null) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(text)
  }
  return entries.slice(0, LIST_MAX)
}

/**
 * Turns a model answer, or a response body, into a valid Intake_Profile (Req 2.8, 3.5).
 * Small slips are repaired: lists are cut, bad and repeated options dropped, long texts
 * shortened, a wrong level and an unlisted goal emptied, an unknown outfit replaced.
 * It fails only when `raw` is not an object or fewer than 2 goal options survive.
 * Never throws. Sanitizing its own result gives an equal value.
 * With `noteEmpty`, the four learner fields are emptied, whatever the answer said (Req 2.9).
 */
export function sanitizeIntakeProfile(raw: unknown, options: { noteEmpty?: boolean } = {}): SanitizeResult {
  if (!isRecord(raw)) return { ok: false, reason: 'unparsable' }

  const goalOptions = cleanOptions(own(raw, 'goalOptions'), GOAL_OPTIONS_MAX, readGoalOption)
  if (goalOptions.length < GOAL_OPTIONS_MIN) return { ok: false, reason: 'too_few_goals' }

  const rawLevel = own(raw, 'level')
  const rawGoal = own(raw, 'goal')
  const goalId = isRecord(rawGoal) ? cleanId(own(rawGoal, 'id')) : null
  const rawMascot = own(raw, 'mascotSet')
  const noteEmpty = options.noteEmpty === true

  return {
    ok: true,
    profile: {
      level: !noteEmpty && isLevel(rawLevel) ? rawLevel : null,
      // The listed option itself, so the Chip and the option always agree.
      goal: noteEmpty || goalId === null ? null : (goalOptions.find((option) => option.id === goalId) ?? null),
      avoid: noteEmpty ? [] : cleanEntries(own(raw, 'avoid')),
      taste: noteEmpty ? [] : cleanEntries(own(raw, 'taste')),
      goalOptions,
      knownOptions: cleanOptions(own(raw, 'knownOptions'), KNOWN_MAX, readOption),
      tasteOptions: cleanOptions(own(raw, 'tasteOptions'), TASTE_OPTIONS_MAX, readOption),
      mascotSet: isMascotSet(rawMascot) ? rawMascot : DEFAULT_MASCOT_SET,
    },
  }
}

// ---------------------------------------------------------------------------
// Strict schemas: no repair. Used for requests, stored profiles and tests.
// ---------------------------------------------------------------------------

function text(max: number) {
  return z.string().refine((value) => value.trim() !== '' && codePoints(value) <= max)
}

const idSchema = z.string().min(1).max(OPTION_ID_MAX).regex(OPTION_ID)
const optionSchema = z.object({ id: idSchema, label: text(LABEL_MAX) })
const goalOptionSchema = optionSchema.extend({ finishLine: text(FINISH_LINE_MAX) })
const levelSchema = z.enum(INTAKE_LEVELS).nullable()
const entriesSchema = z.array(text(ENTRY_MAX)).max(LIST_MAX)

function uniqueIds(options: readonly Option[]): boolean {
  return new Set(options.map((option) => option.id)).size === options.length
}

function goalIsListed(profile: { goal: GoalOption | null; goalOptions: readonly GoalOption[] }): boolean {
  return profile.goal === null || profile.goalOptions.some((option) => option.id === profile.goal?.id)
}

const goalOptionsSchema = z.array(goalOptionSchema).min(GOAL_OPTIONS_MIN).max(GOAL_OPTIONS_MAX).refine(uniqueIds)

/** The contract of Requirement 2, criterion 7. */
export const intakeProfileSchema = z
  .object({
    level: levelSchema,
    goal: goalOptionSchema.nullable(),
    avoid: entriesSchema,
    taste: entriesSchema,
    goalOptions: goalOptionsSchema,
    knownOptions: z.array(optionSchema).max(KNOWN_MAX).refine(uniqueIds),
    tasteOptions: z.array(optionSchema).max(TASTE_OPTIONS_MAX).refine(uniqueIds),
    mascotSet: z.enum(MASCOT_SETS),
  })
  .refine(goalIsListed)

/** The limits of Requirement 7, criterion 2. Unknown keys are stripped. */
export const finalProfileSchema = z
  .object({
    level: levelSchema,
    goal: goalOptionSchema.nullable(),
    avoid: entriesSchema,
    taste: entriesSchema,
    known: z.array(optionSchema).max(KNOWN_MAX).refine(uniqueIds),
    goalOptions: goalOptionsSchema,
  })
  .refine(goalIsListed)

// Compile-time drift checks: `yarn typecheck` fails if a schema and its type diverge.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const intakeMatchesType: Equals<z.infer<typeof intakeProfileSchema>, IntakeProfile> = true
const finalMatchesType: Equals<z.infer<typeof finalProfileSchema>, FinalProfile> = true
void intakeMatchesType
void finalMatchesType

/**
 * The `profile` of a tree request (Req 7.1, 7.2). A missing or null value is "no profile".
 * Anything else must meet every limit; nothing is repaired here.
 */
export function parseFinalProfile(raw: unknown): { ok: true; profile: FinalProfile | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, profile: null }
  const parsed = finalProfileSchema.safeParse(raw)
  return parsed.success ? { ok: true, profile: parsed.data } : { ok: false }
}

/** A stored profile, or null when the value does not have the Stored_Profile shape (Req 11.5). */
export function parseStoredProfile(raw: unknown): StoredProfile | null {
  const parsed = finalProfileSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

/**
 * True when the profile changes nothing a cached tree depends on: no goal, no avoid, no taste
 * and no known skill (Req 7.4). The level is not part of it, because it is in the cache key.
 */
export function isPlainProfile(profile: FinalProfile | null): boolean {
  if (profile === null) return true
  return profile.goal === null && profile.avoid.length === 0 && profile.taste.length === 0 && profile.known.length === 0
}

/** The stored level of a path for an Intake_Level (Req 7.3). */
export function startLevelFor(level: IntakeLevel | null): StartLevel {
  if (level === 'returning') return 'some'
  if (level === 'regular') return 'serious'
  return 'new'
}

/** The profile as stored: `known` cut down to the skills that kept a Node, in profile order (Req 11.3). */
export function toStoredProfile(profile: FinalProfile, keptKnownIds: readonly string[]): StoredProfile {
  const kept = new Set(keptKnownIds)
  return { ...profile, known: profile.known.filter((option) => kept.has(option.id)) }
}
