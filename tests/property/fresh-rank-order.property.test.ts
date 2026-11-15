import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, RankContext, RankedFreshItem, SkillMatch } from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { GoalClass, VideoStyle } from '../../shared/types/video'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { rankFreshItems } from '../../shared/utils/fresh-rank'
import { goalAdjustment } from '../../shared/utils/video-ranking'

const RUNS = { numRuns: 200 }
const NOW_MS = 1_800_000_000_000
const WEEK_MS = 604_800_000

const arbGoal = fc.constantFrom<GoalClass>('targeted', 'casual', 'none')
const arbStyle = fc.constantFrom<VideoStyle>('drill', 'technique', 'explainer', 'approachable')
const arbLevel = fc.constantFrom<Level>('beginner', 'intermediate', 'advanced')

/** A path with 1 to 6 Skills; Current_Window is the Current_Skill and up to 2 later Skills. */
function arbPath(index: number): fc.Arbitrary<FreshPath> {
  return fc
    .record({
      skillCount: fc.integer({ min: 1, max: 6 }),
      currentPick: fc.option(fc.nat(), { nil: null, freq: 4 }),
      windowExtra: fc.integer({ min: 0, max: 2 }),
      goalClass: arbGoal,
    })
    .map(({ skillCount, currentPick, windowExtra, goalClass }) => {
      const id = `path-${index}`
      const skills = Array.from({ length: skillCount }, (_, i) => ({
        id: `${id}-s${i}`,
        title: `Skill ${i}`,
        level: 'beginner' as Level,
      }))
      const currentIndex = currentPick === null ? null : currentPick % skillCount
      const windowSkillIds =
        currentIndex === null
          ? []
          : skills.slice(currentIndex, currentIndex + 1 + windowExtra).map((s) => s.id)
      return {
        id,
        hobbyId: null,
        hobby: `hobby ${index}`,
        goalClass,
        currentSkillId: currentIndex === null ? null : skills[currentIndex]!.id,
        windowSkillIds,
        skills,
        activeAt: null,
      }
    })
}

const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(i))))

/** Every (pathId, skillId) pair of the paths. */
function allMatches(paths: readonly FreshPath[]): SkillMatch[] {
  return paths.flatMap((p) => p.skills.map((s) => ({ pathId: p.id, skillId: s.id })))
}

// Few distinct values so score and published-time ties occur.
const arbFactor = fc.oneof(fc.constantFrom(0, 0.5, 0.8, 1), fc.double({ min: 0, max: 1, noNaN: true }))
const arbPublished = fc.oneof(
  fc.constantFrom(NOW_MS, NOW_MS - 3_600_000, NOW_MS - WEEK_MS + 1, NOW_MS + 60_000),
  fc.integer({ min: NOW_MS - WEEK_MS + 1, max: NOW_MS + 3_600_000 }),
)
const CHANNELS = ['UCa', 'UCb', 'UCc', 'UCd']
const arbChannelId = fc.option(fc.constantFrom(...CHANNELS), { nil: null, freq: 4 })
// Ids that differ in code point order vs UTF-16 order, plus plain ids.
const arbVideoId = fc.oneof(
  fc.constantFrom('a', 'B', 'b', 'é', '\u{1F600}', '\uFFFF', 'vid00000001'),
  fc.string({ minLength: 1, maxLength: 11 }),
)

interface ItemFields {
  channelId: string | null
  publishedMs: number
  teachesThisSkill: number
  levelFit: number
  style: VideoStyle
  durationSeconds: number
  level: Level
}

const arbItemFields: fc.Arbitrary<ItemFields> = fc.record({
  channelId: arbChannelId,
  publishedMs: arbPublished,
  teachesThisSkill: arbFactor,
  levelFit: arbFactor,
  style: arbStyle,
  durationSeconds: fc.constantFrom(300, 900, 901, 1800),
  level: arbLevel,
})

