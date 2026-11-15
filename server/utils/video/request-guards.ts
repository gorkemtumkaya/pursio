/**
 * Request guards shared by the video handlers and the Fresh handlers: Access_Token check,
 * rate limit key and bounded field parsing. A leaf module on purpose: it imports no
 * scheduler, pipeline, provider, feed or model code, so the Fresh_Endpoint can use it without
 * reaching any module that starts work (spec: fresh, Req 3.11, 8.6).
 */
import type { Level } from '../../../shared/types/skill-tree'
import { parseBearer } from '../../../shared/utils/auth'
import { withTimeout } from '../llm-handlers'

/** Longest accepted path id and Skill id. */
export const REQUEST_ID_MAX_LENGTH = 200
const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']

export function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

/** Trimmed string of 1 to `max` characters, else null. */
export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= max ? text : null
}

/** Result of the Access_Token check of a request. */
export type RequestAuth =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string; token: string }
  | { kind: 'unauthorized' }

export interface TokenCheckDeps {
  /** The user id of a valid Access_Token, else null. */
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  verifyTimeoutMs: number
}

/**
 * Checks the `Authorization` header. No header: anonymous. A present header that is not a
 * Bearer token, or a token that cannot be verified in time, is unauthorized, with no fallback
 * to a Signed_Out_User request.
 */
export async function verifyRequestToken(authorization: string | undefined, deps: TokenCheckDeps): Promise<RequestAuth> {
  const header = typeof authorization === 'string' ? authorization.trim() : ''
  if (header === '') return { kind: 'anonymous' }
  const token = parseBearer(header)
  if (token === null) return { kind: 'unauthorized' }
  let verified: string | null | undefined
  try {
    verified = await withTimeout<string | null | undefined>(deps.verifyTimeoutMs, undefined, (signal) =>
      deps.verifyToken(token, signal),
    )
  }
  catch {
    verified = null
  }
  if (typeof verified !== 'string' || verified === '') return { kind: 'unauthorized' }
  return { kind: 'user', userId: verified, token }
}

/** Rate limit key: `user:<id>` for a Signed_In_User, else `ip:<address>` (`ip:unknown` without one). */
export function rateLimitKey(userId: string | null, clientIp: string | undefined): string {
  return userId !== null ? `user:${userId}` : `ip:${clientIp?.trim() || 'unknown'}`
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/**
 * Compares two strings in constant time, whatever their lengths: both are hashed to 32 bytes
 * and every byte is compared with no early exit (no `@types/node`, so no `timingSafeEqual`).
 */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
