import posthog from 'posthog-js'
import type { PostHog } from 'posthog-js'

export default defineNuxtPlugin((nuxtApp): { provide: { posthog: PostHog | undefined } } => {
  const runtimeConfig = useRuntimeConfig()
  const key = runtimeConfig.public.posthogKey
  const host = runtimeConfig.public.posthogHost

  if (!key || !host) {
    if (import.meta.dev) {
      const missingVariable = key ? 'NUXT_PUBLIC_POSTHOG_HOST' : 'NUXT_PUBLIC_POSTHOG_KEY'
      console.error(`${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`)
    }

    return { provide: { posthog: undefined } }
  }

  const posthogClient = posthog.init(key, {
    api_host: host,
    // Adds PostHog's session and distinct-id headers to same-origin API requests.
    tracing_headers: [window.location.hostname],
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
  })

  nuxtApp.hook('vue:error', (error) => {
    posthogClient.captureException(error)
  })

  return {
    provide: {
      posthog: posthogClient as PostHog,
    },
  }
})
