import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { fetchDetails } from '../../server/utils/video/details'
import type { QuotaGate } from '../../server/utils/video/quota'
import type { SearchHit } from '../../server/utils/video/provider'
import { classifySearch, mergeHits, searchAll, type SingleSearch } from '../../server/utils/video/search'
import { createFakeVideoProvider, fakeDetails } from '../support/video-fakes'

const RUNS = { numRuns: 200 }

const openGate: QuotaGate = {
  reserveSearch: async () => true,
  reserveDetails: async () => true,
  markExceeded: async () => {},
}

const arbId = fc.stringMatching(/^[a-z0-9]{1,4}$/)
const arbHit: fc.Arbitrary<SearchHit> = fc.record({
  id: arbId,
  title: fc.string({ maxLength: 8 }),
  channel: fc.string({ maxLength: 8 }),
  thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hq.jpg'),
})
const arbHits = fc.array(arbHit, { maxLength: 8 })
const arbOutcome: fc.Arbitrary<SingleSearch> = fc.oneof(
  fc.constant<SingleSearch>({ ok: false }),
  arbHits.map((hits): SingleSearch => ({ ok: true, hits })),
)

describe('Property 10: Merge keeps each video once, first occurrence first', () => {
  /**
   * **Validates: Requirements 3.7, 7.2**
   */
  it('has unique ids and keeps the first occurrence in query order', () => {
    fc.assert(
      fc.property(fc.array(arbHits, { maxLength: 5 }), (lists) => {
        const merged = mergeHits(lists)
        const ids = merged.map(h => h.id)
        expect(new Set(ids).size).toBe(ids.length)

        const flat = lists.flat()
        expect(new Set(ids)).toEqual(new Set(flat.map(h => h.id)))
        for (const hit of merged) {
          expect(hit).toBe(flat.find(h => h.id === hit.id))
        }
        // Order of first occurrence is preserved.
        const firstOrder = [...new Set(flat.map(h => h.id))]
        expect(ids).toEqual(firstOrder)
      }),
      RUNS,
    )
  })
})

describe('Property 11: Search outcome classification', () => {
  /**
   * **Validates: Requirements 3.8, 3.9, 3.10, 3.11**
   */
  it('classifies by failures and total hits', () => {
    fc.assert(
      fc.property(fc.array(arbOutcome, { minLength: 1, maxLength: 5 }), (outcomes) => {
        const failed = outcomes.filter(o => !o.ok).length
        const total = outcomes.reduce((n, o) => n + (o.ok ? o.hits.length : 0), 0)
        const cls = classifySearch(outcomes)
        if (failed === outcomes.length || (failed > 0 && total === 0)) {
          expect(cls).toBe('provider_failure')
        }
        else if (failed === 0 && total === 0) expect(cls).toBe('empty')
        else expect(cls).toBe('candidates')
      }),
      RUNS,
    )
  })

  it('searchAll returns merged hits of the successful searches only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.oneof(fc.constant<'fail'>('fail'), arbHits), { minLength: 1, maxLength: 5 }),
        async (scripts) => {
          const queries = scripts.map((_, i) => `query ${i}`)
          const provider = createFakeVideoProvider({
            search: Object.fromEntries(queries.map((q, i) => {
              const s = scripts[i]!
              return [q, s === 'fail' ? { fail: 'upstream' as const } : { ok: s }]
            })),
          })
          const result = await searchAll({ provider, gate: openGate }, queries, 'en')
          const outcomes: SingleSearch[] = scripts.map(s => (s === 'fail' ? { ok: false } : { ok: true, hits: s }))
          const cls = classifySearch(outcomes)
          if (cls === 'candidates') {
            expect(result).toEqual({
              kind: 'candidates',
              hits: mergeHits(outcomes.map(o => (o.ok ? o.hits : []))),
            })
          }
          else expect(result.kind).toBe(cls)
        },
      ),
      RUNS,
    )
  })
})

describe('Property 12: Details batching and unknown fields', () => {
  /**
   * **Validates: Requirements 4.1, 4.3, 4.4, 4.6, 7.2**
   */
  it('makes ceil(n/50) calls of at most 50 ids, drops absent ids and keeps unknown fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 130 }),
        fc.array(fc.integer({ min: 0, max: 129 }), { maxLength: 20 }),
        fc.boolean(),
        async (n, missingIdx, unknownFields) => {
          const ids = Array.from({ length: n }, (_, i) => `id${i}`)
          const missing = new Set(missingIdx.map(i => `id${i}`))
          const catalog = ids.filter(id => !missing.has(id)).map(id =>
            fakeDetails(id, unknownFields
              ? { durationSeconds: null, viewCount: null, likeCount: null, publishedAt: null, defaultAudioLanguage: null, hasCaptions: null, embeddable: null }
              : {}),
          )
          const provider = createFakeVideoProvider({ catalog })
          const result = await fetchDetails({ provider, gate: openGate }, ids)

          expect(provider.detailsCalls.length).toBe(Math.ceil(n / 50))
          for (const call of provider.detailsCalls) expect(call.ids.length).toBeLessThanOrEqual(50)
          expect(result.kind).toBe('ok')
          if (result.kind !== 'ok') return
          expect(result.details.map(d => d.id)).toEqual(ids.filter(id => !missing.has(id)))
          if (unknownFields) {
            for (const d of result.details) {
              expect(d.durationSeconds).toBeNull()
              expect(d.embeddable).toBeNull()
            }
          }
        },
      ),
      RUNS,
    )
  })
})
