/**
 * Shared fast-check generators for the Fresh view properties (spec: fresh, Properties 24 to
 * 36; spec: fresh-v2, Properties 1 to 6 and 11): random `FreshResponseOk` values with paths
 * (Color_Slot, completed count and Active_Time included), items, pools, Channel_Sources and
 * check times, plus chips, mute maps and Video_Events with snapshots.
 */
import fc from 'fast-check'
import type {
  FreshCheckTime,
  FreshItemCard,
  FreshPath,
  FreshResponseOk,
  FreshSkillPool,
  FreshSource,
  PoolCard,
  SaveSnapshot,
  SkillMatch,
} from '../../shared/types/fresh'
import type { Level } from '../../shared/types/skill-tree'
import type { GoalClass, VideoEvent, VideoSource, VideoStyle } from '../../shared/types/video'
import type { ColorSlot } from '../../shared/utils/color-slot'
import { FRESH_WINDOW_S, rankFreshItems } from '../../shared/utils/fresh-rank'
import type { FilterChip, FreshViewInput } from '../../shared/utils/fresh-view'

export const NOW_MS = 1_800_000_000_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
export const WEEK_MS = 7 * DAY_MS

export const CHANNELS = ['UCa', 'UCb', 'UCc', 'UCd', 'UCe'] as const

/**
 * Small video id set so ids repeat across items, pools and events. Each video has one fixed
 * channel (or none), as on YouTube, so the channel lookup used for taste stays consistent.
 */
export const VIDEOS: readonly { id: string; channelId: string | null }[] = Array.from({ length: 18 }, (_, i) => ({
  id: `vid${String(i).padStart(8, '0')}`,
  channelId: i % 6 === 5 ? null : CHANNELS[i % CHANNELS.length]!,
}))

/** A wider id set for the section properties: up to 50 Fresh_Items and 30 pool videos per Skill. */
export const WIDE_VIDEOS: readonly { id: string; channelId: string | null }[] = Array.from({ length: 90 }, (_, i) => ({
  id: `wide${String(i).padStart(7, '0')}`,
  channelId: i % 7 === 6 ? null : CHANNELS[i % CHANNELS.length]!,
}))

/** Hobby texts, some equal after Normalization ("Guitar" and "guitar!"). */
export const HOBBIES = ['Bouldering', 'Guitar', 'guitar!', 'Film photography'] as const
export const LANGUAGES = ['en', 'de', 'fr'] as const

export const arbGoal = fc.constantFrom<GoalClass>('targeted', 'casual', 'none')
export const arbStyle = fc.constantFrom<VideoStyle>('drill', 'technique', 'explainer', 'approachable')
export const arbLevel = fc.constantFrom<Level>('beginner', 'intermediate', 'advanced')
export const arbVideo = fc.constantFrom(...VIDEOS)
export const arbSource = fc.constantFrom<VideoSource>('skill_sheet', 'feed')

/** A path with 1 to 5 Skills; Current_Window is the Current_Skill and up to 2 later Skills. */
export function arbPath(index: number): fc.Arbitrary<FreshPath> {
  return fc
    .record({
      skillCount: fc.integer({ min: 1, max: 5 }),
      currentPick: fc.option(fc.nat(), { nil: null, freq: 4 }),
      windowExtra: fc.integer({ min: 0, max: 2 }),
      goalClass: arbGoal,
      // A few fixed times, so equal Active_Times happen and the response-order tie-break counts.
      activeAt: fc.option(
        fc.oneof(
          fc.constantFrom(NOW_MS - DAY_MS, NOW_MS - HOUR_MS, NOW_MS),
          fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }),
        ),
        { nil: null },
      ),
      hobby: fc.constantFrom(...HOBBIES),
      colorSlot: fc.constantFrom<ColorSlot>(1, 2, 3, 4, 5),
      completedPick: fc.nat(),
    })
    .map(({ skillCount, currentPick, windowExtra, goalClass, activeAt, hobby, colorSlot, completedPick }) => {
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
        hobby,
        goalClass,
        currentSkillId: currentIndex === null ? null : skills[currentIndex]!.id,
        windowSkillIds:
          currentIndex === null ? [] : skills.slice(currentIndex, currentIndex + 1 + windowExtra).map((s) => s.id),
        skills,
        activeAt,
        colorSlot,
        completedCount: completedPick % (skillCount + 1),
      }
    })
}

