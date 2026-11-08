import type { Theme } from '../types/theme'

/** In the order shown in Settings; the default first. */
export const THEMES: readonly Theme[] = ['boulder', 'trail', 'halloween']
export const DEFAULT_THEME: Theme = 'boulder'
export const THEME_STORAGE_KEY = 'pursio-theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
