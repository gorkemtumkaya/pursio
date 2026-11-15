import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type {
  FreshItemCard,
  FreshPath,
  FreshResponseOk,
  FreshSkillPool,
  PoolCard,
  SaveSnapshot,
  SkillMatch,
} from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { GoalClass, VideoEvent, VideoSource, VideoStyle } from '../../shared/types/video'
import { mergeMuteLists } from '../../shared/utils/channel-mutes'
import { buildFreshView, type FilterChip, type FreshView, type FreshViewInput } from '../../shared/utils/fresh-view'

const RUNS = { numRuns: 200 }
const NOW_MS = 1_800_000_000_000
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

const CHANNELS = ['UCa', 'UCb', 'UCc', 'UCd', 'UCe'] as const
/**
 * Small video id set so ids repeat across items, pools and events. Each video has one fixed
 * channel (or none), as on YouTube, so the channel lookup used for taste stays consistent.
 */
const VIDEOS: readonly { id: string; channelId: string | null }[] = Array.from({ length: 18 }, (_, i) => ({
  id: `vid${String(i).padStart(8, '0')}`,
  channelId: i % 6 === 5 ? null : CHANNELS[i % CHANNELS.length]!,
}))

const arbGoal = fc.constantFrom<GoalClass>('targeted', 'casual', 'none')
const arbStyle = fc.constantFrom<VideoStyle>('drill', 'technique', 'explainer', 'approachable')
const arbLevel = fc.constantFrom<Level>('beginner', 'intermediate', 'advanced')
const arbVideo = fc.constantFrom(...VIDEOS)

/** A path with 1 to 5 Skills; Current_Window is the Current_Skill and up to 2 later Skills. */
function arbPath(index: number): fc.Arbitrary<FreshPath> {
  return fc
    .record({
      skillCount: fc.integer({ min: 1, max: 5 }),
      currentPick: fc.option(fc.nat(), { nil: null, freq: 4 }),
      windowExtra: fc.integer({ min: 0, max: 2 }),
      goalClass: arbGoal,
      activeAt: fc.option(fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }), { nil: null }),
    })
    .map(({ skillCount, currentPick, windowExtra, goalClass, activeAt }) => {
      const id = `path-${index}`
      const skills = Array.from({ length: skillCount }, (_, i) => ({
        id: `${id}-s${i}`,
        title: `Skill ${index}.${i}`,
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
        activeAt,
      }
    })
}

const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(i))))

function allMatches(paths: readonly FreshPath[]): SkillMatch[] {
  return paths.flatMap((p) => p.skills.map((s) => ({ pathId: p.id, skillId: s.id })))
}

