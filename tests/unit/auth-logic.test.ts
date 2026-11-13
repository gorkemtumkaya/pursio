import { describe, expect, it } from 'vitest'
import { bearerHeader, parseBearer } from '../../shared/utils/auth'
import {
  AUTH_MESSAGES,
  authFailureMessage,
  callbackFailure,
  CALLBACK_ERROR_PARAMS,
  classifyAuthError,
  EMAIL_MAX_LENGTH,
  isValidEmail,
  normalizeDisplayName,
  sessionView,
  shouldShowSavePrompt,
} from '../../app/utils/auth-logic'

describe('AUTH_MESSAGES', () => {
  it('holds the fixed sentences of the requirements, word for word', () => {
    expect(AUTH_MESSAGES).toEqual({
      // Req 3.5
      unavailable: "We couldn't start your account. Check your connection and try again.",
      // Req 4.4
      invalidEmail: 'Enter a valid email address.',
      // Req 4.5
      accountExists: 'That account already exists. Log in instead. Progress from this device is not added to it.',
      // Req 4.8
      loginWarning: "Logging in leaves this device's anonymous progress behind. To keep it, save your progress instead.",
      // Req 4.9
      signInFailed: "That sign-in didn't work. Try again.",
      // Req 9.11
      sessionEnded: 'Your session ended. Reload the page and try again.',
      saveFailed: "We built your tree but couldn't save it. Try again.",
      // Req 11.12
      deleteFailed: "We couldn't delete your account. Try again.",
      // Req 11.16
      logoutFailed: "We couldn't log you out. Try again.",
    })
  })

  it('authFailureMessage picks the sentence for each failure', () => {
    expect(authFailureMessage('account_exists')).toBe(
      'That account already exists. Log in instead. Progress from this device is not added to it.',
    )
    expect(authFailureMessage('failed')).toBe("That sign-in didn't work. Try again.")
  })
})

