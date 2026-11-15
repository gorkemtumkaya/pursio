/**
 * Composition of the Fresh_Endpoint response on the Server (spec: fresh, design "Composition
 * on the Server", Req 6.13, 8.1, 8.11, 8.12, 8.17). Pure functions: no store, clock or network.
 *
 * Path_Match: an item matches a Skill when the item's Normalized hobby equals the Normalized
 * hobby of the Skill's path and the item's Normalized Skill title equals the Normalized title
 * of the Skill. Level is never compared.
 */
import type { FreshItemCard, FreshSkillPool, PoolCard, SkillMatch } from '../../../shared/types/fresh'
import type { Level } from '../../../shared/types/skill-tree'
import type { GoalClass, RankedVideo, VideoPool } from '../../../shared/types/video'
import { normalizeText } from '../../../shared/utils/video-normalize'
import { composeVideos, fallbackApplies } from '../video/compose'
import type { FreshItemRow } from './check-store'

/** Ranked Video_Pool videos returned per window Skill. */
export const FRESH_POOL_LIMIT = 24
/** Current_Window size: the Current_Skill and the next 2 (equal to the pipeline's WINDOW_SIZE). */
export const FRESH_WINDOW_SIZE = 3

/** The Skills of one path that items are matched against. */
export interface PathScope {
  pathId: string
  /** Raw hobby text; normalized here. */
  hobby: string
  skills: readonly { id: string; title: string; level: Level }[]
}

/**
 * Current_Window ids: the Current_Skill and the next 2 in path order. Empty when there is no
 * Current_Skill (decision D16) or the id is not among the Skills.
 */
export function windowSkillIds(skills: readonly { id: string }[], currentSkillId: string | null): string[] {
  if (currentSkillId === null) return []
  const start = skills.findIndex((s) => s.id === currentSkillId)
  if (start < 0) return []
  return skills.slice(start, start + FRESH_WINDOW_SIZE).map((s) => s.id)
}

function toCard(row: FreshItemRow, match: SkillMatch): FreshItemCard {
  return {
    kind: 'fresh',
    videoId: row.videoId,
    title: row.video.title,
    channel: row.video.channel,
    channelId: row.channelId,
    thumbnailUrl: row.video.thumbnailUrl,
    durationSeconds: row.video.durationSeconds,
    style: row.video.style,
    poolLanguage: row.language,
    matches: [match],
    why: row.why,
    publishedMs: row.publishedMs,
    teachesThisSkill: row.video.teachesThisSkill,
    levelFit: row.video.levelFit,
    level: row.level,
  }
}

function groupId(hobby: string, language: string, skillNorm: string): string {
  return JSON.stringify([hobby, language, skillNorm])
}

/**
 * Items with a Path_Match to any Skill of the paths. For each Skill the user-language items
 * come first; when `fallbackApplies(language, count)` the `en` items of the same Skill follow,
 * minus video ids already listed for it. A video id appears once: the first kept copy wins,
 * and user-language copies are kept before any `en` copy. Its `poolLanguage` is the language of
 * that copy and `matches` lists every Skill it matched in that language, in path and Skill
 * order. Input items keep their order inside a Skill (the read orders by published desc).
 */
export function composeFreshItems(input: {
  language: string
  paths: readonly PathScope[]
  items: readonly FreshItemRow[]
}): FreshItemCard[] {
  const groups = new Map<string, FreshItemRow[]>()
  for (const row of input.items) {
    const id = groupId(row.hobby, row.language, row.skillNorm)
    const list = groups.get(id)
    if (list) list.push(row)
    else groups.set(id, [row])
  }

  const cards = new Map<string, FreshItemCard>()
  const add = (row: FreshItemRow, match: SkillMatch): void => {
    const kept = cards.get(row.videoId)
    if (!kept) {
      cards.set(row.videoId, toCard(row, match))
      return
    }
    if (kept.poolLanguage !== row.language) return
    if (!kept.matches.some((m) => m.pathId === match.pathId && m.skillId === match.skillId)) kept.matches.push(match)
  }

  // Skills in path order, with their user-language items.
  const skills = input.paths.flatMap((path) => {
    const hobby = normalizeText(path.hobby)
    return path.skills.map((skill) => {
      const title = normalizeText(skill.title)
      return {
        hobby,
        title,
        match: { pathId: path.pathId, skillId: skill.id },
        own: groups.get(groupId(hobby, input.language, title)) ?? [],
      }
    })
  })

  // 1. Every user-language copy first, so it wins over an `en` copy of the same id.
  for (const skill of skills) for (const row of skill.own) add(row, skill.match)

  // 2. The `en` fallback per Skill (Req 8.11).
  for (const skill of skills) {
    if (!fallbackApplies(input.language, skill.own.length)) continue
    const ownIds = new Set(skill.own.map((r) => r.videoId))
    for (const row of groups.get(groupId(skill.hobby, 'en', skill.title)) ?? []) {
      if (!ownIds.has(row.videoId)) add(row, skill.match)
    }
  }

  return [...cards.values()]
}

function toPoolCard(video: RankedVideo, match: SkillMatch): PoolCard {
  return {
    kind: 'pool',
    videoId: video.id,
    title: video.title,
    channel: video.channel,
    channelId: video.channelId,
    thumbnailUrl: video.thumbnailUrl,
    durationSeconds: video.durationSeconds,
    style: video.style,
    poolLanguage: video.poolLanguage,
    matches: [match],
  }
}

/** Ranked Video_Pool videos of one window Skill: `composeVideos` with the path's Goal_Class, limit 24. */
export function poolCardsFor(input: {
  language: string
  goal: GoalClass
  pathId: string
  skillId: string
  userPool: VideoPool | null
  enPool: VideoPool | null
}): FreshSkillPool {
  const match: SkillMatch = { pathId: input.pathId, skillId: input.skillId }
  const videos = composeVideos({
    language: input.language,
    goal: input.goal,
    userPool: input.userPool,
    enPool: input.enPool,
    limit: FRESH_POOL_LIMIT,
  })
  return { pathId: input.pathId, skillId: input.skillId, videos: videos.map((v) => toPoolCard(v, match)) }
}