/** `min` to `max` paths with the ids `path-0`, `path-1`, ... in response order. */
export function arbPathsOf(min: number, max: number): fc.Arbitrary<FreshPath[]> {
  return fc
    .integer({ min, max })
    .chain((n) => (n === 0 ? fc.constant([]) : fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(i)))))
}

export const arbPaths: fc.Arbitrary<FreshPath[]> = arbPathsOf(1, 3)

export function allMatches(paths: readonly FreshPath[]): SkillMatch[] {
  return paths.flatMap((p) => p.skills.map((s) => ({ pathId: p.id, skillId: s.id })))
}

export function cardBase(video: { id: string; channelId: string | null }, style: VideoStyle) {
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

/** Published times around the 7-day and 24-hour edges, plus random ones and a future one. */
export const arbPublished = fc.oneof(
  fc.constantFrom(
    NOW_MS,
    NOW_MS + 60_000,
    NOW_MS - DAY_MS,
    NOW_MS - DAY_MS + 1,
    NOW_MS - DAY_MS - 1,
    NOW_MS - WEEK_MS,
    NOW_MS - WEEK_MS + 1,
    NOW_MS - WEEK_MS - 1,
  ),
  fc.integer({ min: NOW_MS - WEEK_MS - DAY_MS, max: NOW_MS }),
)
export const arbFactor = fc.oneof(fc.constantFrom(0, 0.5, 0.8, 1), fc.double({ min: 0, max: 1, noNaN: true }))

/** Fresh_Items with unique video ids; matches on Skills of the given paths. */
export function arbItems(
  paths: readonly FreshPath[],
  maxLength = 30,
  videos: readonly { id: string; channelId: string | null }[] = VIDEOS,
): fc.Arbitrary<FreshItemCard[]> {
  const matches = allMatches(paths)
  return fc
    .uniqueArray(
      fc.record({
        video: fc.constantFrom(...videos),
        style: arbStyle,
        level: arbLevel,
        publishedMs: arbPublished,
        teachesThisSkill: arbFactor,
        levelFit: arbFactor,
        matches: fc.subarray([...matches], { minLength: 1, maxLength: Math.min(3, matches.length) }),
      }),
      { maxLength, selector: (r) => r.video.id },
    )
    .map((rows) =>
      rows.map(
        (r): FreshItemCard => ({
          ...cardBase(r.video, r.style),
          kind: 'fresh',
          matches: r.matches,
          why: 'Why line',
          publishedMs: r.publishedMs,
          teachesThisSkill: r.teachesThisSkill,
          levelFit: r.levelFit,
          level: r.level,
        }),
      ),
    )
}

/** One ranked pool per (path, Skill), each with 0 to 6 videos; ids may repeat across pools and items. */
export function arbPools(
  paths: readonly FreshPath[],
  maxPerSkill = 6,
  videos: readonly { id: string; channelId: string | null }[] = VIDEOS,
): fc.Arbitrary<FreshSkillPool[]> {
  const skills = allMatches(paths)
  return fc.tuple(
    ...skills.map((m) =>
      fc
        .uniqueArray(fc.tuple(fc.constantFrom(...videos), arbStyle), { maxLength: maxPerSkill, selector: ([v]) => v.id })
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

/** Channel names with case-only differences and equal names, so both sort keys are exercised. */
export const CHANNEL_NAMES: Readonly<Record<string, string>> = {
  UCa: 'beta',
  UCb: 'Alpha',
  UCc: 'alpha',
  UCd: 'Same',
  UCe: 'same',
}

/** Channel_Sources on raw hobby texts and languages, with channel ids shared across hobbies. */
export const arbSources: fc.Arbitrary<FreshSource[]> = fc.array(
  fc
    .record({
      hobby: fc.constantFrom(...HOBBIES, 'Chess'),
      language: fc.constantFrom(...LANGUAGES),
      channelId: fc.constantFrom(...CHANNELS),
    })
    .map((r): FreshSource => ({ ...r, channelName: CHANNEL_NAMES[r.channelId]! })),
  { maxLength: 14 },
)

export const arbCheckTimes: fc.Arbitrary<FreshCheckTime[]> = fc.array(
  fc.record({
    hobby: fc.constantFrom(...HOBBIES, 'Chess'),
    language: fc.constantFrom(...LANGUAGES),
    lastSuccessMs: fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS + 60_000 }),
  }),
  { maxLength: 6 },
)

/** Mutes over the channel pool, muted true or false. */
export const arbMutes: fc.Arbitrary<Map<string, boolean>> = fc
  .array(fc.tuple(fc.constantFrom(...CHANNELS), fc.boolean()), { maxLength: 6 })
  .map((entries) => new Map(entries))

export function snapshotOf(video: { id: string; channelId: string | null }, variant: number): SaveSnapshot {
  return {
    videoId: video.id,
    title: `Saved ${video.id} ${variant}`,
    channel: video.channelId === null ? 'Unknown' : `Channel ${video.channelId}`,
    channelId: video.channelId,
    thumbnailUrl:
      variant % 3 === 2 ? `http://i.ytimg.com/vi/${video.id}/hq.jpg` : `https://i.ytimg.com/vi/${video.id}/hq.jpg`,
    durationSeconds: 60 * (variant + 1),
  }
}

/**
 * Merged Video_Events: at most one record per (video, source), as after the event merge.
 * Only `feed` records carry a Save_Snapshot; saved true always has a Saved_Time.
 * Saved times collide often, so the video id tie-break is exercised.
 */
export const arbEvents: fc.Arbitrary<VideoEvent[]> = fc
  .uniqueArray(
    fc.record({
      video: arbVideo,
      source: arbSource,
      finished: fc.boolean(),
      skipped: fc.boolean(),
      saved: fc.boolean(),
      savedAt: fc.option(fc.constantFrom(NOW_MS - 3 * HOUR_MS, NOW_MS - 2 * HOUR_MS, NOW_MS - HOUR_MS, NOW_MS), {
        nil: null,
        freq: 4,
      }),
      snapshotVariant: fc.option(fc.nat({ max: 5 }), { nil: null }),
      updatedAt: fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }),
    }),
    { maxLength: 24, selector: (r) => `${r.video.id}|${r.source}` },
  )
  .map((rows) =>
    rows.map((r): VideoEvent => {
      const snapshot = r.source === 'feed' && r.snapshotVariant !== null ? snapshotOf(r.video, r.snapshotVariant) : null
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
        snapshotAt: snapshot === null ? null : (r.savedAt ?? NOW_MS - WEEK_MS),
        updatedAt: r.updatedAt,
      }
    }),
  )

