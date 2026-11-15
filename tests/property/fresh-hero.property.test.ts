import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, FreshResponseOk, FreshSkillPool, PoolCard, SkillMatch } from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { GoalClass, VideoStyle } from '../../shared/types/video'
import { rankFreshItems } from '../../shared/utils/fresh-rank'
import { buildFreshView, type FilterChip } from '../../shared/utils/fresh-view'
const RUNS = { numRuns: 300 }
const NOW_MS = 1_800_000_000_000
const WEEK_MS = 604_800_000
const CHANNELS = ['UCa', 'UCb', 'UCc', 'UCd']
const arbGoal = fc.constantFrom<GoalClass>('targeted', 'casual', 'none')
const arbStyle = fc.constantFrom<VideoStyle>('drill', 'technique', 'explainer', 'approachable')
const arbLevel = fc.constantFrom<Level>('beginner', 'intermediate', 'advanced')
const arbChannelId = fc.option(fc.constantFrom(...CHANNELS), { nil: null, freq: 5 })
/** A path with 1 to 5 Skills with distinct titles; the Current_Skill is sometimes missing. */
function arbPath(index: number): fc.Arbitrary<FreshPath> {
  return fc
    .record({
      skillCount: fc.integer({ min: 1, max: 5 }),
      currentPick: fc.option(fc.nat(), { nil: null, freq: 4 }),
      windowExtra: fc.integer({ min: 0, max: 2 }),
      goalClass: arbGoal,
    })
    .map(({ skillCount, currentPick, windowExtra, goalClass }) => {
      const id = `path-${index}`
      const skills = Array.from({ length: skillCount }, (_, i) => ({
        id: `${id}-s${i}`,
        title: `Title ${index}.${i}`,
        level: 'beginner' as Level,
      }))
      const currentIndex = currentPick === null ? null : currentPick % skillCount
      return {
        id,
        hobbyId: null,
        hobby: `hobby ${index}`,
        goalClass,
        currentSkillId: currentIndex === null ? null : skills[currentIndex]!.id,
        windowSkillIds:
          currentIndex === null ? [] : skills.slice(currentIndex, currentIndex + 1 + windowExtra).map((s) => s.id),
        skills,
        activeAt: null,
      }
    })
}
const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(i))))
function allMatches(paths: readonly FreshPath[]): SkillMatch[] {
  return paths.flatMap((p) => p.skills.map((s) => ({ pathId: p.id, skillId: s.id })))
}
// Around the 7-day edge on purpose: exactly 7 days old is out, 1 ms younger is in.
const arbPublished = fc.oneof(
  fc.constantFrom(NOW_MS, NOW_MS - WEEK_MS, NOW_MS - WEEK_MS + 1, NOW_MS - WEEK_MS - 1, NOW_MS + 60_000),
  fc.integer({ min: NOW_MS - 2 * WEEK_MS, max: NOW_MS + 3_600_000 }),
)
const arbFactor = fc.oneof(fc.constantFrom(0, 0.5, 1), fc.double({ min: 0, max: 1, noNaN: true }))
function arbItems(paths: readonly FreshPath[]): fc.Arbitrary<FreshItemCard[]> {
  const pairs = allMatches(paths)
  return fc
    .uniqueArray(
      fc.record({
        n: fc.nat({ max: 40 }),
        channelId: arbChannelId,
        publishedMs: arbPublished,
        teachesThisSkill: arbFactor,
        levelFit: arbFactor,
        style: arbStyle,
        level: arbLevel,
        durationSeconds: fc.constantFrom(300, 900, 1800),
        matches: fc.uniqueArray(fc.constantFrom(...pairs), {
          minLength: 1,
          maxLength: 3,
          selector: (m) => `${m.pathId}|${m.skillId}`,
        }),
      }),
      { maxLength: 20, selector: (r) => r.n },
    )
    .map((rows) =>
      rows.map(
        (r): FreshItemCard => ({
          kind: 'fresh',
          videoId: `f${r.n}`,
          title: `fresh ${r.n}`,
          channel: r.channelId ?? 'none',
          channelId: r.channelId,
          thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
          durationSeconds: r.durationSeconds,
          style: r.style,
          poolLanguage: 'en',
          matches: r.matches,
          why: 'why',
          publishedMs: r.publishedMs,
          teachesThisSkill: r.teachesThisSkill,
          levelFit: r.levelFit,
          level: r.level,
        }),
      ),
    )
}
/** One ranked pool per (path, skill) for a random subset of Skills, ids unique over all pools. */
function arbPools(paths: readonly FreshPath[]): fc.Arbitrary<FreshSkillPool[]> {
  const pairs = allMatches(paths)
  return fc
    .tuple(
      ...pairs.map(() =>
        fc.option(fc.array(fc.record({ channelId: arbChannelId, style: arbStyle }), { minLength: 0, maxLength: 4 }), {
          nil: null,
          freq: 4,
        }),
      ),
    )
    .map((perPair) => {
      const pools: FreshSkillPool[] = []
      perPair.forEach((videos, i) => {
        if (videos === null) return
        const m = pairs[i]!
        pools.push({
          pathId: m.pathId,
          skillId: m.skillId,
          videos: videos.map(
            (v, j): PoolCard => ({
              kind: 'pool',
              videoId: `p-${m.skillId}-${j}`,
              title: `pool ${m.skillId} ${j}`,
              channel: v.channelId ?? 'none',
              channelId: v.channelId,
              thumbnailUrl: 'https://i.ytimg.com/vi/y/hqdefault.jpg',
              durationSeconds: 600,
              style: v.style,
              poolLanguage: 'en',
              matches: [m],
            }),
          ),
        })
      })
      return pools
    })
}
const arbMutes: fc.Arbitrary<Map<string, boolean>> = fc
  .array(fc.tuple(fc.constantFrom(...CHANNELS), fc.boolean()), { maxLength: 4 })
  .map((entries) => new Map(entries))
