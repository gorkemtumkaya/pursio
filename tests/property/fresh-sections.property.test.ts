// Feature: fresh, Property 28: Hero, New and Best dedupe and caps
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type {
  FreshItemCard,
  FreshPath,
  FreshResponseOk,
  FreshSkillPool,
  PoolCard,
  SkillMatch,
} from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { VideoEvent, VideoStyle } from '../../shared/types/video'
import { arrangeVariety, BEST_MAX, FRESH_WINDOW_S, MAX_PER_SKILL, NEW_MAX } from '../../shared/utils/fresh-rank'
import { buildFreshView, type FilterChip, type FreshView } from '../../shared/utils/fresh-view'

const RUNS = { numRuns: 300 }
const NOW = 1_800_000_000_000
const DAY = 86_400_000

// Small pools so ids, channels and Skills collide often.
const CHANNELS = ['UC_a', 'UC_b', 'UC_c', 'UC_d', 'UC_e', 'UC_f'] as const
const SKILL_IDS = ['s0', 's1', 's2', 's3', 's4'] as const
const PATH_IDS = ['p0', 'p1', 'p2'] as const
const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']
const STYLES: VideoStyle[] = ['drill', 'technique', 'explainer', 'approachable']
const videoIds = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i}`)
/** Shared by items and pools, so a pool video can also be a Fresh_Item. */
const SHARED_VIDEOS = videoIds('v', 60)

const arbChannelId = fc.option(fc.constantFrom(...CHANNELS), { nil: null, freq: 6 })

/** One path: Skills from a shared id set, a window with the Current_Skill first. */
const arbPath = (id: string): fc.Arbitrary<FreshPath> =>
  fc
    .record({
      skillCount: fc.integer({ min: 1, max: SKILL_IDS.length }),
      currentIndex: fc.option(fc.nat(), { nil: null }),
      extra: fc.integer({ min: 0, max: 2 }),
      activeAt: fc.option(fc.constantFrom(NOW - 3 * DAY, NOW - DAY, NOW - 2 * DAY, NOW - DAY), { nil: null }),
      hobby: fc.constantFrom('Bouldering', 'Film photography', 'Guitar'),
    })
    .map(({ skillCount, currentIndex, extra, activeAt, hobby }) => {
      const ids = SKILL_IDS.slice(0, skillCount)
      const cur = currentIndex === null ? null : currentIndex % skillCount
      const window = cur === null ? [] : ids.slice(cur, cur + 1 + extra)
      return {
        id,
        hobbyId: null,
        hobby,
        goalClass: 'none' as const,
        currentSkillId: cur === null ? null : ids[cur]!,
        windowSkillIds: [...window],
        skills: ids.map((s, i) => ({ id: s, title: `${id} skill ${i}`, level: LEVELS[i % 3]! })),
        activeAt,
      }
    })

const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 0, max: PATH_IDS.length })
  .chain((n) => (n === 0 ? fc.constant([]) : fc.tuple(...PATH_IDS.slice(0, n).map(arbPath))))

/** A match on any known path id (or an unknown one) and any Skill id (some not on the path). */
const arbMatch: fc.Arbitrary<SkillMatch> = fc.record({
  pathId: fc.constantFrom(...PATH_IDS, 'p_unknown'),
  skillId: fc.constantFrom(...SKILL_IDS),
})

const arbItem = (ids: readonly string[]): fc.Arbitrary<FreshItemCard> =>
  fc.record({
    kind: fc.constant('fresh' as const),
    videoId: fc.constantFrom(...ids),
    title: fc.constant('t'),
    channel: fc.constant('c'),
    channelId: arbChannelId,
    thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
    durationSeconds: fc.integer({ min: 0, max: 3600 }),
    style: fc.constantFrom(...STYLES),
    poolLanguage: fc.constant('en'),
    matches: fc.array(arbMatch, { minLength: 1, maxLength: 3 }),
    why: fc.constant('why'),
    // Around the 7-day bound, including exactly on it and in the future.
    publishedMs: fc.oneof(
      fc.integer({ min: NOW - 8 * DAY, max: NOW + DAY }),
      fc.constantFrom(NOW - FRESH_WINDOW_S * 1000, NOW - FRESH_WINDOW_S * 1000 + 1, NOW),
    ),
    teachesThisSkill: fc.double({ min: 0, max: 1, noNaN: true }),
    levelFit: fc.double({ min: 0, max: 1, noNaN: true }),
    level: fc.constantFrom(...LEVELS),
  })

const arbPoolCard = (ids: readonly string[]): fc.Arbitrary<PoolCard> =>
  fc.record({
    kind: fc.constant('pool' as const),
    videoId: fc.constantFrom(...ids),
    title: fc.constant('t'),
    channel: fc.constant('c'),
    channelId: arbChannelId,
    thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
    durationSeconds: fc.integer({ min: 0, max: 3600 }),
    style: fc.constantFrom(...STYLES),
    poolLanguage: fc.constant('en'),
    matches: fc.constant([]),
  })

/** Pools for any (path, Skill) pair, window or not, with duplicates inside and across pools. */
const arbPool = (ids: readonly string[]): fc.Arbitrary<FreshSkillPool> =>
  fc.record({
    pathId: fc.constantFrom(...PATH_IDS, 'p_unknown'),
    skillId: fc.constantFrom(...SKILL_IDS),
    videos: fc.array(arbPoolCard(ids), { maxLength: 8 }),
  })

const arbMutes: fc.Arbitrary<Map<string, boolean>> = fc
  .array(fc.tuple(fc.constantFrom(...CHANNELS), fc.boolean()), { maxLength: CHANNELS.length })
  .map((pairs) => new Map(pairs))

const arbEvent = (ids: readonly string[]): fc.Arbitrary<VideoEvent> =>
  fc.record({
    videoId: fc.constantFrom(...ids),
    source: fc.constantFrom('skill_sheet' as const, 'feed' as const),
    playedAt: fc.constant(null),
    watchedSeconds: fc.integer({ min: 0, max: 600 }),
    finished: fc.boolean(),
    saved: fc.constant(false),
    savedAt: fc.constant(null),
    skipped: fc.boolean(),
    snapshot: fc.constant(null),
    snapshotAt: fc.constant(null),
    updatedAt: fc.integer({ min: 0, max: NOW }),
  })

const arbChip: fc.Arbitrary<FilterChip> = fc.oneof(
  fc.constant({ kind: 'current' as const }),
  fc.constant({ kind: 'all' as const }),
  fc.constant({ kind: 'saved' as const }),
  fc.constantFrom(...PATH_IDS, 'p_unknown').map((pathId) => ({ kind: 'path' as const, pathId })),
)

/** Recent items matching p0/s0 (every p0 has s0), so the New cap of 24 is reached often. */
const arbDenseItems = (ids: readonly string[]): fc.Arbitrary<FreshItemCard[]> =>
  fc.uniqueArray(
    fc.tuple(arbItem(ids), arbMatch, fc.integer({ min: NOW - 6 * DAY, max: NOW })).map(([item, m, publishedMs]) => ({
      ...item,
      publishedMs,
      matches: [{ pathId: 'p0', skillId: 's0' }, m],
    })),
    { minLength: 26, maxLength: 50, selector: (i) => i.videoId },
  )

/** One pool for every (path, Skill) pair, so long windows can fill the Best cap of 12. */
const arbPoolGrid = (ids: readonly string[]): fc.Arbitrary<FreshSkillPool[]> =>
  fc.tuple(
    ...PATH_IDS.flatMap((pathId) =>
      SKILL_IDS.map((skillId) =>
        fc.array(arbPoolCard(ids), { minLength: 2, maxLength: 8 }).map((videos) => ({ pathId, skillId, videos })),
      ),
    ),
  )

const arbResponse = (itemIds: readonly string[], poolIds: readonly string[]): fc.Arbitrary<FreshResponseOk> =>
  fc.record({
    nowMs: fc.constant(NOW),
    language: fc.constant('en'),
    paths: arbPaths,
    items: fc.oneof(fc.array(arbItem(itemIds), { maxLength: 50 }), arbDenseItems(itemIds)),
    pools: fc.oneof(fc.array(arbPool(poolIds), { maxLength: 10 }), arbPoolGrid(poolIds)),
    sources: fc.constant([]),
    checkTimes: fc.constant([]),
    mutes: fc.constant([]),
    events: fc.constant([]),
  })

const arbInput = fc.record({
  response: arbResponse(SHARED_VIDEOS, SHARED_VIDEOS),
  chip: arbChip,
  selectedPathId: fc.option(fc.constantFrom(...PATH_IDS, 'p_unknown'), { nil: null }),
  mutes: arbMutes,
  events: fc.array(arbEvent(SHARED_VIDEOS), { maxLength: 30 }),
  demo: fc.boolean(),
})

const isMuted = (mutes: ReadonlyMap<string, boolean>, c: string | null): boolean => c !== null && mutes.get(c) === true

/** Independent model of the Req 9.11 path and Skill order for the chip the view resolved to. */
function bestScope(response: FreshResponseOk, chip: FilterChip, selectedPathId: string | null): { path: FreshPath; skillIds: string[] }[] {
  const paths = response.paths
  const selected = paths.find((p) => p.id === selectedPathId) ?? paths[0]
  if (!selected) return []
  if (chip.kind === 'saved') return []
  if (chip.kind === 'current') {
    return selected.currentSkillId === null ? [] : [{ path: selected, skillIds: [selected.currentSkillId] }]
  }
  const others = paths
    .filter((p) => p.id !== selected.id)
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      const ta = a.p.activeAt ?? Number.NEGATIVE_INFINITY
      const tb = b.p.activeAt ?? Number.NEGATIVE_INFINITY
      return ta !== tb ? tb - ta : a.index - b.index
    })
    .map(({ p }) => p)
  const ordered = [selected, ...others].filter((p) => chip.kind === 'all' || p.id === chip.pathId)
  return ordered.map((path) => ({ path, skillIds: [...path.windowSkillIds] }))
}

const skillKey = (m: SkillMatch): string => `${m.pathId}\u0000${m.skillId}`

/** Cards per Skill on the page: Hero_Card, New_Section and Best_Section together. */
function perSkillCounts(view: FreshView): Map<string, number> {
  const counts = new Map<string, number>()
  const add = (m: SkillMatch): void => {
    counts.set(skillKey(m), (counts.get(skillKey(m)) ?? 0) + 1)
  }
  if (view.hero) add(view.hero.match)
  for (const c of view.newCards) add(c.match)
  for (const c of view.bestCards) add(c.match)
  return counts
}

/**
 * Req 9.11, 9.12, 13.5: the Best_Section before the variety step. `used` holds the cards the
 * Hero_Card and New_Section already gave each Skill; under a capped chip a Skill stops at
 * MAX_PER_SKILL (decision D17).
 */
function expectedBest(
  response: FreshResponseOk,
  chip: FilterChip,
  selectedPathId: string | null,
  mutes: ReadonlyMap<string, boolean>,
  excluded: ReadonlySet<string>,
  used: ReadonlyMap<string, number>,
): { videoId: string; pathId: string; skillId: string }[] {
  const out: { videoId: string; pathId: string; skillId: string }[] = []
  const seen = new Set(excluded)
  const counts = new Map(used)
  const capped = chip.kind !== 'current'
  for (const { path, skillIds } of bestScope(response, chip, selectedPathId)) {
    for (const skillId of skillIds) {
      const key = skillKey({ pathId: path.id, skillId })
      const pool = response.pools.find((p) => p.pathId === path.id && p.skillId === skillId)
      for (const v of pool?.videos ?? []) {
        if (capped && (counts.get(key) ?? 0) >= MAX_PER_SKILL) break
        if (seen.has(v.videoId) || isMuted(mutes, v.channelId)) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
        seen.add(v.videoId)
        out.push({ videoId: v.videoId, pathId: path.id, skillId })
      }
    }
  }
  return out.slice(0, BEST_MAX)
}

/** Distinct in-scope, non-muted Fresh_Item ids within 7 days (Req 13.1 candidates). */
function newCandidateCount(response: FreshResponseOk, chip: FilterChip, selectedPathId: string | null, mutes: ReadonlyMap<string, boolean>): number {
  const paths = response.paths
  const selected = paths.find((p) => p.id === selectedPathId) ?? paths[0]
  if (!selected || chip.kind === 'saved') return 0
  const inScope = (m: SkillMatch): boolean => {
    if (chip.kind === 'current') return m.pathId === selected.id && m.skillId === selected.currentSkillId
    const path = paths.find((p) => p.id === m.pathId)
    if (!path || (chip.kind === 'path' && path.id !== chip.pathId)) return false
    return path.skills.some((s) => s.id === m.skillId)
  }
  const ids = new Set<string>()
  for (const item of response.items) {
    if (isMuted(mutes, item.channelId)) continue
    if (!(item.publishedMs > NOW - FRESH_WINDOW_S * 1000)) continue
    if (item.matches.some(inScope)) ids.add(item.videoId)
  }
  return ids.size
}

const newIds = (view: FreshView): string[] => view.newCards.map((c) => c.card.videoId)
const bestIds = (view: FreshView): string[] => view.bestCards.map((c) => c.card.videoId)

describe('Feature: fresh, Property 28: Hero, New and Best dedupe and caps', () => {
  it('uses the spec caps', () => {
    expect(NEW_MAX).toBe(24)
    expect(BEST_MAX).toBe(12)
    expect(MAX_PER_SKILL).toBe(3)
  })

  /** **Validates: Requirements 9.11, 9.12, 9.16, 12.9, 13.1, 13.5** */
  it('keeps the hero out of both sections, dedupes, caps and orders the Best_Section', () => {
    fc.assert(
      fc.property(arbInput, (input) => {
        const view = buildFreshView(input)
        const heroId = view.hero?.card.videoId ?? null
        const fresh = newIds(view)
        const best = bestIds(view)

        // Req 12.9: the hero id is in no section.
        if (heroId !== null) {
          expect(fresh).not.toContain(heroId)
          expect(best).not.toContain(heroId)
        }
        // Req 13.1, 13.5, 9.12: each id at most once per section, no Best id in New.
        expect(new Set(fresh).size).toBe(fresh.length)
        expect(new Set(best).size).toBe(best.length)
        for (const id of best) expect(fresh).not.toContain(id)
        // Caps (decision D4).
        expect(fresh.length).toBeLessThanOrEqual(NEW_MAX)
        expect(best.length).toBeLessThanOrEqual(BEST_MAX)

        // Req 13.1: New stops at 24 only when there are more candidates. Under a capped chip the
        // Skill cap (decision D17) can leave candidates out, so only the upper bound holds there.
        const candidates = newCandidateCount(input.response, view.chip, input.selectedPathId, input.mutes)
        const heroIsFresh = view.hero?.kind === 'fresh' ? 1 : 0
        const uncappedNew = Math.min(NEW_MAX, Math.max(0, candidates - heroIsFresh))
        if (view.chip.kind === 'current') expect(fresh.length).toBe(uncappedNew)
        else expect(fresh.length).toBeLessThanOrEqual(uncappedNew)

        // Decision D17: at most MAX_PER_SKILL cards per Skill on the page, except under "For <current skill>".
        if (view.chip.kind !== 'current') {
          for (const n of perSkillCounts(view).values()) expect(n).toBeLessThanOrEqual(MAX_PER_SKILL)
        }

        // Req 9.11, 9.12, 13.5: Best is the model list, first 12, rearranged only by the variety step.
        const excluded = new Set(fresh)
        if (heroId !== null) excluded.add(heroId)
        const used = new Map<string, number>()
        for (const m of [...(view.hero ? [view.hero.match] : []), ...view.newCards.map((c) => c.match)]) {
          used.set(skillKey(m), (used.get(skillKey(m)) ?? 0) + 1)
        }
        const model = expectedBest(input.response, view.chip, input.selectedPathId, input.mutes, excluded, used)
        const shown = view.bestCards.map((c) => ({ videoId: c.card.videoId, pathId: c.match.pathId, skillId: c.match.skillId }))
        expect([...shown].sort((a, b) => (a.videoId < b.videoId ? -1 : 1))).toEqual(
          [...model].sort((a, b) => (a.videoId < b.videoId ? -1 : 1)),
        )
        const channelOf = new Map<string, string | null>()
        for (const c of view.bestCards) channelOf.set(c.card.videoId, c.card.channelId)
        const arranged = arrangeVariety(model, (m) => channelOf.get(m.videoId) ?? null).cards
        expect(shown).toEqual(arranged)
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.9** (deferred from task 3.4): no taste value changes the Best_Section, except through the Skill cap. */
  it('keeps the Best_Section order whatever the taste-relevant Video_Events are', () => {
    // Pool ids disjoint from item ids, so taste can change New and the hero but not which pool ids Best excludes.
    const itemIds = videoIds('f', 30)
    const poolIds = videoIds('b', 30)
    const allIds = [...itemIds, ...poolIds]
    fc.assert(
      fc.property(
        arbResponse(itemIds, poolIds),
        arbChip.filter((c) => c.kind !== 'saved'),
        fc.option(fc.constantFrom(...PATH_IDS), { nil: null }),
        arbMutes,
        // At or above the 10-record threshold, with many finishes and feed skips.
        fc.array(arbEvent(allIds), { minLength: 10, maxLength: 30 }),
        fc.array(arbEvent(allIds), { minLength: 0, maxLength: 30 }),
        (response, chip, selectedPathId, mutes, eventsA, eventsB) => {
          const base = { response, chip, selectedPathId, mutes, demo: false }
          const a = buildFreshView({ ...base, events: eventsA })
          const b = buildFreshView({ ...base, events: eventsB })
          const none = buildFreshView({ ...base, events: [] })
          // Taste reaches the Best_Section only through the Skill cap (decision D17): the Hero_Card and
          // New_Section use a Skill's slots first. With the same slots used, Best is the same.
          const slotsBeforeBest = (v: FreshView): string =>
            JSON.stringify([...(v.hero ? [v.hero.match] : []), ...v.newCards.map((c) => c.match)].map(skillKey).sort())
          for (const view of [a, b]) {
            if (view.chip.kind === 'current' || slotsBeforeBest(view) === slotsBeforeBest(none)) {
              expect(bestIds(view)).toEqual(bestIds(none))
            }
          }
        },
      ),
      RUNS,
    )
  })
})
