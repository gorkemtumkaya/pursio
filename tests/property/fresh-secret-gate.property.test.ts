// Feature: fresh, Property 8: Secret gate
// For any configured secret and any header that differs from it (missing, prefix, suffix,
// mutation), and for an unset secret with any header, the Check_Route returns an error status
// and records 0 Fresh_Checks, 0 feed fetches, 0 provider calls, 0 model calls and 0 store writes.
// Validates: Requirements 3.4
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { handleCheckRequest } from '../../server/utils/fresh/handlers'
import { activePath, createCheckRouteHarness } from '../support/fresh-route-fakes'

const secretArb = fc.string({ unit: 'grapheme-ascii', minLength: 8, maxLength: 64 })

/** A header value that differs from the secret: missing, prefix, suffix, extension or mutation. */
function wrongHeader(secret: string): fc.Arbitrary<string | undefined> {
  return fc.oneof(
    fc.constant(undefined),
    fc.constant(''),
    fc.integer({ min: 0, max: secret.length - 1 }).map((n) => secret.slice(0, n)),
    fc.integer({ min: 1, max: secret.length }).map((n) => secret.slice(n)),
    fc.string({ unit: 'grapheme-ascii', minLength: 1, maxLength: 4 }).map((extra) => secret + extra),
    fc.string({ unit: 'grapheme-ascii', minLength: 1, maxLength: 4 }).map((extra) => extra + secret),
    fc.integer({ min: 0, max: secret.length - 1 }).map((i) => {
      const c = secret.charCodeAt(i)
      return secret.slice(0, i) + String.fromCharCode(c === 0x7e ? 0x21 : c + 1) + secret.slice(i + 1)
    }),
    fc.constant(secret.toUpperCase() === secret ? secret.toLowerCase() : secret.toUpperCase()),
    fc.constant(` ${secret}`),
    fc.string({ unit: 'grapheme-ascii', maxLength: 70 }),
  ).filter((header) => header !== secret)
}

async function expectNothingRan(
  h: ReturnType<typeof createCheckRouteHarness>,
  header: string | undefined,
  status: number,
): Promise<void> {
  const result = await handleCheckRequest({ secretHeader: header }, h.deps)
  expect(result.status).toBe(status)
  expect('error' in result.body).toBe(true)
  expect(h.checks).toEqual([])
  expect(h.storeCalls).toEqual([])
  expect(h.feeds.calls).toEqual([])
  expect(h.provider.detailsCalls).toEqual([])
  expect(h.provider.searchCalls).toEqual([])
  expect(h.judge.calls).toEqual([])
}

describe('Property 8: Secret gate', () => {
  it('a configured secret with a different or missing header gives 401 and runs nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb.chain((secret) => fc.tuple(fc.constant(secret), wrongHeader(secret))),
        async ([secret, header]) => {
          const h = createCheckRouteHarness({ secret })
          // A due key exists, so a passing gate would start a check.
          h.stores.fresh.setPaths([activePath('bouldering', 'en', h.clock.now())])
          await expectNothingRan(h, header, 401)
        },
      ),
      { numRuns: 200 },
    )
  })

  it('an unset secret gives 404 and runs nothing, whatever the header', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.string({ maxLength: 64 }), { nil: undefined }), async (header) => {
        const h = createCheckRouteHarness({ secret: '' })
        h.stores.fresh.setPaths([activePath('bouldering', 'en', h.clock.now())])
        await expectNothingRan(h, header, 404)
      }),
      { numRuns: 100 },
    )
  })

  it('the right secret passes the gate', async () => {
    await fc.assert(
      fc.asyncProperty(secretArb, async (secret) => {
        const h = createCheckRouteHarness({ secret })
        const result = await handleCheckRequest({ secretHeader: secret }, h.deps)
        expect(result).toEqual({ status: 202, body: { accepted: true } })
        expect(h.storeCalls).toContain('cleanup')
      }),
      { numRuns: 100 },
    )
  })
})
