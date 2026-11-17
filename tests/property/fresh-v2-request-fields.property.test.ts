// Feature: fresh-v2, Property 9: Request fields
// For any signed-out body whose paths carry a random `colorSlot` (valid, missing, 0, 6,
// fractional, a string) and `completedCount` (valid, missing, negative, above the Skill count),
// the handler returns 400 with the first invalid field when any present value is invalid.
// Otherwise every path's `FreshPath.colorSlot` and `completedCount` equal the sent values, or 1
// and 0 when missing.
// Validates: Requirements 9.9, 12.8
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshResponseOk } from '../../shared/types/fresh'
import { handleFreshRequest } from '../../server/utils/fresh/handlers'
import { createFreshEndpointHarness } from '../support/fresh-route-fakes'

const RUNS = { numRuns: 200 }

type Field<T> = { state: 'missing' } | { state: 'valid'; value: T } | { state: 'invalid'; value: unknown }

const arbSlot: fc.Arbitrary<Field<number>> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(1, 2, 3, 4, 5).map((value): Field<number> => ({ state: 'valid', value })) },
  { weight: 2, arbitrary: fc.constant<Field<number>>({ state: 'missing' }) },
  {
    weight: 2,
    arbitrary: fc
      .constantFrom<unknown>(0, 6, -3, 1.5, 4.000001, '2', 'red', null, true, [1], Number.MAX_SAFE_INTEGER)
      .map((value): Field<number> => ({ state: 'invalid', value })),
  },
)

/** Relative to the Skill count `n`: valid is 0..n. */
const arbCount = (n: number): fc.Arbitrary<Field<number>> =>
  fc.oneof(
    { weight: 4, arbitrary: fc.integer({ min: 0, max: n }).map((value): Field<number> => ({ state: 'valid', value })) },
    { weight: 2, arbitrary: fc.constant<Field<number>>({ state: 'missing' }) },
    {
      weight: 2,
      arbitrary: fc
        .constantFrom<unknown>(-1, -100, n + 1, n + 50, 0.5, n - 0.5, '0', null, false, {})
        .map((value): Field<number> => ({ state: 'invalid', value })),
    },
  )

interface PathCase {
  skills: number
  current: boolean
  slot: Field<number>
  count: Field<number>
}

const arbPathCase: fc.Arbitrary<PathCase> = fc
  .integer({ min: 1, max: 6 })
  .chain((skills) => fc.record({ skills: fc.constant(skills), current: fc.boolean(), slot: arbSlot, count: arbCount(skills) }))

function bodyOf(cases: readonly PathCase[]): { language: string; paths: Record<string, unknown>[] } {
  return {
    language: 'en',
    paths: cases.map((c, i) => {
      const skills = Array.from({ length: c.skills }, (_, j) => ({ id: `s${i}-${j}`, title: `Skill ${i} ${j}`, level: 'beginner' }))
      const path: Record<string, unknown> = {
        id: `p${i}`,
        hobby: `Hobby ${i}`,
        skills,
        currentSkillId: c.current ? skills[0]!.id : null,
      }
      if (c.slot.state !== 'missing') path.colorSlot = c.slot.value
      if (c.count.state !== 'missing') path.completedCount = c.count.value
      return path
    }),
  }
}

/** The first invalid field in path order, `colorSlot` before `completedCount`, or null. */
function firstInvalid(cases: readonly PathCase[]): string | null {
  for (let i = 0; i < cases.length; i += 1) {
    if (cases[i]!.slot.state === 'invalid') return `paths[${i}].colorSlot`
    if (cases[i]!.count.state === 'invalid') return `paths[${i}].completedCount`
  }
  return null
}

describe('Feature: fresh-v2, Property 9: Request fields', () => {
  it('rejects the first invalid value with 400 and its field, else copies the values (1 and 0 when missing)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbPathCase, { minLength: 1, maxLength: 6 }), async (cases) => {
        const h = createFreshEndpointHarness()
        const result = await handleFreshRequest(
          { body: bodyOf(cases), authorization: undefined, clientIp: '198.51.100.7' },
          h.deps,
        )
        const field = firstInvalid(cases)
        if (field !== null) {
          expect(result.status).toBe(400)
          expect(result.body).toEqual({ error: 'invalid_input', field })
          // Rejected before any read.
          expect(h.reads).toHaveLength(0)
          return
        }
        expect(result.status).toBe(200)
        const response = result.body as FreshResponseOk
        expect(response.paths.map((p) => p.id)).toEqual(cases.map((_, i) => `p${i}`))
        cases.forEach((c, i) => {
          const path = response.paths[i]!
          expect(path.colorSlot).toBe(c.slot.state === 'valid' ? c.slot.value : 1)
          expect(path.completedCount).toBe(c.count.state === 'valid' ? c.count.value : 0)
        })
      }),
      RUNS,
    )
  })
})
