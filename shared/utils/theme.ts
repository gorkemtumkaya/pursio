import type { Theme } from '../types/theme'

export const THEMES: readonly Theme[] = ['trail', 'boulder', 'halloween']
export const DEFAULT_THEME: Theme = 'trail'
export const THEME_STORAGE_KEY = 'pursio-theme'

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
