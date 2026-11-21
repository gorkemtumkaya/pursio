import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FinalProfile } from '../../shared/types/learner-profile'
import type { SkillTree } from '../../shared/types/skill-tree'
import { isPlainProfile, startLevelFor } from '../../shared/utils/learner-profile'
import { handleTreeRequest } from '../../server/utils/llm-handlers'
import { cacheKey } from '../../server/utils/tree-cache'
import { DEFAULTS, TOKEN, bearer, fakeTreeDeps, sampleTree } from '../support/tree-deps'
import { arbFinalProfile } from '../arbitraries'

const RUNS = { numRuns: 200 }
const HOBBY = 'Bouldering'

/** A tree that can only come from the cache. */
function cachedTree(): SkillTree {
  return { ...sampleTree(), mascot: { set: 'from-cache' } }
}

/** Plain profiles are rare in random data, so a third of the cases are made plain on purpose. */
const arbProfileOrNull: fc.Arbitrary<FinalProfile | null> = fc.oneof(
  fc.constant(null),
  arbFinalProfile,
  arbFinalProfile.map(profile => ({ ...profile, goal: null, avoid: [], taste: [], known: [] })),
)

function request(profile: FinalProfile | null) {
  const body = profile === null ? { hobby: HOBBY } : { hobby: HOBBY, profile }
  return { body: JSON.parse(JSON.stringify(body)) as unknown, headerKey: undefined, authorization: bearer(TOKEN) }
}

// Feature: path-intake, Property 8: Cache gate
// **Validates: Requirements 7.3, 7.4, 7.5, 16.10**
describe('Property 8: Cache gate', () => {
  it('reads and writes the cache exactly for a Plain_Profile or no profile, and saves the mapped level', async () => {
    await fc.assert(
      fc.asyncProperty(arbProfileOrNull, fc.boolean(), async (profile, seeded) => {
        const { deps, calls, cache } = fakeTreeDeps()
        const level = startLevelFor(profile?.level ?? null)
        const key = cacheKey(HOBBY, level, DEFAULTS.provider, DEFAULTS.model)
        if (seeded) cache.set(key, { tree: cachedTree(), model: 'cached-model' })

        const response = await handleTreeRequest(request(profile), deps)
        expect(response.status).toBe(200)
        const plain = isPlainProfile(profile)

        expect(calls.cacheGet).toEqual(plain ? [key] : [])
        if (plain && seeded) {
          // Served from the cache: no model call, no write.
          expect(calls.adapter).toHaveLength(0)
          expect(calls.cacheSet).toEqual([])
          expect('tree' in response.body && response.body.tree.mascot.set).toBe('from-cache')
        }
        else {
          // Generated: written to the cache only when plain; a seeded tree is never returned.
          expect(calls.adapter).toHaveLength(1)
          expect(calls.cacheSet).toEqual(plain ? [key] : [])
          expect('tree' in response.body && response.body.tree.mascot.set).not.toBe('from-cache')
        }
        expect(calls.save[0]?.input.level).toBe(level)
      }),
      RUNS,
    )
  })

  it('answers 400 for a profile that breaks a limit, with no cache read and no model call', async () => {
    const [profile] = fc.sample(arbFinalProfile, { numRuns: 1, seed: 3 })
    if (profile === undefined) throw new Error('no sample')
    const broken = [
      { ...profile, level: 'expert' },
      { ...profile, goalOptions: profile.goalOptions.slice(0, 1) },
      { ...profile, known: Array.from({ length: 7 }, (_, i) => ({ id: `k-${i}`, label: 'x' })) },
      { ...profile, goal: { id: 'not-listed', label: 'x', finishLine: 'y' } },
      'not an object',
    ]
    for (const bad of broken) {
      const { deps, calls } = fakeTreeDeps()
      const response = await handleTreeRequest(
        { body: { hobby: HOBBY, profile: bad }, headerKey: undefined, authorization: bearer(TOKEN) },
        deps,
      )
      expect(response).toEqual({ status: 400, body: { error: 'invalid_input' } })
      expect(calls.cacheGet).toEqual([])
      expect(calls.adapter).toEqual([])
    }
  })
})
