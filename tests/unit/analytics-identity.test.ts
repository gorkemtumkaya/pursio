// The browser's PostHog ids on build requests (spec: sample-path, Requirement 12; bug APP-ANALYTICS-01).
import { describe, expect, it } from 'vitest'
import { ANALYTICS_ID_MAX, DISTINCT_ID_HEADER, SESSION_ID_HEADER, usableAnalyticsId } from '../../shared/utils/analytics-identity'
import { readAnalyticsIdentity } from '../../server/utils/analytics-events'
import { analyticsHeaders, type AnalyticsIdSource } from '../../app/utils/analytics'

function client(distinctId: unknown, sessionId: unknown): AnalyticsIdSource {
  return {
    get_distinct_id: () => distinctId as string,
    get_session_id: () => sessionId as string,
  }
}

describe('usableAnalyticsId', () => {
  it('keeps a normal id, trimmed', () => {
    expect(usableAnalyticsId('0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBe('0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')
    expect(usableAnalyticsId('  abc  ')).toBe('abc')
  })

  it('rejects missing, empty, too long, control characters and the cookieless placeholder', () => {
    expect(usableAnalyticsId(undefined)).toBeNull()
    expect(usableAnalyticsId(42)).toBeNull()
    expect(usableAnalyticsId('')).toBeNull()
    expect(usableAnalyticsId('   ')).toBeNull()
    expect(usableAnalyticsId('a'.repeat(ANALYTICS_ID_MAX))).toBe('a'.repeat(ANALYTICS_ID_MAX))
    expect(usableAnalyticsId('a'.repeat(ANALYTICS_ID_MAX + 1))).toBeNull()
    expect(usableAnalyticsId('ab\ncd')).toBeNull()
    expect(usableAnalyticsId('ab\u0000cd')).toBeNull()
    expect(usableAnalyticsId('ab\u007fcd')).toBeNull()
    expect(usableAnalyticsId('$posthog_cookieless')).toBeNull()
  })
})

describe('readAnalyticsIdentity', () => {
  it('gives both ids when both are usable', () => {
    expect(readAnalyticsIdentity({ distinctId: 'browser-1', sessionId: 'session-1' })).toEqual({
      distinctId: 'browser-1',
      sessionId: 'session-1',
    })
  })

  it('drops a session id that is not usable and keeps the distinct id', () => {
    expect(readAnalyticsIdentity({ distinctId: 'browser-1', sessionId: undefined })).toEqual({ distinctId: 'browser-1' })
    expect(readAnalyticsIdentity({ distinctId: 'browser-1', sessionId: 'x\ny' })).toEqual({ distinctId: 'browser-1' })
  })

  it('is null without a usable distinct id, whatever the session id', () => {
    expect(readAnalyticsIdentity({ distinctId: undefined, sessionId: 'session-1' })).toBeNull()
    expect(readAnalyticsIdentity({ distinctId: '', sessionId: 'session-1' })).toBeNull()
    expect(readAnalyticsIdentity({ distinctId: '$posthog_cookieless', sessionId: 'session-1' })).toBeNull()
  })
})

describe('analyticsHeaders', () => {
  it('sends both ids under the shared header names', () => {
    expect(analyticsHeaders(client('browser-1', 'session-1'))).toEqual({
      [DISTINCT_ID_HEADER]: 'browser-1',
      [SESSION_ID_HEADER]: 'session-1',
    })
  })

  it('sends only the distinct id when the session id is not usable', () => {
    expect(analyticsHeaders(client('browser-1', ''))).toEqual({ [DISTINCT_ID_HEADER]: 'browser-1' })
  })

  it('sends nothing without a client, without a usable distinct id, or when the client throws', () => {
    expect(analyticsHeaders(undefined)).toEqual({})
    expect(analyticsHeaders(null)).toEqual({})
    expect(analyticsHeaders(client('$posthog_cookieless', 'session-1'))).toEqual({})
    expect(
      analyticsHeaders({
        get_distinct_id: () => {
          throw new Error('not loaded')
        },
        get_session_id: () => 'session-1',
      }),
    ).toEqual({})
  })

  it('round trips: what the browser sends is what the server reads', () => {
    const headers = analyticsHeaders(client('browser-1', 'session-1'))
    expect(
      readAnalyticsIdentity({ distinctId: headers[DISTINCT_ID_HEADER], sessionId: headers[SESSION_ID_HEADER] }),
    ).toEqual({ distinctId: 'browser-1', sessionId: 'session-1' })
  })
})
