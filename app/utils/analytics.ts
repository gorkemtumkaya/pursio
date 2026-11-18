import type { PostHog } from 'posthog-js'

export type AnalyticsEvent =
  | 'landing_viewed'
  | 'hero_hobby_submitted'
  | 'example_hobby_clicked'
  | 'demo_clicked'
  | 'waitlist_joined'

export type AnalyticsProps = Readonly<Record<string, string | number | boolean>>
export type AnalyticsClient = Pick<PostHog, 'capture'>

/** Sends one event, or does nothing. Never logs, never throws (Req 15.2, 15.6, 15.7). */
export function sendEvent(
  client: AnalyticsClient | null | undefined,
  event: AnalyticsEvent,
  properties?: AnalyticsProps,
): void {
  if (!client) return
  try {
    client.capture(event, properties)
  } catch {
    // Analytics must never block the learner.
  }
}

/** Single entry point for Landing_Page analytics (spec: landing-page, Req 15.1). */
export function track(event: AnalyticsEvent, properties?: AnalyticsProps): void {
  try {
    const app = tryUseNuxtApp() as unknown as { $posthog?: AnalyticsClient } | null
    sendEvent(app?.$posthog, event, properties)
  } catch {
    // No Nuxt app (server, tests): nothing to send.
  }
}
