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
/**
 * Home-screen icon and manifest per theme. The OS reads whichever is linked
 * when the app is installed; after that the installed icon does not change.
 */
export const THEME_APP_ICONS: Readonly<Record<Theme, { appleTouchIcon: string; manifest: string }>> = {
  boulder: { appleTouchIcon: '/apple-touch-icon.png?v=3', manifest: '/site.webmanifest?v=3' },
  trail: { appleTouchIcon: '/apple-touch-icon.png?v=3', manifest: '/site.webmanifest?v=3' },
  halloween: { appleTouchIcon: '/apple-touch-icon-halloween.png?v=1', manifest: '/site-halloween.webmanifest?v=1' },
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}
