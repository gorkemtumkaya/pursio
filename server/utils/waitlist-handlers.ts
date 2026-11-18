import {
  isWaitlistKind,
  parseWaitlistEmail,
  type WaitlistErrorCode,
  type WaitlistKind,
  type WaitlistResponse,
} from '../../shared/utils/waitlist'
import { withTimeout, type HandlerResponse } from './llm-handlers'
import type { RateLimiter } from './rate-limiter'

export const WAITLIST_ERROR_STATUS: Record<WaitlistErrorCode, number> = {
  invalid_email: 400,
  invalid_kind: 400,
  rate_limited: 429,
  no_key: 503,
  save_failed: 502,
}

export interface WaitlistDeps {
  /** Service_Role_Key. Only checked for emptiness here; `save` holds the client. */
  serviceRoleKey: string
  /** Stores the address; throws on failure. Saving an address twice is not a failure. */
  save: (entry: { email: string; kind: WaitlistKind }) => Promise<void>
  /** Keyed by the caller's IP address. */
  limiter: RateLimiter
  saveTimeoutMs: number
  /** Receives only the code, never the address. */
  log?: (entry: { code: WaitlistErrorCode }) => void
}

/**
 * `POST /api/waitlist` (spec: landing-page, founding section). Public: no
 * session is needed. The answer is the same for a new and a known address, so
 * the route cannot be used to find out who is on the list.
 */
export async function handleWaitlist(
  input: { body: unknown; ip: string | undefined },
  deps: WaitlistDeps,
): Promise<HandlerResponse<WaitlistResponse>> {
  const fail = (code: WaitlistErrorCode): HandlerResponse<WaitlistResponse> => {
    deps.log?.({ code })
    return { status: WAITLIST_ERROR_STATUS[code], body: { error: code } }
  }

  const body = typeof input.body === 'object' && input.body !== null ? (input.body as Record<string, unknown>) : {}
  const kind = body.kind
  if (!isWaitlistKind(kind)) return fail('invalid_kind')
  const email = parseWaitlistEmail(body.email)
  if (email === null) return fail('invalid_email')

  if (deps.serviceRoleKey.trim() === '') return fail('no_key')
  if (!deps.limiter.tryConsume(input.ip && input.ip !== '' ? input.ip : 'unknown')) return fail('rate_limited')

  let saved: boolean
  try {
    saved = await withTimeout(deps.saveTimeoutMs, false, async () => {
      await deps.save({ email, kind })
      return true
    })
  } catch {
    saved = false
  }
  if (!saved) return fail('save_failed')

  return { status: 200, body: { ok: true } }
}
