// Property test for handleDeleteAccount (spec: accounts-cloud-save, Property 16).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleDeleteAccount } from '../../server/utils/account-handlers'
import { fakeDeleteDeps } from '../support/account-deps'
import { never } from '../support/tree-deps'

const RUNS = { numRuns: 100 }
const SHORT_MS = 5

type Auth =
  | { kind: 'valid'; scheme: string; token: string }
  | { kind: 'missing' }
  | { kind: 'malformed'; header: string }
  | { kind: 'rejected' | 'empty_id' | 'throws' | 'timeout'; scheme: string; token: string }

const arbToken = fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/)
const arbScheme = fc.constantFrom('Bearer', 'bearer', 'BEARER')

const arbMalformed = fc.oneof(
  fc.constantFrom('', 'Bearer', 'Bearer ', 'Basic abc', 'Token abc', 'abc', 'Bearer a b', 'Bearerabc', ' Bearer abc'),
  fc.string().filter((s) => !/^bearer /i.test(s)),
)

const arbAuth: fc.Arbitrary<Auth> = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record({ kind: fc.constant('valid' as const), scheme: arbScheme, token: arbToken }),
  },
  { weight: 1, arbitrary: fc.constant<Auth>({ kind: 'missing' }) },
  { weight: 1, arbitrary: arbMalformed.map((header): Auth => ({ kind: 'malformed', header })) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constantFrom('rejected' as const, 'empty_id' as const, 'throws' as const, 'timeout' as const),
      scheme: arbScheme,
      token: arbToken,
    }),
  },
)

const arbKey = fc.oneof(
  { weight: 2, arbitrary: fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/) },
  { weight: 1, arbitrary: fc.constantFrom('', ' ', '   ', '\t', '\n ') },
)

// Feature: accounts-cloud-save, Property 16: The delete route deletes only the verified user
// **Validates: Requirements 11.9, 11.10, 11.11, 11.14**
describe('Property 16: The delete route deletes only the verified user', () => {
  it('deletes the verified user once, or nobody', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAuth,
        arbKey,
        fc.uuid(),
        fc.record({ userId: fc.string(), user_id: fc.string(), id: fc.string() }),
        async (auth, serviceRoleKey, verifiedId, spoof) => {
          const fake = fakeDeleteDeps({
            serviceRoleKey,
            verifyTimeoutMs: SHORT_MS,
            verifyToken: async () => {
              if (auth.kind === 'valid') return verifiedId
              if (auth.kind === 'empty_id') return ''
              if (auth.kind === 'throws') throw new Error('verifier down')
              if (auth.kind === 'timeout') return never<string | null>()
              return null
            },
          })
          const authorization =
            auth.kind === 'missing' ? undefined : auth.kind === 'malformed' ? auth.header : `${auth.scheme} ${auth.token}`
          // Request fields that name another user. The handler has no input for them.
          const input = { authorization, ...spoof, body: spoof, query: spoof }

          const response = await handleDeleteAccount(input, fake.deps)

          if (auth.kind !== 'valid') {
            expect(response).toEqual({ status: 401, body: { error: 'unauthorized' } })
            expect(fake.calls.deleteUser).toEqual([])
          } else if (serviceRoleKey.trim() === '') {
            expect(response).toEqual({ status: 503, body: { error: 'no_key' } })
            expect(fake.calls.deleteUser).toEqual([])
          } else {
            expect(response).toEqual({ status: 200, body: { ok: true } })
            expect(fake.calls.deleteUser).toEqual([verifiedId])
          }
          const bearer = auth.kind !== 'missing' && auth.kind !== 'malformed'
          expect(fake.calls.verify).toEqual(bearer ? [auth.token] : [])
        },
      ),
      RUNS,
    )
  })
})
