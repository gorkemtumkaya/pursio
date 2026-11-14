import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { InMemoryPipelineStore } from '../../server/utils/video/pipeline-store-memory'
import {
  DEFAULT_DAILY_QUOTA,
  createQuotaGate,
  dailyQuota,
  quotaThreshold,
} from '../../server/utils/video/quota'

const RUNS = { numRuns: 300 }
const NOON = Date.UTC(2026, 10, 12, 20, 0, 0)

type Op = 'search' | 'details' | 'exceeded'
const arbOps = fc.array(fc.constantFrom<Op>('search', 'details', 'exceeded'), { maxLength: 80 })
const arbQuota = fc.integer({ min: 1, max: 2000 })

describe('Property 21: Quota never exceeds the daily limit', () => {
  /**
   * **Validates: Requirements 9.1, 9.3, 9.4, 9.5, 9.16**
   */
  it('matches the reserve rule and never exceeds the quota (sequential)', async () => {
    await fc.assert(
      fc.asyncProperty(arbQuota, arbOps, async (quota, ops) => {
        const store = new InMemoryPipelineStore(() => NOON)
        const gate = createQuotaGate(store, quota)
        const threshold = Math.ceil(0.9 * quota)
        let used = 0
        for (const op of ops) {
          if (op === 'search') {
            const expected = used < threshold && used + 100 <= quota
            expect(await gate.reserveSearch()).toBe(expected)
            if (expected) used += 100
          } else if (op === 'details') {
            const expected = used + 1 <= quota
            expect(await gate.reserveDetails()).toBe(expected)
            if (expected) used += 1
          } else {
            await gate.markExceeded()
            used = Math.max(used, quota)
            expect(store.quotaUsed()).toBe(quota)
            expect(await gate.reserveSearch()).toBe(false)
          }
          expect(store.quotaUsed()).toBe(used)
          expect(store.quotaUsed()).toBeLessThanOrEqual(quota)
        }
      }),
      RUNS,
    )
  })

  it('never exceeds the quota with several instances interleaved', async () => {
    await fc.assert(
      fc.asyncProperty(arbQuota, fc.array(arbOps, { minLength: 2, maxLength: 4 }), async (quota, perInstance) => {
        const shared = new InMemoryPipelineStore(() => NOON)
        const gates = perInstance.map(() => createQuotaGate(shared.restart(), quota))
        await Promise.all(
          perInstance.map(async (ops, i) => {
            const gate = gates[i]!
            for (const op of ops) {
              if (op === 'search') await gate.reserveSearch()
              else if (op === 'details') await gate.reserveDetails()
              else await gate.markExceeded()
              expect(shared.quotaUsed()).toBeLessThanOrEqual(quota)
            }
          }),
        )
        expect(shared.quotaUsed()).toBeLessThanOrEqual(quota)
      }),
      RUNS,
    )
  })

  it('counts a new Pacific_Day from zero', async () => {
    let now = NOON
    const store = new InMemoryPipelineStore(() => now)
    const gate = createQuotaGate(store, 1000)
    await gate.markExceeded()
    expect(await gate.reserveSearch()).toBe(false)
    now += 36 * 3600 * 1000
    expect(await gate.reserveSearch()).toBe(true)
  })
})

describe('Property 22: Daily quota configuration', () => {
  /**
   * **Validates: Requirements 9.7**
   */
  it('returns positive integers (number or integer string) unchanged', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }), (n) => {
        expect(dailyQuota(n)).toBe(n)
        expect(dailyQuota(String(n))).toBe(n)
      }),
      RUNS,
    )
  })

  it('returns 10000 for anything else', () => {
    const arbOther = fc.oneof(
      fc.constantFrom<unknown>(undefined, null, '', ' ', 'abc', '1.5', '-5', '0', 0, -3, 1.5, NaN, Infinity, true, {}, []),
      fc.integer({ max: 0 }),
      fc.double({ noInteger: true, noNaN: true }),
      fc.string().filter(s => !/^\s*\d+\s*$/.test(s)),
    )
    fc.assert(
      fc.property(arbOther, (raw) => {
        expect(dailyQuota(raw)).toBe(DEFAULT_DAILY_QUOTA)
      }),
      RUNS,
    )
    expect(DEFAULT_DAILY_QUOTA).toBe(10000)
  })

  it('threshold is 90 percent rounded up', () => {
    expect(quotaThreshold(10000)).toBe(9000)
    expect(quotaThreshold(1)).toBe(1)
  })
})