function cardBase(video: { id: string; channelId: string | null }, style: VideoStyle) {
  return {
    videoId: video.id,
    title: `Title ${video.id}`,
    channel: video.channelId === null ? 'Unknown' : `Channel ${video.channelId}`,
    channelId: video.channelId,
    thumbnailUrl: `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    durationSeconds: 300,
    style,
    poolLanguage: 'en',
  }
}

/** Published times inside and outside the 7-day window, with factor ties. */
const arbPublished = fc.oneof(
  fc.constantFrom(NOW_MS, NOW_MS - 3_600_000, NOW_MS - WEEK_MS, NOW_MS - WEEK_MS + 1, NOW_MS - 2 * DAY_MS),
  fc.integer({ min: NOW_MS - WEEK_MS - DAY_MS, max: NOW_MS }),
)
const arbFactor = fc.oneof(fc.constantFrom(0.5, 0.8, 1), fc.double({ min: 0, max: 1, noNaN: true }))

function arbItem(matches: readonly SkillMatch[]): fc.Arbitrary<FreshItemCard> {
  return fc
    .record({
      video: arbVideo,
      style: arbStyle,
      level: arbLevel,
      publishedMs: arbPublished,
      teachesThisSkill: arbFactor,
      levelFit: arbFactor,
      matches: fc.subarray([...matches], { minLength: 1, maxLength: Math.min(3, matches.length) }),
    })
    .map((r) => ({
      ...cardBase(r.video, r.style),
      kind: 'fresh' as const,
      matches: r.matches,
      why: 'Why line',
      publishedMs: r.publishedMs,
      teachesThisSkill: r.teachesThisSkill,
      levelFit: r.levelFit,
      level: r.level,
    }))
}

function arbPools(paths: readonly FreshPath[]): fc.Arbitrary<FreshSkillPool[]> {
  const skills = allMatches(paths)
  return fc.tuple(
    ...skills.map((m) =>
      fc
        .uniqueArray(fc.tuple(arbVideo, arbStyle), { maxLength: 6, selector: ([v]) => v.id })
        .map((videos): FreshSkillPool => ({
          pathId: m.pathId,
          skillId: m.skillId,
          videos: videos.map(([v, style]): PoolCard => ({
            ...cardBase(v, style),
            kind: 'pool',
            matches: [{ pathId: m.pathId, skillId: m.skillId }],
          })),
        })),
    ),
  )
}

const arbSource = fc.constantFrom<VideoSource>('skill_sheet', 'feed')
/** Events on known videos; a snapshot carries the video's own channel. */
const arbEvent: fc.Arbitrary<VideoEvent> = fc
  .record({
    video: arbVideo,
    source: arbSource,
    finished: fc.boolean(),
    skipped: fc.boolean(),
    saved: fc.boolean(),
    savedAt: fc.option(fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }), { nil: null }),
    withSnapshot: fc.boolean(),
    updatedAt: fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }),
  })
  .map((r) => {
    const snapshot: SaveSnapshot | null = r.withSnapshot
      ? {
          videoId: r.video.id,
          title: `Title ${r.video.id}`,
          channel: 'Channel',
          channelId: r.video.channelId,
          thumbnailUrl: `https://i.ytimg.com/vi/${r.video.id}/hqdefault.jpg`,
          durationSeconds: 300,
        }
      : null
    return {
      videoId: r.video.id,
      source: r.source,
      playedAt: null,
      watchedSeconds: 0,
      finished: r.finished,
      saved: r.savedAt === null ? false : r.saved,
      savedAt: r.savedAt,
      skipped: r.skipped,
      snapshot,
      snapshotAt: snapshot === null ? null : (r.savedAt ?? 0),
      updatedAt: r.updatedAt,
    }
  })

/** Mutes built from Channel_Mute records through the real merge, as the page does. */
const arbMutes: fc.Arbitrary<Map<string, boolean>> = fc
  .array(
    fc.record({
      channelId: fc.constantFrom(...CHANNELS),
      muted: fc.boolean(),
      changedAt: fc.integer({ min: 0, max: 10 }),
    }),
    { maxLength: 8 },
  )
  .map((recs) => new Map(mergeMuteLists(recs, []).map((m) => [m.channelId, m.muted])))

function arbChip(paths: readonly FreshPath[]): fc.Arbitrary<FilterChip> {
  return fc.oneof(
    fc.constant<FilterChip>({ kind: 'current' }),
    fc.constant<FilterChip>({ kind: 'all' }),
    fc.constant<FilterChip>({ kind: 'saved' }),
    fc.constantFrom(...paths.map((p): FilterChip => ({ kind: 'path', pathId: p.id }))),
  )
}

const arbInput: fc.Arbitrary<FreshViewInput> = arbPaths.chain((paths) =>
  fc.record({
    response: fc
      .record({
        items: fc.array(arbItem(allMatches(paths)), { maxLength: 30 }),
        pools: arbPools(paths),
      })
      .map(
        ({ items, pools }): FreshResponseOk => ({
          nowMs: NOW_MS,
          language: 'en',
          paths,
          items,
          pools,
          sources: [],
          checkTimes: [],
          mutes: [],
          events: [],
        }),
      ),
    chip: arbChip(paths),
    selectedPathId: fc.option(fc.constantFrom(...paths.map((p) => p.id), 'path-missing'), { nil: null }),
    mutes: arbMutes,
    events: fc.array(arbEvent, { maxLength: 16 }),
    demo: fc.boolean(),
  }),
)

