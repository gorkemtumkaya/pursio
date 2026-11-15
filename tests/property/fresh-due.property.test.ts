import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { CHECK_INTERVAL_S, type DueState, dueOrder, isDue } from '../../server/utils/fresh/schedule'

const RUNS = { numRuns: 300 }
const DAY_MS = 86_400_000

// Strings where code point order and UTF-16 order disagree: U+FF61 and U+E000 sort
// before U+1F600 by code point, but after it by UTF-16 unit (0xD83D).
const TRICKY = ['\uFF61', '\uE000', '\u{1F600}', '\u{10000}', 'a\uFFFF', 'a\u{1F600}', 'a', 'é', 'bouldering']

const arbText = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...TRICKY) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', maxLength: 4 }) },
)

// Small time range so ties on Last_Attempt_Time occur often.
const arbTime = fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2_000_000_000_000 }))

const arbState: fc.Arbitrary<DueState> = fc.record({
  key: fc.record({ hobby: arbText, language: arbText }),
  lastSuccessMs: fc.option(arbTime, { nil: null }),
  lastAttemptMs: fc.option(arbTime, { nil: null }),
})

/** Code point order, written independently of the module under test. */
function codePointOrder(a: string, b: string): number {
  const pa = Array.from(a, (ch) => ch.codePointAt(0) ?? 0)
  const pb = Array.from(b, (ch) => ch.codePointAt(0) ?? 0)
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    const d = (pa[i] as number) - (pb[i] as number)
    if (d !== 0) return d
  }
  return pa.length - pb.length
}

/** Negative when a must come before b (Req 3.6). */
function dueCompare(a: DueState, b: DueState): number {
  if (a.lastAttemptMs === null && b.lastAttemptMs !== null) return -1
  if (a.lastAttemptMs !== null && b.lastAttemptMs === null) return 1
  if (a.lastAttemptMs !== null && b.lastAttemptMs !== null && a.lastAttemptMs !== b.lastAttemptMs) {
    return a.lastAttemptMs - b.lastAttemptMs
  }
  return codePointOrder(a.key.hobby, b.key.hobby) || codePointOrder(a.key.language, b.key.language)
}

const key = { hobby: 'bouldering', language: 'en' }

describe('fresh due rule and due order', () => {
  // Feature: fresh, Property 6: Due rule and due order
  // **Validates: Requirements 3.5, 3.6**
  it('isDue is true exactly when never successful or the last success is 86400 s or more before the call start', () => {
    expect(CHECK_INTERVAL_S).toBe(86400)
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 2_000_000_000_000 }), { nil: null }),
        fc.oneof(
          fc.integer({ min: -2 * DAY_MS, max: 2 * DAY_MS }),
          fc.constantFrom(DAY_MS - 1, DAY_MS, DAY_MS + 1),
        ),
        fc.option(arbTime, { nil: null }),
        (lastSuccessMs, offset, lastAttemptMs) => {
          const callStartMs = (lastSuccessMs ?? 1_000_000_000_000) + offset
          const expected = lastSuccessMs === null || callStartMs - lastSuccessMs >= 86400 * 1000
          expect(isDue({ key, lastSuccessMs, lastAttemptMs }, callStartMs)).toBe(expected)
        },
      ),
      RUNS,
    )
  })

  it('isDue at the exact 86400 s boundary', () => {
    const lastSuccessMs = 1_700_000_000_000
    const state = (s: number | null): DueState => ({ key, lastSuccessMs: s, lastAttemptMs: s })
    expect(isDue(state(lastSuccessMs), lastSuccessMs + DAY_MS)).toBe(true)
    expect(isDue(state(lastSuccessMs), lastSuccessMs + DAY_MS - 1)).toBe(false)
    expect(isDue(state(lastSuccessMs), lastSuccessMs + DAY_MS + 1)).toBe(true)
    expect(isDue(state(lastSuccessMs), lastSuccessMs)).toBe(false)
    expect(isDue(state(null), 0)).toBe(true)
  })

  // Feature: fresh, Property 6: Due rule and due order
  // **Validates: Requirements 3.5, 3.6**
  it('dueOrder returns a permutation in never-attempted, attempt time, hobby, language order', () => {
    fc.assert(
      fc.property(fc.array(arbState, { maxLength: 30 }), (states) => {
        const input = states.map((s) => ({ ...s, key: { ...s.key } }))
        const result = dueOrder(states)

        // Input untouched and a new array.
        expect(states).toEqual(input)
        expect(result).not.toBe(states)

        // Permutation: same elements by identity, each used once.
        expect(result.length).toBe(states.length)
        expect(new Set(result).size).toBe(result.length)
        for (const s of result) expect(states).toContain(s)

        // Every adjacent pair in order.
        for (let i = 1; i < result.length; i++) {
          expect(dueCompare(result[i - 1] as DueState, result[i] as DueState)).toBeLessThanOrEqual(0)
        }

        // Never-attempted keys form a prefix.
        const firstAttempted = result.findIndex((s) => s.lastAttemptMs !== null)
        if (firstAttempted >= 0) {
          expect(result.slice(firstAttempted).every((s) => s.lastAttemptMs !== null)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('dueOrder breaks ties by code point order, not UTF-16 order', () => {
    const s = (hobby: string, language: string, lastAttemptMs: number | null): DueState => ({
      key: { hobby, language },
      lastSuccessMs: null,
      lastAttemptMs,
    })
    const hobbies = dueOrder([s('\u{1F600}', 'en', 5), s('\uFF61', 'en', 5), s('\uE000', 'en', 5)]).map((x) => x.key.hobby)
    expect(hobbies).toEqual(['\uE000', '\uFF61', '\u{1F600}'])

    const langs = dueOrder([s('a', '\u{1F600}', null), s('a', '\uFF61', null)]).map((x) => x.key.language)
    expect(langs).toEqual(['\uFF61', '\u{1F600}'])

    const order = dueOrder([s('a', 'en', 2), s('z', 'en', 1), s('m', 'en', null)]).map((x) => x.key.hobby)
    expect(order).toEqual(['m', 'z', 'a'])
  })
})