function makeItem(videoId: string, fields: ItemFields, matches: SkillMatch[]): FreshItemCard {
  return {
    kind: 'fresh',
    videoId,
    title: `t ${videoId}`,
    channel: fields.channelId ?? 'none',
    channelId: fields.channelId,
    thumbnailUrl: 'https://i.ytimg.com/vi/x/hqdefault.jpg',
    durationSeconds: fields.durationSeconds,
    style: fields.style,
    poolLanguage: 'en',
    matches,
    why: 'why',
    publishedMs: fields.publishedMs,
    teachesThisSkill: fields.teachesThisSkill,
    levelFit: fields.levelFit,
    level: fields.level,
  }
}

function arbItems(paths: readonly FreshPath[]): fc.Arbitrary<FreshItemCard[]> {
  const pairs = allMatches(paths)
  return fc
    .uniqueArray(
      fc.record({
        videoId: arbVideoId,
        fields: arbItemFields,
        matches: fc.uniqueArray(fc.constantFrom(...pairs), {
          minLength: 1,
          maxLength: 3,
          selector: (m) => `${m.pathId}|${m.skillId}`,
        }),
      }),
      { maxLength: 50, selector: (r) => r.videoId },
    )
    .map((rows) => rows.map((r) => makeItem(r.videoId, r.fields, r.matches)))
}

const arbTaste: fc.Arbitrary<Map<string, number>> = fc
  .array(fc.tuple(fc.constantFrom(...CHANNELS), fc.constantFrom(-0.2, -0.1, 0.1, 0.2)), { maxLength: 4 })
  .map((entries) => new Map(entries))

function makeCtx(paths: readonly FreshPath[], selectedIndex: number, taste: Map<string, number>): RankContext {
  return {
    nowMs: NOW_MS,
    paths: new Map(paths.map((p) => [p.id, p])),
    selectedPathId: paths[selectedIndex % paths.length]!.id,
    taste,
  }
}

/** Independent oracle for the Closeness_Factor against the match's own path (Req 9.3). */
function expectedCloseness(match: SkillMatch, paths: ReadonlyMap<string, FreshPath>): number {
  const path = paths.get(match.pathId)!
  if (path.currentSkillId !== null && match.skillId === path.currentSkillId) return 1.0
  if (path.windowSkillIds.includes(match.skillId)) return 0.8
  return 0.6
}

/** Independent oracle for the Fresh_Score (Req 9.1, 9.2). */
function expectedScore(r: RankedFreshItem, ctx: RankContext): number {
  const age = Math.max(0, (ctx.nowMs - r.item.publishedMs) / 1000)
  const recency = 1 - 0.5 * (age / 604800)
  const goal = ctx.paths.get(r.match.pathId)!.goalClass
  const taste = r.item.channelId === null ? 0 : (ctx.taste.get(r.item.channelId) ?? 0)
  return recency * r.item.teachesThisSkill * r.item.levelFit * r.closeness + goalAdjustment(r.item, goal) + taste
}

function inOrder(a: RankedFreshItem, b: RankedFreshItem): boolean {
  if (a.score !== b.score) return a.score > b.score
  if (a.item.publishedMs !== b.item.publishedMs) return a.item.publishedMs > b.item.publishedMs
  return compareCodePoints(a.item.videoId, b.item.videoId) < 0
}

const arbScenario = arbPaths.chain((paths) =>
  fc.record({
    paths: fc.constant(paths),
    items: arbItems(paths),
    selectedIndex: fc.nat({ max: 2 }),
    taste: arbTaste,
    seed: fc.integer(),
  }),
)

