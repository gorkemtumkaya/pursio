import type { Theme } from '../types/theme'

/** In the order shown in Settings; the default first. */
export const THEMES: readonly Theme[] = ['boulder', 'trail', 'halloween']
export const DEFAULT_THEME: Theme = 'boulder'
export const THEME_LABELS: Readonly<Record<Theme, string>> = { boulder: 'Boulder', trail: 'Trail', halloween: 'Halloween' }
export const THEME_STORAGE_KEY = 'pursio-theme'
/** Browser tab icon (SVG) per theme. The sidebar logo uses --pursio-logo in themes.css. */
export const THEME_FAVICONS: Readonly<Record<Theme, string>> = {
  boulder: '/favicon.svg?v=2',
  trail: '/favicon.svg?v=2',
  halloween: '/favicon-halloween.svg',
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
