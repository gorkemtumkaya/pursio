// Pure rules of the Auth_Service and the Auth_Dialog (spec: accounts-cloud-save).

export type SessionStatus = 'loading' | 'anonymous' | 'signed_in' | 'unavailable'

export interface SessionUser {
  id: string
  email: string
  isAnonymous: boolean
}

export interface SessionView {
  status: SessionStatus
  userId: string
  isAnonymous: boolean
  email: string
}

export type AuthFailure = 'account_exists' | 'failed'

/** `save` upgrades the Anonymous_User in place; `login` signs in to an existing account. */
export type AuthMode = 'save' | 'login'

/** The fixed sentences shown for account and session problems. */
export const AUTH_MESSAGES = {
  unavailable: "We couldn't start your account. Check your connection and try again.",
  invalidEmail: 'Enter a valid email address.',
  accountExists: 'That account already exists. Log in instead. Progress from this device is not added to it.',
  loginWarning: "Logging in leaves this device's anonymous progress behind. To keep it, save your progress instead.",
  signInFailed: "That sign-in didn't work. Try again.",
  sessionEnded: 'Your session ended. Reload the page and try again.',
  saveFailed: "We built your tree but couldn't save it. Try again.",
  deleteFailed: "We couldn't delete your account. Try again.",
  logoutFailed: "We couldn't log you out. Try again.",
} as const

export const EMAIL_MAX_LENGTH = 254

/**
 * After trimming: at most 254 characters, exactly one "@", a non-empty part
 * before it, and a part after it that contains a "." (Req 4.2).
 */
export function isValidEmail(raw: string): boolean {
  const email = raw.trim()
  if (email.length > EMAIL_MAX_LENGTH) return false
  const parts = email.split('@')
  if (parts.length !== 2) return false
  const [local, domain] = parts
  return local !== undefined && local.length > 0 && domain !== undefined && domain.includes('.')
}

const ACCOUNT_EXISTS_CALLBACK_CODES: readonly string[] = ['identity_already_exists', 'email_exists']
const ACCOUNT_EXISTS_ERROR_CODES: readonly string[] = [...ACCOUNT_EXISTS_CALLBACK_CODES, 'user_already_exists']

/** The auth error parameters Supabase adds to a callback URL. */
export const CALLBACK_ERROR_PARAMS: readonly string[] = ['error', 'error_code', 'error_description']

/**
 * Reads a failed sign-in from a callback URL. Supabase puts `error`,
 * `error_code` and `error_description` in the query or in the hash. An
 * identity or email that belongs to another account gives `account_exists`,
 * any other error gives `failed`, and a URL without one gives `null`.
 */
export function callbackFailure(url: string): AuthFailure | null {
  let parsed: URL
  try {
    parsed = new URL(url, 'http://localhost')
  } catch {
    return null
  }
  const sources = [parsed.searchParams, new URLSearchParams(parsed.hash.replace(/^#/, ''))]
  let failed = false
  for (const params of sources) {
    const code = params.get('error_code')
    if (code !== null && ACCOUNT_EXISTS_CALLBACK_CODES.includes(code)) return 'account_exists'
    if (CALLBACK_ERROR_PARAMS.some((name) => params.has(name))) failed = true
  }
  return failed ? 'failed' : null
}

/** Maps a thrown or returned Supabase auth error to a failure kind. Non-objects are `failed`. */
export function classifyAuthError(error: unknown): AuthFailure {
  if (typeof error !== 'object' || error === null) return 'failed'
  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' && ACCOUNT_EXISTS_ERROR_CODES.includes(code) ? 'account_exists' : 'failed'
}

/** The sentence shown for a failed sign-in. */
export function authFailureMessage(failure: AuthFailure): string {
  return failure === 'account_exists' ? AUTH_MESSAGES.accountExists : AUTH_MESSAGES.signInFailed
}

/** The Save_Prompt opens only for an anonymous learner outside Demo_Mode who just completed a Node and never dismissed it (Req 10.7). */
export function shouldShowSavePrompt(
  anonymous: boolean,
  demo: boolean,
  dismissed: boolean,
  justCompleted: boolean,
): boolean {
  return anonymous && !demo && !dismissed && justCompleted
}

/**
 * What pages may know about the session. The user id is empty until the
 * session is ready and the email is empty unless an Account_User is signed in
 * (Req 3.3).
 */
export function sessionView(status: SessionStatus, user: SessionUser | null): SessionView {
  const ready = status === 'anonymous' || status === 'signed_in'
  return {
    status,
    userId: ready ? (user?.id ?? '') : '',
    isAnonymous: status === 'anonymous',
    email: status === 'signed_in' ? (user?.email ?? '') : '',
  }
}

/** Trimmed display name; an empty or whitespace-only value means no name (Req 7.4). */
export function normalizeDisplayName(raw: string): string | null {
  const name = raw.trim()
  return name === '' ? null : name
}
