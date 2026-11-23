import type { PostHog } from 'posthog-js'
import { DISTINCT_ID_HEADER, SESSION_ID_HEADER, usableAnalyticsId } from '#shared/utils/analytics-identity'

export type AnalyticsEvent =
  | 'landing_viewed'
  | 'hero_hobby_submitted'
  | 'example_hobby_clicked'
  | 'demo_clicked'
  | 'waitlist_joined'
  // Path intake (spec: path-intake, Requirement 14). Field names, counts and booleans only.
  | 'intake_shown'
  | 'intake_chip_removed'
  | 'intake_answered'
  | 'intake_skipped'
  | 'intake_failed'
  // Free plan hobby limit: the card on the new hobby page. No properties.
  | 'hobby_limit_shown'
  | 'hobby_limit_checkout_clicked'
  // Sample path pages (spec: sample-path, Requirement 11). Hobby, utm and flags only, never the note.
  | 'sample_viewed'
  | 'sample_skill_opened'
  | 'sample_mine_opened'
  | 'sample_build_clicked'

export type AnalyticsProps = Readonly<Record<string, string | number | boolean | readonly string[]>>
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

export type AnalyticsIdSource = Pick<PostHog, 'get_distinct_id' | 'get_session_id'>

/**
 * The browser's PostHog ids as request headers, for the build requests, so the server sends its
 * events under the same person (spec: sample-path, Req 12.1). Empty without a client, for an id
 * that is not usable, or when the client throws. Never used for access or limits.
 */
export function analyticsHeaders(client: AnalyticsIdSource | null | undefined): Record<string, string> {
  if (!client) return {}
  try {
    const distinctId = usableAnalyticsId(client.get_distinct_id())
    if (distinctId === null) return {}
    const headers: Record<string, string> = { [DISTINCT_ID_HEADER]: distinctId }
    const sessionId = usableAnalyticsId(client.get_session_id())
    if (sessionId !== null) headers[SESSION_ID_HEADER] = sessionId
    return headers
  } catch {
    return {}
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
