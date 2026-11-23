import type { SessionStatus } from '~/utils/auth-logic'
import type { CloudStatus } from '~/composables/useCloudStore'
import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export const HOBBY_MAX_LENGTH = 60
export const NEW_PAGE = '/new'
export const DEMO_PATH = '/path?demo=1'
export const SITE_URL = 'https://pursio.fun'

export type PathCheck = 'pending' | 'has_paths' | 'no_paths' | 'failed'
export type LandingView = 'pending' | 'landing' | 'redirect' | 'retry'

/** The Path_Check result from the existing statuses (Req 1.2, 1.6, 1.9). Archived paths count. */
export function pathCheckOf(auth: SessionStatus, cloud: CloudStatus, pathCount: number): PathCheck {
  if (auth === 'unavailable') return 'failed'
  if (auth === 'loading') return 'pending'
  if (cloud === 'error') return 'failed'
  if (cloud === 'ready') return pathCount > 0 ? 'has_paths' : 'no_paths'
  return 'pending'
}

/** Req 1.2, 1.3, 1.5 to 1.10, 15.3, 15.4. `landing` is the raw query value. */
export function decideLanding(input: { landing: unknown; hint: boolean; check: PathCheck }): LandingView {
  if (input.landing === '1') return 'landing'
  switch (input.check) {
    case 'has_paths':
      return 'redirect'
    case 'no_paths':
      return 'landing'
    case 'failed':
      return input.hint ? 'retry' : 'landing'
    default:
      return 'pending'
  }
}

/** Req 3.5, 3.6: the trimmed text, or null when it is empty. Not cut: the input has maxlength 60. */
export function normalizeHobby(raw: string): string | null {
  const text = raw.trim()
  return text === '' ? null : text
}

/** Req 3.5, 6.2: the Hobby_Handoff URL for a hobby. */
export function landingHandoffUrl(hobby: string): string {
  return `${NEW_PAGE}?hobby=${encodeURIComponent(hobby)}`
}

/** Req 11.1, 11.2: the hobby from `route.query.hobby`, trimmed and cut to 60, or null. */
export function parseHobbyQuery(value: unknown): string | null {
  const raw: unknown = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return null
  const text = raw.trim().slice(0, HOBBY_MAX_LENGTH).trim()
  return text === '' ? null : text
}

/**
 * What `/new` does with `?hobby=` on load (Req 11.1 to 11.5; spec: sample-path, Req 1.5):
 * `none` without a usable hobby; `fill` with `start=0`, at once, sending nothing; otherwise
 * `wait` until a session is ready, then `start`, which fills the hobby and starts intake.
 */
export type HobbyHandoffStep =
  | { kind: 'none' }
  | { kind: 'fill'; hobby: string }
  | { kind: 'wait' }
  | { kind: 'start'; hobby: string }

export function hobbyHandoffStep(query: LocationQuery, sessionReady: boolean): HobbyHandoffStep {
  const hobby = parseHobbyQuery(query.hobby)
  if (hobby === null) return { kind: 'none' }
  if (query.start === '0') return { kind: 'fill', hobby }
  return sessionReady ? { kind: 'start', hobby } : { kind: 'wait' }
}

/**
 * Req 11.5: the same query without `hobby`, every other key and value kept. `start` goes too: it
 * only says whether that hobby starts (spec: sample-path, Req 1.5), so it means nothing without it.
 */
export function withoutHobbyQuery(query: LocationQuery): LocationQueryRaw {
  const rest: LocationQueryRaw = {}
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'hobby' && key !== 'start') rest[key] = value
  }
  return rest
}
