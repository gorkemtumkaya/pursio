// Calls POST /api/intake from the page (spec: path-intake, Requirement 3). Pure: fetch and timers are injected.
import type { IntakeProfile } from '#shared/types/learner-profile'
import { sanitizeIntakeProfile } from '#shared/utils/learner-profile'
import { KEY_HEADER } from '#shared/utils/llm'
import type { LlmSettings } from './llm-settings'

/** The page aborts intake after this long and builds without it (Req 3.4). */
export const INTAKE_TIMEOUT_MS = 5000

export interface IntakeRequest {
  body: { hobby: string; note: string; language: string; provider?: string }
  headers: Record<string, string>
}

/** The learner's own key goes in the header, with its provider in the body (Req 3.1, 6.6). */
export function buildIntakeRequest(hobby: string, note: string, language: string, settings: LlmSettings): IntakeRequest {
  const body = { hobby: hobby.trim(), note: note.trim(), language }
  const apiKey = settings.apiKey.trim()
  if (apiKey === '') return { body, headers: {} }
  return { body: { ...body, provider: settings.provider }, headers: { [KEY_HEADER]: apiKey } }
}

export type IntakeOutcome = { kind: 'profile'; profile: IntakeProfile } | { kind: 'failure' }

/** Sends the request and resolves to the response body; rejects on any HTTP error or abort. */
export type IntakeFetch = (request: IntakeRequest, signal: AbortSignal) => Promise<unknown>

export interface IntakeClientDeps {
  fetch: IntakeFetch
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
  /** Aborts too, for instance when the learner leaves the page (Req 3.7). */
  signal?: AbortSignal
}

/**
 * Runs intake. Every error, abort, timeout and body the Sanitizer cannot repair is a failure;
 * a body is sanitized again on the page, so a broken answer never opens the Panel (Req 3.5, 3.6).
 * Never throws.
 */
export async function runIntake(request: IntakeRequest, deps: IntakeClientDeps): Promise<IntakeOutcome> {
  const controller = new AbortController()
  const abort = (): void => controller.abort()
  if (deps.signal?.aborted) return { kind: 'failure' }
  deps.signal?.addEventListener('abort', abort, { once: true })
  const timer = deps.setTimer(abort, INTAKE_TIMEOUT_MS)
  try {
    const body = await deps.fetch(request, controller.signal)
    if (controller.signal.aborted) return { kind: 'failure' }
    const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).profile : undefined
    const sanitized = sanitizeIntakeProfile(raw)
    return sanitized.ok ? { kind: 'profile', profile: sanitized.profile } : { kind: 'failure' }
  } catch {
    return { kind: 'failure' }
  } finally {
    deps.clearTimer(timer)
    deps.signal?.removeEventListener('abort', abort)
  }
}
