/** Which list an email joins: the founding member waitlist or product updates. */
export const WAITLIST_KINDS = ['founding', 'updates'] as const
export type WaitlistKind = (typeof WAITLIST_KINDS)[number]

export type WaitlistErrorCode = 'invalid_email' | 'invalid_kind' | 'rate_limited' | 'no_key' | 'save_failed'
export type WaitlistResponse = { ok: true } | { error: WaitlistErrorCode }

/** Longest address an SMTP path can carry. */
export const EMAIL_MAX_LENGTH = 254

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isWaitlistKind(value: unknown): value is WaitlistKind {
  return typeof value === 'string' && (WAITLIST_KINDS as readonly string[]).includes(value)
}

/**
 * The address as it is stored: trimmed and lower case. Null when it is not a
 * string, is longer than 254 characters or does not look like `name@host.tld`.
 * This checks the shape only; nothing proves the address exists.
 */
export function parseWaitlistEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_SHAPE.test(email)) return null
  return email
}
