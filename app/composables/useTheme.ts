import type { Theme } from '#shared/types/theme'

/**
 * Current theme, shared across the app. The theme lives on
 * <html data-theme> and is saved in localStorage.
 */
export function useTheme() {
  const theme = useState<Theme>('pursio-theme', () => DEFAULT_THEME)

  function setTheme(next: Theme): void {
    theme.value = next
    if (!import.meta.client) return
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode, blocked). The theme still applies for this visit.
    }
  }

  return { theme: readonly(theme), themes: THEMES, setTheme }
}
