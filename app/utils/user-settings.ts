import { z } from 'zod'
import type { StorageLike } from './progress-store'

export const USER_SETTINGS_KEY = 'pursio-user-settings:v1'

/** Longest goal the database accepts (`profiles.goal` check). */
export const USER_GOAL_MAX_LENGTH = 200

/** The language used when none is chosen. The browser language is never read (spec: skill-video-pipeline, Decision 12). */
export const DEFAULT_LANGUAGE = 'en'

/** Language and goal kept in this browser (spec: skill-video-pipeline, Req 1.11, 3.3, 10.1). */
export interface UserSettings {
  /** A language code such as `en`; null means not chosen (read as `en`). */
  language: string | null
  /** The learner's optional goal, at most 200 characters; empty means none. */
  goal: string
}

/** Languages offered on the Settings page, with `English` first. */
export const LANGUAGE_OPTIONS: readonly { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'pt', label: 'Português' },
  { code: 'sv', label: 'Svenska' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
]

const storedSchema = z.object({
  language: z.string().max(35).nullable(),
  goal: z.string(),
})

export function emptyUserSettings(): UserSettings {
  return { language: null, goal: '' }
}

/** The language to use: the chosen one, else `en`. */
export function effectiveLanguage(s: UserSettings): string {
  const chosen = s.language?.trim() ?? ''
  return chosen === '' ? DEFAULT_LANGUAGE : chosen
}

/** Trims the goal and cuts it to 200 characters. */
export function normalizeGoal(raw: string): string {
  return raw.trim().slice(0, USER_GOAL_MAX_LENGTH).trim()
}

export function serializeUserSettings(s: UserSettings): string {
  const stored: UserSettings = { language: s.language, goal: normalizeGoal(s.goal) }
  return JSON.stringify(stored)
}

/** `null` gives empty settings. Invalid JSON or a shape mismatch gives empty settings with `invalid: true`. */
export function parseStoredUserSettings(raw: string | null): { settings: UserSettings; invalid: boolean } {
  if (raw === null) return { settings: emptyUserSettings(), invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { settings: emptyUserSettings(), invalid: true }
  }
  const parsed = storedSchema.safeParse(json)
  if (!parsed.success) return { settings: emptyUserSettings(), invalid: true }
  const language = parsed.data.language?.trim() ?? ''
  return {
    settings: { language: language === '' ? null : language, goal: normalizeGoal(parsed.data.goal) },
    invalid: false,
  }
}

function safeStorage(getStorage: () => StorageLike | null): StorageLike | null {
  try {
    return getStorage()
  } catch {
    return null
  }
}

/** Storage failures give empty settings; an invalid stored value is removed. */
export function loadUserSettings(getStorage: () => StorageLike | null): UserSettings {
  const s = safeStorage(getStorage)
  if (!s) return emptyUserSettings()
  let raw: string | null
  try {
    raw = s.getItem(USER_SETTINGS_KEY)
  } catch {
    return emptyUserSettings()
  }
  const { settings, invalid } = parseStoredUserSettings(raw)
  if (invalid) {
    try {
      s.removeItem(USER_SETTINGS_KEY)
    } catch {
      // Ignore: the bad value is skipped either way.
    }
  }
  return settings
}

/** Storage failures are silent: the settings stay in memory only. */
export function saveUserSettings(getStorage: () => StorageLike | null, settings: UserSettings): void {
  const s = safeStorage(getStorage)
  if (!s) return
  try {
    s.setItem(USER_SETTINGS_KEY, serializeUserSettings(settings))
  } catch {
    // Quota or privacy errors: keep settings in memory only.
  }
}