/** Any chip, including a path chip for a path that is gone. */
export function arbChip(paths: readonly FreshPath[]): fc.Arbitrary<FilterChip> {
  return fc.oneof(
    fc.constant<FilterChip>({ kind: 'all' }),
    fc.constant<FilterChip>({ kind: 'saved' }),
    fc.constantFrom(...paths.map((p) => p.id), 'path-gone').map((pathId): FilterChip => ({ kind: 'path', pathId })),
  )
}

export function makeResponse(over: Partial<FreshResponseOk> & { paths: FreshPath[] }): FreshResponseOk {
  return {
    nowMs: NOW_MS,
    language: 'en',
    items: [],
    pools: [],
    sources: [],
    checkTimes: [],
    mutes: [],
    events: [],
    ...over,
  }
}

/** A full view input over 1 to 3 paths. */
export const arbViewInput: fc.Arbitrary<FreshViewInput> = arbPaths.chain((paths) =>
  fc.record({
    response: fc
      .record({
        language: fc.constantFrom(...LANGUAGES),
        items: arbItems(paths),
        pools: arbPools(paths),
        sources: arbSources,
        checkTimes: arbCheckTimes,
      })
      .map((r) => makeResponse({ paths, ...r })),
    chip: arbChip(paths),
    mutes: arbMutes,
    events: arbEvents,
    demo: fc.boolean(),
  }),
)