function arbChip(paths: readonly FreshPath[]): fc.Arbitrary<FilterChip> {
  return fc.oneof(
    fc.constant<FilterChip>({ kind: 'current' }),
    fc.constant<FilterChip>({ kind: 'all' }),
    fc.constant<FilterChip>({ kind: 'saved' }),
    fc.constantFrom(...paths.map((p) => p.id), 'path-gone').map((pathId): FilterChip => ({ kind: 'path', pathId })),
  )
}
const arbScenario = arbPaths.chain((paths) =>
  fc.record({
    paths: fc.constant(paths),
    items: arbItems(paths),
    pools: arbPools(paths),
    mutes: arbMutes,
    chip: arbChip(paths),
    // Stored Selected_Path: missing, a known path, or a path that is gone.
    selectedPathId: fc.constantFrom<string | null>(null, 'path-gone', ...paths.map((p) => p.id)),
  }),
)
function makeResponse(paths: FreshPath[], items: FreshItemCard[], pools: FreshSkillPool[]): FreshResponseOk {
  return { nowMs: NOW_MS, language: 'en', paths, items, pools, sources: [], checkTimes: [], mutes: [], events: [] }
}
const muted = (mutes: ReadonlyMap<string, boolean>, ch: string | null): boolean => ch !== null && mutes.get(ch) === true
/** Independent oracle for Property 30 (Req 12.1 to 12.4, 12.7). */
function expectedHero(
  s: { paths: FreshPath[]; items: FreshItemCard[]; pools: FreshSkillPool[]; mutes: Map<string, boolean>; chip: FilterChip; selectedPathId: string | null },
): { videoId: string; label: string; kind: 'fresh' | 'pool' } | null {
  // Req 12.4, 14.9: a missing or gone Selected_Path falls back to the first path.
  const selected = s.paths.find((p) => p.id === s.selectedPathId) ?? s.paths[0]!
  // Hidden or unknown chips are not selectable; the page shows "All skills" instead.
  let chip = s.chip
  if (chip.kind === 'current' && selected.currentSkillId === null) chip = { kind: 'all' }
  if (chip.kind === 'path' && !s.paths.some((p) => p.id === (chip as { pathId: string }).pathId)) chip = { kind: 'all' }
  // Req 12.7: hidden for "Saved".
  if (chip.kind === 'saved') return null
  // Req 14.3 to 14.5: Skills shown under the chip.
  const inScope = (m: SkillMatch): boolean => {
    if (chip.kind === 'current') return m.pathId === selected.id && m.skillId === selected.currentSkillId
    if (chip.kind === 'path') return m.pathId === chip.pathId
    return true
  }
  // Req 12.1: in scope, published less than 7 days before the response, channel not muted.
  const eligible = s.items
    .filter((it) => !muted(s.mutes, it.channelId) && NOW_MS - it.publishedMs < WEEK_MS && it.matches.some(inScope))
    .map((it) => ({ ...it, matches: it.matches.filter(inScope) }))
  const ranked = rankFreshItems(eligible, {
    nowMs: NOW_MS,
    paths: new Map(s.paths.map((p) => [p.id, p])),
    selectedPathId: selected.id,
    taste: new Map(),
  })
  const first = ranked[0]
  if (first) {
    const path = s.paths.find((p) => p.id === first.match.pathId)!
    const title = path.skills.find((sk) => sk.id === first.match.skillId)!.title
    return { videoId: first.item.videoId, label: `New for ${title}`, kind: 'fresh' }
  }
  // Req 12.3: Hero_Path is the chip's path for a path chip, else the Selected_Path.
  const heroPath = chip.kind === 'path' ? s.paths.find((p) => p.id === chip.pathId)! : selected
  if (heroPath.currentSkillId === null) return null
  // Req 12.2: first non-muted pool video of the Hero_Path's Current_Skill.
  const pool = s.pools.find((p) => p.pathId === heroPath.id && p.skillId === heroPath.currentSkillId)
  const video = pool?.videos.find((v) => !muted(s.mutes, v.channelId))
  return video ? { videoId: video.videoId, label: 'Best for your current skill', kind: 'pool' } : null
}
describe('Feature: fresh, Property 30: Hero choice', () => {
  /** **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7** */
  it('picks the first eligible Fresh_Item, else the Hero_Path Current_Skill pool video, else nothing', () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const view = buildFreshView({
          response: makeResponse(s.paths, s.items, s.pools),
          chip: s.chip,
          selectedPathId: s.selectedPathId,
          mutes: s.mutes,
          events: [],
          demo: false,
        })
        const expected = expectedHero(s)
        if (expected === null) {
          expect(view.hero).toBeNull()
          return
        }
        expect(view.hero).not.toBeNull()
        const hero = view.hero!
        expect(hero.kind).toBe(expected.kind)
        expect(hero.card.videoId).toBe(expected.videoId)
        expect(hero.label).toBe(expected.label)
        // The hero is never from a muted channel (Req 12.1, 12.2).
        expect(muted(s.mutes, hero.card.channelId)).toBe(false)
        if (hero.kind === 'fresh') {
          expect(NOW_MS - hero.card.publishedMs).toBeLessThan(WEEK_MS)
          expect(hero.label).toBe(`New for ${hero.skillTitle}`)
        }
      }),
      RUNS,
    )
  })
  it('hides the Hero_Card when "Saved" is selected, whatever the content', () => {
    fc.assert(
      fc.property(arbScenario, (s) => {
        const view = buildFreshView({
          response: makeResponse(s.paths, s.items, s.pools),
          chip: { kind: 'saved' },
          selectedPathId: s.selectedPathId,
          mutes: s.mutes,
          events: [],
          demo: false,
        })
        expect(view.chip.kind).toBe('saved')
        expect(view.hero).toBeNull()
      }),
      RUNS,
    )
  })
  it('falls back to the first response path when no Selected_Path is stored', () => {
    // No Fresh_Items, so the hero comes from the pool of the first path's Current_Skill.
    const paths: FreshPath[] = ['a', 'b'].map((id) => ({
      id,
      hobbyId: null,
      hobby: id,
      goalClass: 'none',
      currentSkillId: `${id}-s0`,
      windowSkillIds: [`${id}-s0`],
      skills: [{ id: `${id}-s0`, title: `T ${id}`, level: 'beginner' }],
      activeAt: null,
    }))
    const pools: FreshSkillPool[] = paths.map((p) => ({
      pathId: p.id,
      skillId: p.currentSkillId!,
      videos: [
        { kind: 'pool', videoId: `v-${p.id}`, title: 't', channel: 'c', channelId: null, thumbnailUrl: '', durationSeconds: 60, style: 'drill', poolLanguage: 'en', matches: [] },
      ],
    }))
    const view = buildFreshView({
      response: makeResponse(paths, [], pools),
      chip: { kind: 'all' },
      selectedPathId: null,
      mutes: new Map(),
      events: [],
      demo: false,
    })
    expect(view.hero?.kind).toBe('pool')
    expect(view.hero?.card.videoId).toBe('v-a')
    expect(view.hero?.label).toBe('Best for your current skill')
  })
})
