import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import type { RateLimiter } from '../../server/utils/rate-limiter'

const LIMIT = 10
const WINDOW_MS = 3_600_000

function limiterAt(start: number): { limiter: RateLimiter, clock: { now: number } } {
  const clock = { now: start }
  return { limiter: createRateLimiter({ limit: LIMIT, windowMs: WINDOW_MS, now: () => clock.now }), clock }
}

function consume(limiter: RateLimiter, key: string, times: number): boolean[] {
  return Array.from({ length: times }, () => limiter.tryConsume(key))
}

describe('createRateLimiter', () => {
  it('allows 10 requests of one user id and denies the 11th', () => {
    const { limiter } = limiterAt(1_000)
    expect(consume(limiter, 'user-a', 10)).toEqual(Array.from({ length: 10 }, () => true))
    expect(limiter.tryConsume('user-a')).toBe(false)
    expect(limiter.tryConsume('user-a')).toBe(false)
  })

  it('keeps a separate bucket per user id (Req 9.4)', () => {
    const { limiter } = limiterAt(1_000)
    consume(limiter, 'user-a', 10)
    expect(limiter.tryConsume('user-a')).toBe(false)

    // Another user is not affected, and using it up does not free the first one.
    expect(consume(limiter, 'user-b', 10)).toEqual(Array.from({ length: 10 }, () => true))
    expect(limiter.tryConsume('user-b')).toBe(false)
    expect(limiter.tryConsume('user-a')).toBe(false)
    expect(limiter.tryConsume('user-c')).toBe(true)
  })

  it('frees a slot exactly one window after the request that took it (window edge)', () => {
    const start = 5_000
    const { limiter, clock } = limiterAt(start)
    consume(limiter, 'user-a', 10)

    clock.now = start + WINDOW_MS - 1
    expect(limiter.tryConsume('user-a')).toBe(false)

    // The window is (t - 60 min, t]: at start + 60 min the first requests are outside.
    clock.now = start + WINDOW_MS
    expect(consume(limiter, 'user-a', 10)).toEqual(Array.from({ length: 10 }, () => true))
    expect(limiter.tryConsume('user-a')).toBe(false)
  })

  it('slides: each request frees its slot at its own time', () => {
    const { limiter, clock } = limiterAt(0)
    for (let minute = 0; minute < 10; minute += 1) {
      clock.now = minute * 60_000
      expect(limiter.tryConsume('user-a')).toBe(true)
    }
    clock.now = WINDOW_MS - 1
    expect(limiter.tryConsume('user-a')).toBe(false)

    // Only the request made at minute 0 has left the window.
    clock.now = WINDOW_MS
    expect(limiter.tryConsume('user-a')).toBe(true)
    expect(limiter.tryConsume('user-a')).toBe(false)

    clock.now = WINDOW_MS + 60_000
    expect(limiter.tryConsume('user-a')).toBe(true)
    expect(limiter.tryConsume('user-a')).toBe(false)
  })

  it('does not count denied requests (Req 9.6)', () => {
    const start = 0
    const { limiter, clock } = limiterAt(start)
    consume(limiter, 'user-a', 10)

    // Denied requests late in the window must not push the user's next slot out.
    clock.now = start + WINDOW_MS - 1
    expect(consume(limiter, 'user-a', 5)).toEqual([false, false, false, false, false])

    clock.now = start + WINDOW_MS
    expect(consume(limiter, 'user-a', 10)).toEqual(Array.from({ length: 10 }, () => true))
  })

  it('treats user ids as exact keys', () => {
    const { limiter } = limiterAt(0)
    consume(limiter, 'user-a', 10)
    expect(limiter.tryConsume('USER-A')).toBe(true)
    expect(limiter.tryConsume('user-a ')).toBe(true)
    expect(limiter.tryConsume('')).toBe(true)
  })

  it('honors the limit and window it is given', () => {
    let now = 0
    const limiter = createRateLimiter({ limit: 2, windowMs: 100, now: () => now })
    expect(consume(limiter, 'k', 3)).toEqual([true, true, false])
    now = 99
    expect(limiter.tryConsume('k')).toBe(false)
    now = 100
    expect(consume(limiter, 'k', 3)).toEqual([true, true, false])
  })
})
