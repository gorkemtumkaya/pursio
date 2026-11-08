/**
 * The inline head script (nuxt.config.ts) already applied the saved theme
 * before first paint. After mount, copy it into state so the UI matches.
 * Doing this after mount avoids a hydration mismatch.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    const applied = document.documentElement.dataset.theme
    if (!isTheme(applied)) return
    nuxtApp.runWithContext(() => {
      useTheme().setTheme(applied)
    })
  })
})