describe('callbackFailure', () => {
  it('an expired or used magic link is a failed sign-in (Req 4.9)', () => {
    expect(
      callbackFailure(
        'https://pursio.app/path#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe('failed')
    expect(
      callbackFailure(
        'https://pursio.app/path?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe('failed')
  })

  it('an identity that belongs to another account is account_exists (Req 4.5)', () => {
    expect(
      callbackFailure(
        'https://pursio.app/profile?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user',
      ),
    ).toBe('account_exists')
    expect(
      callbackFailure(
        'http://localhost:3000/path#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user',
      ),
    ).toBe('account_exists')
    expect(
      callbackFailure(
        'https://pursio.app/path?error=invalid_request&error_code=email_exists&error_description=A+user+with+this+email+address+has+already+been+registered',
      ),
    ).toBe('account_exists')
  })

  it('a cancelled or failed Google flow is a failed sign-in (Req 4.9)', () => {
    expect(
      callbackFailure('https://pursio.app/path?error=access_denied&error_description=The+user+denied+the+request'),
    ).toBe('failed')
    expect(
      callbackFailure(
        'https://pursio.app/path?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code%3A+4%2F0Ab',
      ),
    ).toBe('failed')
    expect(
      callbackFailure('https://pursio.app/path?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+parameter+missing'),
    ).toBe('failed')
    expect(callbackFailure('https://pursio.app/path?error_code=flow_state_expired')).toBe('failed')
  })

  it('a successful callback and an ordinary URL have no failure', () => {
    expect(callbackFailure('https://pursio.app/path?code=2b6f0a4e-91c3-4f2b-a7de-0c1f5a9d3e77')).toBeNull()
    expect(
      callbackFailure(
        'https://pursio.app/path#access_token=eyJhbGciOiJIUzI1NiJ9.e30.abc&expires_in=3600&refresh_token=v1.refresh&token_type=bearer&type=magiclink',
      ),
    ).toBeNull()
    expect(callbackFailure('https://pursio.app/path?hobby=film%20photography')).toBeNull()
    expect(callbackFailure('https://pursio.app/')).toBeNull()
    expect(callbackFailure('')).toBeNull()
    // The words alone, outside the parameters, mean nothing.
    expect(callbackFailure('https://pursio.app/error?hobby=error_code')).toBeNull()
  })

  it('reads relative URLs as the router gives them', () => {
    expect(callbackFailure('/path?hobby=guitar#error=access_denied&error_code=otp_expired')).toBe('failed')
    expect(callbackFailure('/profile?error_code=identity_already_exists')).toBe('account_exists')
    expect(callbackFailure('/path?hobby=guitar')).toBeNull()
  })

  it('names the parameters to clean from the URL', () => {
    expect(CALLBACK_ERROR_PARAMS).toEqual(['error', 'error_code', 'error_description'])
  })
})

describe('classifyAuthError', () => {
  it.each([
    ['identity_already_exists', { code: 'identity_already_exists', status: 400, message: 'Identity is already linked to another user' }],
    ['email_exists', { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' }],
    ['user_already_exists', { code: 'user_already_exists', status: 422, message: 'User already registered' }],
    ['an Error carrying the code', Object.assign(new Error('Identity is already linked'), { code: 'identity_already_exists' })],
  ])('maps %s to account_exists (Req 4.5)', (_, error) => {
    expect(classifyAuthError(error)).toBe('account_exists')
  })

  it.each([
    ['an expired link', { code: 'otp_expired', status: 403, message: 'Email link is invalid or has expired' }],
    ['the email rate limit', { code: 'over_email_send_rate_limit', status: 429, message: 'Email rate limit exceeded' }],
    ['disabled anonymous sign-ins', { code: 'anonymous_provider_disabled', status: 422 }],
    ['an error without a code', new Error('Failed to fetch')],
    ['a code that is not a string', { code: 422 }],
    ['the code in another field', { error_code: 'email_exists', message: 'email_exists' }],
    ['an empty object', {}],
    ['a string', 'email_exists'],
    ['a number', 422],
    ['null', null],
    ['undefined', undefined],
  ])('maps %s to failed (Req 4.9, 4.13)', (_, error) => {
    expect(classifyAuthError(error)).toBe('failed')
  })
})

describe('shouldShowSavePrompt', () => {
  // anonymous, demo, dismissed, justCompleted, expected (Req 10.7)
  it.each([
    [false, false, false, false, false],
    [false, false, false, true, false],
    [false, false, true, false, false],
    [false, false, true, true, false],
    [false, true, false, false, false],
    [false, true, false, true, false],
    [false, true, true, false, false],
    [false, true, true, true, false],
    [true, false, false, false, false],
    [true, false, false, true, true],
    [true, false, true, false, false],
    [true, false, true, true, false],
    [true, true, false, false, false],
    [true, true, false, true, false],
    [true, true, true, false, false],
    [true, true, true, true, false],
  ])('anonymous %s, demo %s, dismissed %s, just completed %s gives %s', (anonymous, demo, dismissed, justCompleted, expected) => {
    expect(shouldShowSavePrompt(anonymous, demo, dismissed, justCompleted)).toBe(expected)
  })
})

describe('isValidEmail', () => {
  it.each(['ada@example.com', '  ada@example.com  ', 'a@b.c', 'first.last+tag@mail.example.org', 'ada@.', 'ada@example.'])(
    'accepts %j',
    (email) => {
      expect(isValidEmail(email)).toBe(true)
    },
  )

  it.each(['', '   ', 'ada', 'ada@', '@example.com', 'ada@example', 'ada@@example.com', 'ada@ex@ample.com', 'ada.example.com'])(
    'rejects %j',
    (email) => {
      expect(isValidEmail(email)).toBe(false)
    },
  )

  it('accepts 254 characters and rejects 255, counted after trimming', () => {
    expect(EMAIL_MAX_LENGTH).toBe(254)
    const exact = `a@b.${'c'.repeat(250)}`
    expect(exact.length).toBe(254)
    expect(isValidEmail(exact)).toBe(true)
    expect(isValidEmail(`  ${exact}  `)).toBe(true)
    expect(isValidEmail(`${exact}c`)).toBe(false)
  })
})

describe('sessionView', () => {
  const account = { id: 'user-1', email: 'ada@example.com', isAnonymous: false }
  const guest = { id: 'anon-1', email: '', isAnonymous: true }

  it('shows nothing while loading or unavailable, even with a user (Req 3.3)', () => {
    expect(sessionView('loading', account)).toEqual({ status: 'loading', userId: '', isAnonymous: false, email: '' })
    expect(sessionView('unavailable', guest)).toEqual({ status: 'unavailable', userId: '', isAnonymous: false, email: '' })
    expect(sessionView('loading', null)).toEqual({ status: 'loading', userId: '', isAnonymous: false, email: '' })
  })

  it('shows the user id of an anonymous user and never an email', () => {
    expect(sessionView('anonymous', guest)).toEqual({ status: 'anonymous', userId: 'anon-1', isAnonymous: true, email: '' })
    expect(sessionView('anonymous', { ...guest, email: 'stale@example.com' }).email).toBe('')
  })

  it('shows the user id and email of a signed-in user', () => {
    expect(sessionView('signed_in', account)).toEqual({
      status: 'signed_in',
      userId: 'user-1',
      isAnonymous: false,
      email: 'ada@example.com',
    })
    expect(sessionView('signed_in', null)).toEqual({ status: 'signed_in', userId: '', isAnonymous: false, email: '' })
  })
})

describe('normalizeDisplayName', () => {
  it('trims, and reads an empty or whitespace-only value as no name (Req 7.4)', () => {
    expect(normalizeDisplayName('  Ada Lovelace \n')).toBe('Ada Lovelace')
    expect(normalizeDisplayName('Ada')).toBe('Ada')
    expect(normalizeDisplayName('')).toBeNull()
    expect(normalizeDisplayName(' \t\n ')).toBeNull()
  })
})

describe('parseBearer and bearerHeader', () => {
  it('reads the token whatever the case of the scheme', () => {
    expect(parseBearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(parseBearer('bearer abc')).toBe('abc')
    expect(parseBearer('BEARER abc')).toBe('abc')
    expect(parseBearer(bearerHeader('abc.def').Authorization)).toBe('abc.def')
    expect(bearerHeader('abc')).toEqual({ Authorization: 'Bearer abc' })
  })

  it.each([undefined, null, '', 'Bearer', 'Bearer ', 'abc', 'Basic abc', 'Bearer abc def', 'Bearerabc', ' Bearer abc', 'Bearer abc '])(
    'gives null for %j',
    (header) => {
      expect(parseBearer(header)).toBeNull()
    },
  )
})
