/**
 * Shared fast-check generators for the Fresh view properties (design "Testing Strategy",
 * Properties 24 to 36): random `FreshResponseOk` values with 1 to 3 paths, items, pools,
 * Channel_Sources and check times, plus chips, mute maps and Video_Events with snapshots.
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
      activeAt: fc.option(fc.integer({ min: NOW_MS - WEEK_MS, max: NOW_MS }), { nil: null }),
      hobby: fc.constantFrom(...HOBBIES),
    })
    .map(({ skillCount, currentPick, windowExtra, goalClass, activeAt, hobby }) => {
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
      }
    })
}

export const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 1, max: 3 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(i))))

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
export function arbItems(paths: readonly FreshPath[], maxLength = 30): fc.Arbitrary<FreshItemCard[]> {
  const matches = allMatches(paths)
  return fc
    .uniqueArray(
      fc.record({
        video: arbVideo,
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
export function arbPools(paths: readonly FreshPath[]): fc.Arbitrary<FreshSkillPool[]> {
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
    fc.constant<FilterChip>({ kind: 'current' }),
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
    selectedPathId: fc.constantFrom<string | null>(null, 'path-gone', ...paths.map((p) => p.id)),
    mutes: arbMutes,
    events: arbEvents,
    demo: fc.boolean(),
  }),
)

export function isMuted(mutes: ReadonlyMap<string, boolean>, channelId: string | null): boolean {
  return channelId !== null && mutes.get(channelId) === true
}

/** The Selected_Path as Req 12.4 and 14.9 define it: the stored one when present, else the first path. */
export function expectedSelected(paths: readonly FreshPath[], storedId: string | null): FreshPath {
  return paths.find((p) => p.id === storedId) ?? paths[0]!
}

/** The chip the page shows: a hidden or unknown chip falls back to "All skills" (Req 14.1, 14.10, 11.10). */
export function expectedChip(input: FreshViewInput): FilterChip {
  const { paths } = input.response
  const selected = expectedSelected(paths, input.selectedPathId)
  const chip = input.chip
  if (chip.kind === 'current' && selected.currentSkillId === null) return { kind: 'all' }
  if (chip.kind === 'path' && !paths.some((p) => p.id === chip.pathId)) return { kind: 'all' }
  if (chip.kind === 'saved' && input.demo) return { kind: 'all' }
  return chip
}
