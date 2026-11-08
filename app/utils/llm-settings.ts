import { z } from 'zod'
import type { Provider } from '#shared/types/llm'
import { MODEL_PRESETS, PROVIDERS } from '#shared/utils/llm'
import type { StorageLike } from './progress-store'

export const LLM_SETTINGS_KEY = 'pursio-llm-settings:v1'

/** User_Config kept in this browser only (Req 11). */
export interface LlmSettings {
  provider: Provider
  preset: string
  customModel: string
  apiKey: string
}

const storedSettingsSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    preset: z.string(),
    customModel: z.string(),
    apiKey: z.string(),
  })
  .refine((s) => MODEL_PRESETS[s.provider].includes(s.preset))

export function emptySettings(): LlmSettings {
  return { provider: 'anthropic', preset: MODEL_PRESETS.anthropic[0], customModel: '', apiKey: '' }
}

/** A non-blank custom model id wins over the preset (Req 11.2). */
export function effectiveModel(s: LlmSettings): string {
  return s.customModel.trim() || s.preset
}

export function serializeSettings(s: LlmSettings): string {
  const stored: LlmSettings = {
    provider: s.provider,
    preset: s.preset,
    customModel: s.customModel,
    apiKey: s.apiKey,
  }
  return JSON.stringify(stored)
}

/**
 * `null` gives empty settings. Invalid JSON or a shape mismatch (unknown provider,
 * preset outside that provider's list, missing or non-string fields) gives empty
 * settings with `invalid: true` (Req 11.7, 11.8).
 */
export function parseStoredSettings(raw: string | null): { settings: LlmSettings; invalid: boolean } {
  if (raw === null) return { settings: emptySettings(), invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { settings: emptySettings(), invalid: true }
  }
  const parsed = storedSettingsSchema.safeParse(json)
  if (!parsed.success) {
    return { settings: emptySettings(), invalid: true }
  }
  const { provider, preset, customModel, apiKey } = parsed.data
  return { settings: { provider, preset, customModel, apiKey }, invalid: false }
}

function safeStorage(getStorage: () => StorageLike | null): StorageLike | null {
  try {
    return getStorage()
  } catch {
    return null
  }
}

/** Storage failures give empty settings; an invalid stored value is removed (Req 11.7). */
export function loadSettings(getStorage: () => StorageLike | null): LlmSettings {
  const s = safeStorage(getStorage)
  if (!s) return emptySettings()
  let raw: string | null
  try {
    raw = s.getItem(LLM_SETTINGS_KEY)
  } catch {
    return emptySettings()
  }
  const { settings, invalid } = parseStoredSettings(raw)
  if (invalid) {
    try {
      s.removeItem(LLM_SETTINGS_KEY)
    } catch {
      // Ignore: the bad value is skipped either way.
    }
  }
  return settings
}

/** Storage failures are silent: the settings stay in memory only. */
export function saveSettings(getStorage: () => StorageLike | null, settings: LlmSettings): void {
  const s = safeStorage(getStorage)
  if (!s) return
  try {
    s.setItem(LLM_SETTINGS_KEY, serializeSettings(settings))
  } catch {
    // Quota or privacy errors: keep settings in memory only.
  }
}
