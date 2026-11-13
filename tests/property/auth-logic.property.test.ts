import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { bearerHeader, parseBearer } from '../../shared/utils/auth'
import {
  callbackFailure,
  classifyAuthError,
  isValidEmail,
  normalizeDisplayName,
  sessionView,
  shouldShowSavePrompt,
} from '../../app/utils/auth-logic'
import type { SessionStatus, SessionUser } from '../../app/utils/auth-logic'
import { arbAuthError, arbCallbackUrl } from '../arbitraries'

const RUNS = { numRuns: 300 }

const arbPad: fc.Arbitrary<string> = fc.constantFrom('', '', ' ', '  ', '\t', '\n ', ' ')
const arbPart: fc.Arbitrary<string> = fc.stringMatching(/^[a-z0-9.+_-]{0,12}$/)

/** Strings around the email rule: free text, built addresses, 0 to 3 "@" and lengths around 254. */
const arbEmailInput: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.tuple(arbPad, arbPart, arbPart, arbPad).map(([left, local, domain, right]) => `${left}${local}@${domain}${right}`),
  fc.tuple(arbPad, fc.array(arbPart, { minLength: 1, maxLength: 4 }), arbPad).map(
    ([left, parts, right]) => `${left}${parts.join('@')}${right}`,
  ),
  fc.tuple(arbPad, fc.integer({ min: 248, max: 260 }), arbPad).map(
    ([left, length, right]) => `${left}a@b.${'c'.repeat(length - 4)}${right}`,
  ),
)

/** The definition of Requirement 4.2, written out on its own. */
function matchesDefinition(raw: string): boolean {
  const email = raw.trim()
  if (email.length > 254) return false
  const at = email.indexOf('@')
  if (at === -1 || at !== email.lastIndexOf('@')) return false
  return at > 0 && email.slice(at + 1).includes('.')
}

// Feature: accounts-cloud-save, Property 17: Email validity matches the definition
// **Validates: Requirements 4.2, 4.4**
describe('Property 17: Email validity matches the definition', () => {
  it('isValidEmail is true exactly for trimmed strings of at most 254 characters with one "@", a local part and a dotted domain', () => {
    fc.assert(
      fc.property(arbEmailInput, (raw) => {
        expect(isValidEmail(raw)).toBe(matchesDefinition(raw))
      }),
      RUNS,
    )
  })

  it('the generated strings hold both valid and invalid addresses', () => {
    const verdicts = fc.sample(arbEmailInput, { numRuns: 300, seed: 11 }).map(matchesDefinition)
    expect(verdicts).toContain(true)
    expect(verdicts).toContain(false)
  })
})

