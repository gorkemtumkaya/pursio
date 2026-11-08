/**
 * The inline head script (nuxt.config.ts) already applied the saved theme
 * before first paint. Once hydration is fully done, copy it into state so the
 * UI matches.
 *
 * This must wait for `app:suspense:resolve`, not `app:mounted`: the layout and
 * page are async components under <Suspense>, so `app:mounted` fires while they
 * are still hydrating. Changing the theme then makes theme-driven markup (e.g.
 * Wick's gradient colors) differ from the server HTML and can break hydration.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hookOnce('app:suspense:resolve', () => {
    const applied = document.documentElement.dataset.theme
    if (!isTheme(applied)) return
    nuxtApp.runWithContext(() => {
      useTheme().setTheme(applied)
    })
  })
})