/**
 * A view input for the fresh-v2 section properties: `minPaths` to `maxPaths` paths (some with
 * no Current_Skill), up to `maxItems` Fresh_Items and up to `maxPool` pool videos per Skill,
 * with random mutes and no Video_Events (so no Taste_Adjustment), outside Demo_Mode.
 */
export function arbSectionInput(
  opts: { minPaths?: number; maxPaths?: number; maxItems?: number; maxPool?: number } = {},
): fc.Arbitrary<FreshViewInput> {
  const { minPaths = 1, maxPaths = 5, maxItems = 50, maxPool = 30 } = opts
  return arbPathsOf(minPaths, maxPaths).chain((paths) =>
    fc.record({
      response: fc
        .record({
          language: fc.constantFrom(...LANGUAGES),
          items: arbItems(paths, maxItems, WIDE_VIDEOS),
          pools: arbPools(paths, maxPool, WIDE_VIDEOS),
          sources: arbSources,
          checkTimes: arbCheckTimes,
        })
        .map((r) => makeResponse({ paths, ...r })),
      chip: fc.constant<FilterChip>({ kind: 'all' }),
      mutes: arbMutes,
      events: fc.constant<VideoEvent[]>([]),
      demo: fc.constant(false),
    }),
  )
}

export function isMuted(mutes: ReadonlyMap<string, boolean>, channelId: string | null): boolean {
  return channelId !== null && mutes.get(channelId) === true
}

/**
 * Path_Order as fresh-v2 Req 2.2 defines it, written without `pathOrder`: Active_Time
 * descending, paths with none after them, ties and the rest in response order.
 */
export function expectedPathOrder(paths: readonly FreshPath[]): FreshPath[] {
  const withTime = paths
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.activeAt !== null)
    .sort((a, b) => (b.p.activeAt as number) - (a.p.activeAt as number) || a.index - b.index)
    .map(({ p }) => p)
  return [...withTime, ...paths.filter((p) => p.activeAt === null)]
}

/**
 * The chip the page shows (fresh-v2 Req 2.1, 2.6, 2.9, 11.1): a Hobby_Chip needs 2 or more
 * paths and a path of the response; "Saved" is hidden in Demo_Mode; anything else is
 * "All hobbies".
 */
export function expectedChip(input: FreshViewInput): FilterChip {
  const { paths } = input.response
  const chip = input.chip
  if (chip.kind === 'path') {
    return paths.length >= 2 && paths.some((p) => p.id === chip.pathId) ? chip : { kind: 'all' }
  }
  if (chip.kind === 'saved') return input.demo ? { kind: 'all' } : chip
  return { kind: 'all' }
}

/**
 * Shown_Items in rank order, one per video id, for an input with no Video_Events: items on a
 * path with a Current_Skill, not muted and under 7 days old, ranked by `rankFreshItems` over
 * those paths in Path_Order (fresh-v2 Req 3.1, AS3). Each carries the one path it belongs to.
 */
export function expectedRanked(input: FreshViewInput) {
  const { response, mutes } = input
  const ordered = expectedPathOrder(response.paths).filter((p) => p.currentSkillId !== null)
  const minPublished = response.nowMs - FRESH_WINDOW_S * 1000
  const candidates = response.items.filter((i) => !isMuted(mutes, i.channelId) && i.publishedMs > minPublished)
  const seen = new Set<string>()
  return rankFreshItems(candidates, {
    nowMs: response.nowMs,
    paths: new Map(ordered.map((p) => [p.id, p])),
    selectedPathId: expectedPathOrder(response.paths)[0]?.id ?? '',
    taste: new Map(),
  }).filter((r) => {
    if (seen.has(r.item.videoId)) return false
    seen.add(r.item.videoId)
    return true
  })
}
