// Unit tests for the waitlist route handler and its email rule (spec: landing-page, founding section).
import { describe, expect, it } from 'vitest'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { handleWaitlist, type WaitlistDeps } from '../../server/utils/waitlist-handlers'
import { parseWaitlistEmail } from '../../shared/utils/waitlist'

function fakeDeps(options: Partial<WaitlistDeps> = {}) {
  const saved: { email: string; kind: string }[] = []
  const logged: unknown[][] = []
  const deps: WaitlistDeps = {
    serviceRoleKey: 'service-role-placeholder',
    limiter: createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 }),
    saveTimeoutMs: 10,
    save: async (entry) => {
      saved.push(entry)
    },
    log: (...args) => {
      logged.push(args)
    },
    ...options,
  }
  return { deps, saved, logged }
}

describe('parseWaitlistEmail', () => {
  it('trims and lower-cases a valid address', () => {
    expect(parseWaitlistEmail('  Ada@Example.COM ')).toBe('ada@example.com')
  })

  it.each([
    ['not a string', 42],
    ['empty', ''],
    ['no @', 'ada.example.com'],
    ['no dot in the host', 'ada@example'],
    ['a space inside', 'ada lovelace@example.com'],
    ['two @', 'ada@@example.com'],
    ['longer than 254 characters', `${'a'.repeat(250)}@b.co`],
  ])('rejects %s', (_name, value) => {
    expect(parseWaitlistEmail(value)).toBeNull()
  })
})

describe('handleWaitlist', () => {
  it('saves the normalized address with its kind and answers 200', async () => {
    const fake = fakeDeps()
    const response = await handleWaitlist({ body: { email: ' Ada@Example.com', kind: 'founding' }, ip: '1.1.1.1' }, fake.deps)

    expect(response).toEqual({ status: 200, body: { ok: true } })
    expect(fake.saved).toEqual([{ email: 'ada@example.com', kind: 'founding' }])
    expect(fake.logged).toEqual([])
  })

  it.each([
    ['a missing body', null, 'invalid_kind'],
    ['an unknown kind', { email: 'ada@example.com', kind: 'vip' }, 'invalid_kind'],
    ['a bad address', { email: 'ada', kind: 'updates' }, 'invalid_email'],
  ])('answers 400 for %s and saves nothing', async (_name, body, code) => {
    const fake = fakeDeps()
    const response = await handleWaitlist({ body, ip: '1.1.1.1' }, fake.deps)

    expect(response).toEqual({ status: 400, body: { error: code } })
    expect(fake.saved).toEqual([])
  })

  it('answers 503 when the service role key is missing', async () => {
    const fake = fakeDeps({ serviceRoleKey: ' ' })
    const response = await handleWaitlist({ body: { email: 'ada@example.com', kind: 'updates' }, ip: '1.1.1.1' }, fake.deps)

    expect(response).toEqual({ status: 503, body: { error: 'no_key' } })
    expect(fake.saved).toEqual([])
  })

  it('limits requests per IP address, and counts a missing address as one caller', async () => {
    const fake = fakeDeps()
    const body = { email: 'ada@example.com', kind: 'updates' }

    expect((await handleWaitlist({ body, ip: '1.1.1.1' }, fake.deps)).status).toBe(200)
    expect((await handleWaitlist({ body, ip: '1.1.1.1' }, fake.deps)).status).toBe(200)
    expect(await handleWaitlist({ body, ip: '1.1.1.1' }, fake.deps)).toEqual({ status: 429, body: { error: 'rate_limited' } })
    expect((await handleWaitlist({ body, ip: '2.2.2.2' }, fake.deps)).status).toBe(200)
    expect((await handleWaitlist({ body, ip: undefined }, fake.deps)).status).toBe(200)
    expect((await handleWaitlist({ body, ip: '' }, fake.deps)).status).toBe(200)
    expect((await handleWaitlist({ body, ip: undefined }, fake.deps)).status).toBe(429)
  })

  it('does not spend the limit on an invalid request', async () => {
    const fake = fakeDeps()
    for (let i = 0; i < 5; i++) await handleWaitlist({ body: { email: 'x', kind: 'updates' }, ip: '1.1.1.1' }, fake.deps)

    const response = await handleWaitlist({ body: { email: 'ada@example.com', kind: 'updates' }, ip: '1.1.1.1' }, fake.deps)
    expect(response.status).toBe(200)
  })

  it.each([
    ['save throws', async () => Promise.reject(new Error('db says: ada@example.com exists'))],
    ['save never finishes', () => new Promise<void>(() => {})],
  ])('answers 502 when %s, and logs the code only', async (_name, save) => {
    const fake = fakeDeps({ save })
    const response = await handleWaitlist({ body: { email: 'ada@example.com', kind: 'founding' }, ip: '1.1.1.1' }, fake.deps)

    expect(response).toEqual({ status: 502, body: { error: 'save_failed' } })
    expect(fake.logged).toEqual([[{ code: 'save_failed' }]])
  })
})
