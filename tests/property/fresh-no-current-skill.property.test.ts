// Feature: fresh, Property 41: Paths with no Current_Skill
// For any response input where some paths have no Current_Skill, those paths have an empty
// Current_Window, contribute no pool key and no Best_Section or Hero_Card fallback video, still
// contribute their check keys, Channel_Sources and every Fresh_Item with a Path_Match to one of
// their Skills, and every such match has a Closeness_Factor of 0.6.
// Validates: Requirements 8.17, 9.3
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshResponseOk } from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { PoolVideo } from '../../shared/types/video'
import { closenessFactor } from '../../shared/utils/fresh-rank'
import { buildFreshView, type FilterChip } from '../../shared/utils/fresh-view'
import { normalizeText, poolKey } from '../../shared/utils/video-normalize'
import { handleFreshRequest } from '../../server/utils/fresh/handlers'
import { fakeFreshItem } from '../support/fresh-fakes'
import { createFreshEndpointHarness, userData, userPath } from '../support/fresh-route-fakes'

const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']
const HOBBIES = ['Bouldering', 'Yoga', 'Chess']

function poolVideo(id: string): PoolVideo {
  return {
    id,
    title: `Pool ${id}`,
    channel: 'Pool channel',
    channelId: `UCpool${id}`,
    thumbnailUrl: '',
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    teachesThisSkill: 0.9,
    levelFit: 0.8,
    style: 'technique',
    matchedQuestText: null,
  }
}

const pathsArb = fc
  .array(
    fc.record({
      skills: fc.integer({ min: 1, max: 4 }),
      level: fc.constantFrom(...LEVELS),
      current: fc.option(fc.nat(), { nil: null }),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((rows) =>
    rows.map((r, i) => {
      const skills = Array.from({ length: r.skills }, (_v, j) => ({ id: `s${i}-${j}`, title: `Skill ${i} ${j}`, level: r.level }))
      return { id: `p${i}`, hobby: HOBBIES[i]!, skills, currentSkillId: r.current === null ? null : skills[r.current % skills.length]!.id }
    }),
  )

describe('Property 41: Paths with no Current_Skill', () => {
  it('get no window and no pool videos but keep their keys, sources and items at closeness 0.6', async () => {
    await fc.assert(
      fc.asyncProperty(pathsArb, fc.boolean(), async (paths, signedIn) => {
        const h = createFreshEndpointHarness({ users: { tok: { userId: 'u1', data: userData('en', paths.map((p) => userPath(p))) } } })
        const now = h.clock.now()
        let n = 0
        // Pools for every Skill (stored first: the pool store refreshes the Channel_Sources).
        for (const p of paths) {
          for (const s of p.skills) {
            const pk = poolKey({ hobby: p.hobby, skillTitle: s.title, level: s.level, language: 'en' })
            await h.stores.pipeline.takeLease(pk, 'run')
            await h.stores.pipeline.storePool(pk, 'run', [poolVideo(`pv${String((n += 1)).padStart(9, '0')}`)])
          }
        }
        for (const p of paths) {
          const key = { hobby: normalizeText(p.hobby), language: 'en' }
          h.stores.fresh.setSources(key, [
            { channelId: `UCsrc${p.id}`, channelName: `Source ${p.id}`, qualifyingCount: 3, latestQualifyingMs: now - 1, lastCheckedMs: null },
          ])
          for (const s of p.skills) {
            h.stores.fresh.putItem(
              fakeFreshItem(`fi${String((n += 1)).padStart(9, '0')}`, {
                hobby: key.hobby,
                skillNorm: normalizeText(s.title),
                channelId: `UCitem${p.id}`,
                publishedMs: now - 3_600_000,
                foundMs: now - 3_600_000,
              }),
            )
          }
        }

        const result = await handleFreshRequest(
          { body: { language: 'en', paths }, authorization: signedIn ? 'Bearer tok' : undefined, clientIp: '198.51.100.7' },
          h.deps,
        )
        expect(result.status).toBe(200)
        const response = result.body as FreshResponseOk
        const read = h.reads[0]!
        const byId = new Map(response.paths.map((p) => [p.id, p]))

        for (const p of paths) {
          const hobby = normalizeText(p.hobby)
          const rp = byId.get(p.id)!
          // Check keys and Channel_Sources are always there.
          expect(read.checkKeys).toContainEqual({ hobby, language: 'en' })
          expect(response.sources.some((s) => s.hobby === hobby && s.channelId === `UCsrc${p.id}`)).toBe(true)
          // Every Skill's item is returned with a match on this path.
          const items = response.items.filter((i) => i.matches.some((m) => m.pathId === p.id))
          expect(items).toHaveLength(p.skills.length)
          if (p.currentSkillId !== null) continue
          expect(rp.windowSkillIds).toEqual([])
          expect(read.poolKeys.some((k) => (JSON.parse(k) as unknown[])[0] === hobby)).toBe(false)
          expect(response.pools.some((pool) => pool.pathId === p.id)).toBe(false)
          for (const item of items) {
            for (const m of item.matches.filter((x) => x.pathId === p.id)) expect(closenessFactor(m, rp)).toBe(0.6)
          }
          // No Best_Section or Hero_Card fallback video from this path, for any chip.
          const chips: FilterChip[] = [{ kind: 'all' }, { kind: 'path', pathId: p.id }, { kind: 'current' }]
          for (const chip of chips) {
            const view = buildFreshView({ response, chip, selectedPathId: p.id, mutes: new Map(), events: [], demo: false })
            expect(view.bestCards.some((b) => b.match.pathId === p.id)).toBe(false)
            expect(view.hero?.kind === 'pool' && view.hero.match.pathId === p.id).toBe(false)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
