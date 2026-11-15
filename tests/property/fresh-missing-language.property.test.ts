// Feature: fresh, Property 40: Missing language gives `en`, never `und`
// For any hobby and any missing language (null, undefined, '' or whitespace), checkKey gives
// `en` and checkKeysForPath gives exactly one `en` key; activeCheckKeys forms no `und` key
// unless a row has a non-empty language that languageCode maps to `und`; and for any valid
// signed-out body or signed-in profile with a missing language, every check key and pool key
// the Fresh_Endpoint reads has `en`.
// Validates: Requirements 3.16, 8.2, 8.16
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Level } from '../../shared/types/skill-tree'
import { checkKey, checkKeysForPath } from '../../shared/utils/fresh-keys'
import { languageCode } from '../../shared/utils/video-normalize'
import { handleFreshRequest } from '../../server/utils/fresh/handlers'
import { activeCheckKeys } from '../../server/utils/fresh/schedule'
import { createFreshEndpointHarness, userData, userPath } from '../support/fresh-route-fakes'

const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']
const missingArb = fc.constantFrom<string | null | undefined>(null, undefined, '', ' ', '\t', '  \n ')
const languageArb = fc.oneof(missingArb, fc.constantFrom('de', 'pt-BR', 'en', 'x', '123', '!!'))
const hobbyArb = fc.string({ minLength: 1, maxLength: 30 }).filter((h) => h.trim() !== '')

const bodyPathsArb = fc.array(
  fc.record({
    hobby: fc.constantFrom('Bouldering', 'Yoga', 'Chess club'),
    titles: fc.array(fc.constantFrom('Footwork', 'Balance', 'Openings'), { minLength: 1, maxLength: 4 }),
    level: fc.constantFrom(...LEVELS),
    current: fc.option(fc.nat(), { nil: null }),
  }),
  { minLength: 1, maxLength: 4 },
)

function poolKeyLanguage(key: string): unknown {
  const parsed: unknown = JSON.parse(key)
  return Array.isArray(parsed) ? parsed[3] : undefined
}

describe('Property 40: Missing language gives en, never und', () => {
  it('checkKey and checkKeysForPath give en for a missing language', () => {
    fc.assert(
      fc.property(hobbyArb, missingArb, (hobby, language) => {
        expect(checkKey(hobby, language).language).toBe('en')
        const keys = checkKeysForPath(hobby, language)
        expect(keys).toHaveLength(1)
        expect(keys[0]?.language).toBe('en')
      }),
      { numRuns: 200 },
    )
  })

  it('activeCheckKeys forms und only from a non-empty language that maps to und', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ hobby: hobbyArb, language: languageArb.map((l) => l ?? null) }), { maxLength: 8 }), (rows) => {
        const keys = activeCheckKeys(rows)
        const undExpected = rows.some((r) => r.language !== null && r.language.trim() !== '' && languageCode(r.language) === 'und')
        if (!undExpected) expect(keys.some((k) => k.language === 'und')).toBe(false)
        for (const row of rows) {
          if (row.language === null || row.language.trim() === '') {
            // A row with a missing language contributes only its en key.
            expect(checkKeysForPath(row.hobby, row.language).map((k) => k.language)).toEqual(['en'])
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('the Fresh_Endpoint reads only en keys for a missing body or profile language', async () => {
    await fc.assert(
      fc.asyncProperty(bodyPathsArb, missingArb, fc.boolean(), async (rawPaths, language, signedIn) => {
        const paths = rawPaths.map((p, i) => {
          const skills = p.titles.map((title, j) => ({ id: `s${i}-${j}`, title, level: p.level }))
          return { id: `p${i}`, hobby: p.hobby, skills, currentSkillId: p.current === null ? null : skills[p.current % skills.length]!.id }
        })
        const h = createFreshEndpointHarness({
          users: { tok: { userId: 'u1', data: userData(language ?? '', paths.map((p) => userPath(p))) } },
        })
        const body: Record<string, unknown> = { paths }
        if (language !== undefined) body.language = language
        const result = await handleFreshRequest(
          { body, authorization: signedIn ? 'Bearer tok' : undefined, clientIp: '198.51.100.1' },
          h.deps,
        )
        expect(result.status).toBe(200)
        expect('language' in result.body && result.body.language).toBe('en')
        expect(h.reads).toHaveLength(1)
        for (const key of h.reads[0]!.checkKeys) expect(key.language).toBe('en')
        for (const key of h.reads[0]!.poolKeys) expect(poolKeyLanguage(key)).toBe('en')
      }),
      { numRuns: 150 },
    )
  })
})
