// Feature: sample-path, Property 1: Route decision
// Feature: sample-path, Property 2: Sample to tree
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { emptyProgress, deriveNodeStates } from '../../shared/utils/progress-engine'
import { parseSamplePath, sampleCounts, sampleToTree } from '../../shared/utils/sample-path'
import { CAMPAIGN_KEYS, isSampleSlug, SAMPLE_SLUGS, unknownSlugTarget } from '../../shared/utils/sample-slugs'
import { checkPathOrder } from '../../app/utils/path-layout'
import { arbSamplePath } from '../arbitraries'

const RUNS = { numRuns: 100 }

const arbSlug: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(...SAMPLE_SLUGS, 'Guitar', 'guitar ', 'film-photography', 'trail_running', '---', '%E0%A4%A', 'a%20b'),
  fc.string({ maxLength: 80 }),
  fc.stringMatching(/^[a-z0-9_-]{1,90}$/),
)

const arbQueryValue: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 220 }),
  fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
  fc.constant(null),
  fc.integer(),
)

const arbQuery: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  fc.oneof(fc.constantFrom(...CAMPAIGN_KEYS, 'hobby', 'start', 'note', 'ref'), fc.string({ maxLength: 10 })),
  arbQueryValue,
  { maxKeys: 8 },
)

const ALLOWED = /^[\p{L}\p{N} '’&.]+$/u

describe('Property 1: Route decision', () => {
  it('only the three exact slugs are sample pages', () => {
    fc.assert(
      fc.property(arbSlug, (slug) => {
        expect(isSampleSlug(slug)).toBe((SAMPLE_SLUGS as readonly string[]).includes(slug))
      }),
      RUNS,
    )
  })

  it('an unknown slug goes to /new with a clean hobby, start=0, and only the campaign params of the query', () => {
    fc.assert(
      fc.property(arbSlug, arbQuery, (slug, query) => {
        const target = unknownSlugTarget(slug, query)
        expect(target.path).toBe('/new')
        const { hobby, start, ...rest } = target.query
        if (hobby !== undefined) {
          expect(Array.from(hobby).length).toBeLessThanOrEqual(60)
          expect(hobby).toBe(hobby.trim())
          expect(hobby).not.toBe('')
          expect(hobby).toMatch(ALLOWED)
          expect(start).toBe('0')
        } else {
          expect(start).toBeUndefined()
        }
        for (const [key, value] of Object.entries(rest)) {
          expect((CAMPAIGN_KEYS as readonly string[]).includes(key)).toBe(true)
          expect(value.length).toBeGreaterThanOrEqual(1)
          expect(value.length).toBeLessThanOrEqual(200)
          const raw = query[key]
          expect(Array.isArray(raw) ? raw[0] : raw).toBe(value)
        }
      }),
      RUNS,
    )
  })
})

describe('Property 2: Sample to tree', () => {
  it('a valid Sample passes the checks and becomes a drawable tree with the same order and counts', () => {
    fc.assert(
      fc.property(arbSamplePath, (sample) => {
        const parsed = parseSamplePath(sample, sample.slug)
        if (!parsed.ok) throw new Error(parsed.errors.join('\n'))

        const tree = sampleToTree(sample)
        expect(tree.sections.map((s) => s.title)).toEqual(sample.sections.map((s) => s.name))
        const ids = sample.sections.flatMap((s) => s.skills.map((k) => k.id))
        expect(tree.sections.flatMap((s) => s.nodes.map((n) => n.id))).toEqual(ids)
        expect(checkPathOrder(tree)).toBeNull()

        const states = deriveNodeStates(tree, emptyProgress())
        expect(states.get(ids[0]!)).toBe('current')
        expect([...states.values()].filter((state) => state === 'current')).toHaveLength(1)
        expect([...states.values()]).not.toContain('completed')

        const counts = sampleCounts(sample)
        expect(counts.skills).toBe(ids.length)
        expect(counts.sections).toBe(sample.sections.length)
      }),
      RUNS,
    )
  })
})
