/**
 * The PostHog ids the browser sends with a build request, so the server's events join the
 * visitor's own chain (spec: sample-path, Requirement 12; bug APP-ANALYTICS-01). The names are
 * the ones posthog-js uses for its tracing headers; both may set them, always to the same value.
 */
export const DISTINCT_ID_HEADER = 'x-posthog-distinct-id'
export const SESSION_ID_HEADER = 'x-posthog-session-id'

/** Longest id accepted from a header. */
export const ANALYTICS_ID_MAX = 200

/** The placeholder posthog-js uses in cookieless mode; it names no one. */
const COOKIELESS_ID = '$posthog_cookieless'

function hasControlCharacter(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/** The id as sent, or null when it is missing, empty, too long, holds a control character or is the cookieless placeholder. */
export function usableAnalyticsId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const id = value.trim()
  if (id === '' || id.length > ANALYTICS_ID_MAX || hasControlCharacter(id) || id === COOKIELESS_ID) return null
  return id
}