/** The same response with every card of channel c removed. */
function withoutChannel(response: FreshResponseOk, c: string): FreshResponseOk {
  return {
    ...response,
    items: response.items.filter((i) => i.channelId !== c),
    pools: response.pools.map((p) => ({ ...p, videos: p.videos.filter((v) => v.channelId !== c) })),
  }
}

/** Everything a card change can touch; `saved` and `sources` follow their own mute rules. */
function cardView(view: FreshView) {
  const { saved: _saved, sources: _sources, state, ...rest } = view
  // On "Saved" the state follows the Saved list (Req 14.6, 14.7), not the three card sections.
  return view.chip.kind === 'saved' ? rest : { ...rest, state }
}

function shownChannels(view: FreshView): (string | null)[] {
  return [
    ...(view.hero ? [view.hero.card.channelId] : []),
    ...view.newCards.map((c) => c.card.channelId),
    ...view.bestCards.map((c) => c.card.channelId),
  ]
}

function withMute(mutes: ReadonlyMap<string, boolean>, c: string, muted: boolean): Map<string, boolean> {
  return new Map([...mutes, [c, muted]])
}

/** Inputs where c is not muted, with c biased to the Hero_Card's channel. */
const arbCase = arbInput.chain((input) => {
  const heroChannel = buildFreshView(input).hero?.card.channelId ?? null
  const choices = heroChannel === null ? fc.constantFrom(...CHANNELS) : fc.oneof(fc.constant(heroChannel), fc.constantFrom(...CHANNELS))
  return choices.map((c) => {
    const mutes = new Map(input.mutes)
    if (mutes.get(c) === true) mutes.delete(c)
    return { input: { ...input, mutes }, c }
  })
})

// Feature: fresh, Property 29: Mute exclusion and re-application
describe('Feature: fresh, Property 29: Mute exclusion and re-application', () => {
  it('shows no card of a muted channel in the Hero_Card, New_Section or Best_Section', () => {
    // **Validates: Requirements 9.6**
    fc.assert(
      fc.property(arbInput, (input) => {
        const view = buildFreshView(input)
        for (const ch of shownChannels(view)) {
          if (ch !== null) expect(input.mutes.get(ch)).not.toBe(true)
        }
      }),
      RUNS,
    )
  })

  it('muting c equals removing every card of c from the response', () => {
    // **Validates: Requirements 9.6, 12.8, 15.6**
    fc.assert(
      fc.property(arbCase, ({ input, c }) => {
        const muted = buildFreshView({ ...input, mutes: withMute(input.mutes, c, true) })
        const removed = buildFreshView({ ...input, response: withoutChannel(input.response, c) })
        expect(cardView(muted)).toEqual(cardView(removed))
        expect(shownChannels(muted)).not.toContain(c)
      }),
      RUNS,
    )
  })

  it("muting the Hero_Card's channel gives the next Fresh_Item, else the pool fallback, else no Hero_Card", () => {
    // **Validates: Requirements 12.8**
    fc.assert(
      fc.property(arbCase, ({ input, c }) => {
        const before = buildFreshView(input)
        // arbCase picks the Hero_Card's channel about half the time; other cases are covered above.
        if (before.hero === null || before.hero.card.channelId !== c) return
        const after = buildFreshView({ ...input, mutes: withMute(input.mutes, c, true) })
        if (after.hero === null) return
        expect(after.hero.card.channelId).not.toBe(c)
        if (after.hero.kind === 'pool') {
          // The pool fallback only when no in-scope Fresh_Item is left: nothing fresh is shown.
          expect(after.newCards).toEqual([])
        }
      }),
      RUNS,
    )
  })

  it('unmuting restores the original view', () => {
    // **Validates: Requirements 15.6**
    fc.assert(
      fc.property(arbCase, ({ input, c }) => {
        const original = buildFreshView(input)
        const unmuted = buildFreshView({ ...input, mutes: withMute(input.mutes, c, false) })
        expect(unmuted).toEqual(original)
      }),
      RUNS,
    )
  })
})
