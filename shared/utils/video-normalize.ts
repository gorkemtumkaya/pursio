import type { Level } from '../types/skill-tree'

/**
 * Lowercase, remove every Unicode punctuation character (\p{P}), trim, and collapse
 * whitespace runs to one space. Letters and digits of any script stay (Req 7.13).
 */
export function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\p{P}/gu, '').trim().replace(/\s+/g, ' ')
}

/**
 * Primary language subtag, lowercase.
 * null, undefined, empty or whitespace-only input (language not chosen) gives 'en'.
 * Non-empty input without a valid primary subtag (2 to 3 ASCII letters, optionally
 * followed by '-' or '_' and more text) gives 'und'.
 */
export function languageCode(input: string | null | undefined): string {
  if (input == null) return 'en'
  const value = input.trim()
  if (value === '') return 'en'
  const match = /^([A-Za-z]{2,3})(?:[-_].*)?$/.exec(value)
  return match?.[1] ? match[1].toLowerCase() : 'und'
}

export interface PoolKeyParts {
  hobby: string
  skillTitle: string
  level: Level
  language: string | null | undefined
}

/**
 * JSON array of [normalized hobby, normalized skill title, level, language code].
 * Injective, and holds no skill id, quest index, region or user id.
 */
export function poolKey(parts: PoolKeyParts): string {
  return JSON.stringify([
    normalizeText(parts.hobby),
    normalizeText(parts.skillTitle),
    parts.level,
    languageCode(parts.language),
  ])
}