// Feature: accounts-cloud-save, Property 18: Auth failures are classified
// **Validates: Requirements 4.5, 4.9, 4.13**
describe('Property 18: Auth failures are classified', () => {
  it('callbackFailure reads the error from the query or the hash of a callback URL', () => {
    fc.assert(
      fc.property(arbCallbackUrl, ({ url, expected }) => {
        expect(callbackFailure(url)).toBe(expected)
      }),
      RUNS,
    )
  })

  it('classifyAuthError gives account_exists for the known codes and failed for every other value', () => {
    fc.assert(
      fc.property(arbAuthError, ({ error, expected }) => {
        expect(classifyAuthError(error)).toBe(expected)
      }),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 19: The Save_Prompt decision
// **Validates: Requirements 10.7**
describe('Property 19: The Save_Prompt decision', () => {
  it('is true exactly for an anonymous user outside Demo_Mode who did not dismiss it and just completed a Node', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), fc.boolean(), fc.boolean(), (anonymous, demo, dismissed, justCompleted) => {
        const shown = shouldShowSavePrompt(anonymous, demo, dismissed, justCompleted)
        expect(shown).toBe(anonymous && !demo && !dismissed && justCompleted)
      }),
      RUNS,
    )
  })

  it('holds for all 16 combinations, of which exactly one shows the prompt', () => {
    const flags = [false, true]
    let combinations = 0
    let shownCount = 0
    for (const anonymous of flags) {
      for (const demo of flags) {
        for (const dismissed of flags) {
          for (const justCompleted of flags) {
            combinations += 1
            const shown = shouldShowSavePrompt(anonymous, demo, dismissed, justCompleted)
            expect(shown).toBe(anonymous && !demo && !dismissed && justCompleted)
            if (shown) shownCount += 1
          }
        }
      }
    }
    expect(combinations).toBe(16)
    expect(shownCount).toBe(1)
  })
})

const arbStatus: fc.Arbitrary<SessionStatus> = fc.constantFrom<SessionStatus>(
  'loading',
  'anonymous',
  'signed_in',
  'unavailable',
)

const arbUser: fc.Arbitrary<SessionUser | null> = fc.option(
  fc.record({ id: fc.uuid(), email: fc.oneof(fc.constant(''), fc.emailAddress()), isAnonymous: fc.boolean() }),
  { nil: null },
)

// Feature: accounts-cloud-save, Property 20: The session view hides what is not known yet
// **Validates: Requirements 3.2, 3.3**
describe('Property 20: The session view hides what is not known yet', () => {
  it('shows the user id only when ready, the email only when signed in, and isAnonymous only for anonymous', () => {
    fc.assert(
      fc.property(arbStatus, arbUser, (status, user) => {
        const view = sessionView(status, user)
        expect(view.status).toBe(status)
        expect(view.isAnonymous).toBe(status === 'anonymous')

        const ready = status === 'anonymous' || status === 'signed_in'
        expect(view.userId).toBe(ready ? (user?.id ?? '') : '')
        expect(view.email).toBe(status === 'signed_in' ? (user?.email ?? '') : '')
        if (!ready) {
          expect(view.userId).toBe('')
          expect(view.email).toBe('')
        }
        if (status !== 'signed_in') expect(view.email).toBe('')
      }),
      RUNS,
    )
  })
})

/** Non-empty and without whitespace, like a JWT or any opaque token. */
const arbToken: fc.Arbitrary<string> = fc.oneof(
  fc.stringMatching(/^[A-Za-z0-9._~+/=-]{1,64}$/),
  fc.string({ minLength: 1 }).filter(value => !/\s/.test(value)),
)

/** The word "Bearer" in any mix of upper and lower case. */
const arbScheme: fc.Arbitrary<string> = fc
  .array(fc.boolean(), { minLength: 6, maxLength: 6 })
  .map(upper => [...'bearer'].map((letter, index) => (upper[index] === true ? letter.toUpperCase() : letter)).join(''))

const arbBadHeader: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constantFrom<string | null | undefined>(null, undefined, '', ' ', 'Bearer', 'Bearer ', 'bearer   '),
  // The token alone, without a scheme.
  arbToken.filter(token => !/^bearer$/i.test(token)),
  // Another scheme.
  fc.tuple(fc.constantFrom('Basic', 'Token', 'Digest', 'Bearers', 'JWT'), arbToken).map(
    ([scheme, token]) => `${scheme} ${token}`,
  ),
  // No space between the scheme and the token.
  arbToken.map(token => `Bearer${token}`).filter(header => !/^bearer +\S+$/i.test(header)),
  // Extra parts after the token.
  fc.tuple(arbToken, arbToken).map(([token, extra]) => `Bearer ${token} ${extra}`),
  // Something before the scheme.
  fc.tuple(arbToken, arbToken).map(([extra, token]) => `${extra} Bearer ${token}`),
)

// Feature: accounts-cloud-save, Property 21: Bearer parsing
// **Validates: Requirements 9.1, 11.10**
describe('Property 21: Bearer parsing', () => {
  it('returns the token of "Bearer <token>" whatever the case of the word Bearer', () => {
    fc.assert(
      fc.property(arbToken, arbScheme, (token, scheme) => {
        expect(parseBearer(`Bearer ${token}`)).toBe(token)
        expect(parseBearer(`${scheme} ${token}`)).toBe(token)
        expect(parseBearer(bearerHeader(token).Authorization)).toBe(token)
      }),
      RUNS,
    )
  })

  it('returns null for a missing header, another scheme, no token or extra parts', () => {
    fc.assert(
      fc.property(arbBadHeader, (header) => {
        expect(parseBearer(header)).toBeNull()
      }),
      RUNS,
    )
  })
})

const arbName: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.array(fc.constantFrom(' ', '\t', '\n', ' ', '　'), { maxLength: 6 }).map(chars => chars.join('')),
  fc.tuple(arbPad, fc.string(), arbPad).map(([left, name, right]) => `${left}${name}${right}`),
)

// Feature: accounts-cloud-save, Property 22: Display names are trimmed
// **Validates: Requirements 7.4**
describe('Property 22: Display names are trimmed', () => {
  it('gives null for an empty trimmed string, the trimmed string otherwise, and is stable on its own result', () => {
    fc.assert(
      fc.property(arbName, (raw) => {
        const name = normalizeDisplayName(raw)
        const trimmed = raw.trim()
        if (trimmed === '') {
          expect(name).toBeNull()
          return
        }
        expect(name).toBe(trimmed)
        if (name !== null) expect(normalizeDisplayName(name)).toBe(name)
      }),
      RUNS,
    )
  })
})
