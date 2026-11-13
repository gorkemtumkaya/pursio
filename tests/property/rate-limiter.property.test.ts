import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { arbRequestSequence } from '../arbitraries'
import type { RateRequest } from '../arbitraries'

const RUNS = { numRuns: 300 }
const LIMIT = 10
const WINDOW_MS = 3_600_000

/** Runs the requests through a fresh limiter and returns each decision. */
function decide(requests: readonly RateRequest[]): boolean[] {
  let clock = 0
  const limiter = createRateLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now: () => clock })
  return requests.map(({ userId, time }) => {
    clock = time
    return limiter.tryConsume(userId)
  })
}

/** Reference model: per user id, the times of the allowed requests. */
function reference(requests: readonly RateRequest[]): boolean[] {
  const allowed = new Map<string, number[]>()
  return requests.map(({ userId, time }) => {
    const times = allowed.get(userId) ?? []
    const inWindow = times.filter(t => t > time - WINDOW_MS && t <= time).length
    if (inWindow >= LIMIT) return false
    allowed.set(userId, [...times, time])
    return true
  })
}

// Feature: accounts-cloud-save, Property 11: The Rate_Limiter decides per user id
// **Validates: Requirements 9.4, 9.6**
describe('Property 11: The Rate_Limiter decides per user id', () => {
  it('allows a request exactly when the model holds fewer than 10 allowed times in (t - 1 h, t]', () => {
    fc.assert(
      fc.property(arbRequestSequence, (requests) => {
        expect(decide(requests)).toEqual(reference(requests))
      }),
      RUNS,
    )
  })

  it('removing the requests of the other user ids changes no decision for the remaining one', () => {
    fc.assert(
      fc.property(arbRequestSequence, (requests) => {
        const decisions = decide(requests)
        for (const userId of new Set(requests.map(request => request.userId))) {
          const alone = decide(requests.filter(request => request.userId === userId))
          expect(alone).toEqual(decisions.filter((_, index) => requests[index]?.userId === userId))
        }
      }),
      RUNS,
    )
  })

  it('the generated sequences reach the limit', () => {
    // Guards the two properties above against only ever seeing allowed requests.
    const samples = fc.sample(arbRequestSequence, { numRuns: 200, seed: 7 })
    const denied = samples.filter(requests => decide(requests).includes(false))
    expect(denied.length).toBeGreaterThan(20)
    // Some users are allowed again after being denied, once their window moved on.
    const recovered = denied.filter((requests) => {
      const decisions = decide(requests)
      return requests.some((request, index) =>
        decisions[index] === true
        && requests.some((earlier, before) => before < index && earlier.userId === request.userId && decisions[before] === false),
      )
    })
    expect(recovered.length).toBeGreaterThan(0)
  })
})