describe('Feature: fresh, Property 25: Fresh_Item ranking order', () => {
  /** **Validates: Requirements 9.5, 19.8** */
  it('orders by Fresh_Score desc, published desc, video id asc, with per-path closeness', () => {
    fc.assert(
      fc.property(arbScenario, ({ paths, items, selectedIndex, taste }) => {
        const ctx = makeCtx(paths, selectedIndex, taste)
        const ranked = rankFreshItems(items, ctx)

        // Every item has a valid match, so every item appears exactly once.
        expect(ranked.map((r) => r.item.videoId).sort()).toEqual(items.map((i) => i.videoId).sort())

        for (const r of ranked) {
          // Chosen match is one of the item's own matches and has the highest per-path closeness.
          expect(r.item.matches).toContainEqual(r.match)
          const best = Math.max(...r.item.matches.map((m) => expectedCloseness(m, ctx.paths)))
          expect([1.0, 0.8, 0.6]).toContain(r.closeness)
          expect(r.closeness).toBe(expectedCloseness(r.match, ctx.paths))
          expect(r.closeness).toBe(best)
          expect(r.score).toBeCloseTo(expectedScore(r, ctx), 12)
        }
        for (let i = 1; i < ranked.length; i++) {
          expect(inOrder(ranked[i - 1]!, ranked[i]!)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.5, 19.8** */
  it('returns the same list for every permutation of the input', () => {
    fc.assert(
      fc.property(
        arbScenario.chain((s) => fc.record({ s: fc.constant(s), shuffled: fc.shuffledSubarray(s.items, { minLength: s.items.length }) })),
        ({ s, shuffled }) => {
          const ctx = makeCtx(s.paths, s.selectedIndex, s.taste)
          const a = rankFreshItems(s.items, ctx)
          const b = rankFreshItems(shuffled, ctx)
          expect(b.map((r) => [r.item.videoId, r.match, r.score])).toEqual(
            a.map((r) => [r.item.videoId, r.match, r.score]),
          )
        },
      ),
      RUNS,
    )
  })

  /** **Validates: Requirements 9.5, 19.8** */
  it('ranks a Current_Skill match above an equal item matching a Skill outside its path Current_Window', () => {
    const arbPair = arbScenario.chain((s) => {
      const currentMatches = s.paths
        .filter((p) => p.currentSkillId !== null)
        .map((p) => ({ pathId: p.id, skillId: p.currentSkillId! }))
      const outsideMatches = s.paths.flatMap((p) =>
        p.skills.filter((sk) => !p.windowSkillIds.includes(sk.id)).map((sk) => ({ pathId: p.id, skillId: sk.id })),
      )
      return fc.record({
        s: fc.constant(s),
        current: currentMatches.length > 0 ? fc.constantFrom(...currentMatches) : fc.constant(null),
        outside: outsideMatches.length > 0 ? fc.constantFrom(...outsideMatches) : fc.constant(null),
        // A zero (or denormal) product would tie the two scores once the goal bonus or taste is
        // added in floating point; equal scores then fall back to video id. Scores are 0..1 judge
        // values, so keep them at practical magnitudes.
        fields: fc
          .record({
            base: arbItemFields,
            teachesThisSkill: fc.double({ min: 0.01, max: 1, noNaN: true }),
            levelFit: fc.double({ min: 0.01, max: 1, noNaN: true }),
          })
          .map(({ base, teachesThisSkill, levelFit }) => ({ ...base, teachesThisSkill, levelFit })),
        ids: fc.uniqueArray(arbVideoId, { minLength: 2, maxLength: 2 }),
      })
    })
    fc.assert(
      fc.property(arbPair, ({ s, current, outside, fields, ids }) => {
        fc.pre(current !== null && outside !== null)
        // "Equal in every input": both matched paths share the Goal_Class of the Current_Skill path.
        const goal = s.paths.find((p) => p.id === current!.pathId)!.goalClass
        const paths = s.paths.map((p) => (p.id === outside!.pathId ? { ...p, goalClass: goal } : p))
        const [idA, idB] = ids as [string, string]
        const others = s.items.filter((i) => i.videoId !== idA && i.videoId !== idB)
        const a = makeItem(idA, fields, [current!])
        const b = makeItem(idB, fields, [outside!])
        const ranked = rankFreshItems([b, ...others, a], makeCtx(paths, s.selectedIndex, s.taste))
        const order = ranked.map((r) => r.item.videoId)
        expect(order.indexOf(idA)).toBeGreaterThanOrEqual(0)
        expect(order.indexOf(idA)).toBeLessThan(order.indexOf(idB))
      }),
      RUNS,
    )
  })
})
