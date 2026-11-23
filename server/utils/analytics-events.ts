import { usableAnalyticsId } from '../../shared/utils/analytics-identity'
import { serverPosthogClient } from './ai-observability'

/**
 * Who the server's events belong to: the browser's PostHog ids when the request sent usable
 * ones (spec: sample-path, Requirement 12; bug APP-ANALYTICS-01). The ids are a claim by the
 * browser. They only choose the analytics person; nothing about access, limits or stored data
 * depends on them (Req 12.5).
 */
export interface AnalyticsIdentity {
  distinctId: string
  sessionId?: string
}

/** The identity from the two request headers, or null when the distinct id is not usable (Req 12.2). */
export function readAnalyticsIdentity(headers: {
  distinctId: string | undefined
  sessionId: string | undefined
}): AnalyticsIdentity | null {
  const distinctId = usableAnalyticsId(headers.distinctId)
  if (distinctId === null) return null
  const sessionId = usableAnalyticsId(headers.sessionId)
  return sessionId === null ? { distinctId } : { distinctId, sessionId }
}

/**
 * Sends one product event from the server and waits for the flush, because a serverless function
 * may stop work left after the response. Never throws; does nothing without a PostHog config.
 */
export async function captureServerEvent(
  identity: AnalyticsIdentity,
  event: string,
  properties: Record<string, string | number | boolean>,
): Promise<void> {
  const posthog = serverPosthogClient()
  if (!posthog) return
  try {
    posthog.capture({
      distinctId: identity.distinctId,
      event,
      properties: identity.sessionId === undefined ? { ...properties } : { ...properties, $session_id: identity.sessionId },
    })
    await posthog.flush().catch(() => {})
  } catch {
    // Analytics must never change an API response.
  }
}
