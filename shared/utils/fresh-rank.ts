/**
 * Pure Fresh ranking (Req 9). Runs on the Client and in tests; no server imports.
 */
import type {
  FreshItemCard,
  FreshPath,
  RankContext,
  RankedFreshItem,
  SkillMatch,
} from '../types/fresh'
import type { GoalClass, VideoEvent } from '../types/video'
import { compareCodePoints } from './fresh-keys'
import { goalAdjustment } from './video-ranking'

/** Fresh items count for 7 days. */
export const FRESH_WINDOW_S = 604800
/** "New" badge for items under 24 hours old. */
export const NEW_BADGE_S = 86400
/** Most cards in one Hobby_Section (spec: fresh-v2, Req 5.5). */
export const SECTION_MAX = 12
export const VARIETY_WINDOW = 6
export const VARIETY_MAX_PER_CHANNEL = 2
/** Most cards of one Skill across the Hero_Card and all Hobby_Sections (spec: fresh-v2, Req 5.5). */
export const MAX_PER_SKILL = 3
export const TASTE_MIN_EVENTS = 10
export const TASTE_STEP = 0.1
export const TASTE_BOUND = 0.2
const TASTE_MIN_SKIPS = 3

export const CLOSENESS = { current: 1.0, window: 0.8, path: 0.6 } as const

/** 1 − 0.5 × age ÷ 604800; a future time (negative age) counts as age 0 (Req 9.2). */
export function recencyFactor(ageSeconds: number): number {
  const age = Number.isNaN(ageSeconds) ? 0 : Math.max(0, ageSeconds)
  return 1 - 0.5 * (age / FRESH_WINDOW_S)
}

/**
 * Scored against the match's own path (decision D14): 1.0, 0.8 or 0.6.
 * A path with no Current_Skill has an empty window, so always 0.6 (decision D16).
 */
export function closenessFactor(match: SkillMatch, path: FreshPath): number {
  if (path.currentSkillId === null) return CLOSENESS.path
  if (match.skillId === path.currentSkillId) return CLOSENESS.current
  if (path.windowSkillIds.includes(match.skillId)) return CLOSENESS.window
  return CLOSENESS.path
}

/**
 * Highest closeness over the given matches, each against its own path.
 * Ties: Selected_Path first, then the earlier Skill in path order, then the earlier path in response order.
 * Matches whose path or Skill is not in `paths` are ignored.
 */
export function bestMatch(
  matches: readonly SkillMatch[],
  paths: ReadonlyMap<string, FreshPath>,
  selectedPathId: string,
): { match: SkillMatch; closeness: number } | null {
  const pathOrder = new Map<string, number>()
  let i = 0
  for (const id of paths.keys()) pathOrder.set(id, i++)

  let best: { match: SkillMatch; closeness: number; selected: boolean; skillIndex: number; pathIndex: number } | null = null
  for (const match of matches) {
    const path = paths.get(match.pathId)
    if (!path) continue
    const skillIndex = path.skills.findIndex((s) => s.id === match.skillId)
    if (skillIndex < 0) continue
    const candidate = {
      match,
      closeness: closenessFactor(match, path),
      selected: match.pathId === selectedPathId,
      skillIndex,
      pathIndex: pathOrder.get(match.pathId) ?? Number.MAX_SAFE_INTEGER,
    }
    if (best === null || beats(candidate, best)) best = candidate
  }
  return best ? { match: best.match, closeness: best.closeness } : null
}

function beats(
  a: { closeness: number; selected: boolean; skillIndex: number; pathIndex: number },
  b: { closeness: number; selected: boolean; skillIndex: number; pathIndex: number },
): boolean {
  if (a.closeness !== b.closeness) return a.closeness > b.closeness
  if (a.selected !== b.selected) return a.selected
  if (a.skillIndex !== b.skillIndex) return a.skillIndex < b.skillIndex
  return a.pathIndex < b.pathIndex
}

/**
 * Taste_Adjustment per channel id (Req 9.7 to 9.10): 0 under 10 records; +0.1 for 1+ Finished;
 * −0.1 for 3+ `feed` skips; clamped to ±0.2. A record's channel comes from `channelOf`
 * (the returned cards), else its Save_Snapshot; a record with neither only counts toward the total.
 * Channels absent from the map have an adjustment of 0.
 */
export function tasteAdjustments(
  events: readonly VideoEvent[],
  channelOf: (videoId: string) => string | null,
): Map<string, number> {
  const result = new Map<string, number>()
  if (events.length < TASTE_MIN_EVENTS) return result

  const finished = new Set<string>()
  const skips = new Map<string, number>()
  for (const event of events) {
    const channel = channelOf(event.videoId) ?? event.snapshot?.channelId ?? null
    if (channel === null || channel === '') continue
    if (event.finished) finished.add(channel)
    if (event.source === 'feed' && event.skipped) skips.set(channel, (skips.get(channel) ?? 0) + 1)
  }

  const channels = new Set<string>([...finished, ...skips.keys()])
  for (const channel of channels) {
    let value = 0
    if (finished.has(channel)) value += TASTE_STEP
    if ((skips.get(channel) ?? 0) >= TASTE_MIN_SKIPS) value -= TASTE_STEP
    value = Math.min(TASTE_BOUND, Math.max(-TASTE_BOUND, value))
    if (value !== 0) result.set(channel, value)
  }
  return result
}

/** Recency × teaches × levelFit × closeness + goal adjustment + taste (Req 9.1). */
export function freshScore(
  item: FreshItemCard,
  ctx: { nowMs: number; closeness: number; goal: GoalClass; taste: number },
): number {
  const ageSeconds = (ctx.nowMs - item.publishedMs) / 1000
  return (
    recencyFactor(ageSeconds) * item.teachesThisSkill * item.levelFit * ctx.closeness
    + goalAdjustment(item, ctx.goal)
    + ctx.taste
  )
}

/**
 * Score desc, published desc, video id asc (Req 9.5). Each item carries its chosen match.
 * Items with no match on a path of `ctx.paths` are left out.
 */
export function rankFreshItems(items: readonly FreshItemCard[], ctx: RankContext): RankedFreshItem[] {
  const ranked: RankedFreshItem[] = []
  for (const item of items) {
    const chosen = bestMatch(item.matches, ctx.paths, ctx.selectedPathId)
    if (!chosen) continue
    const path = ctx.paths.get(chosen.match.pathId)
    const goal: GoalClass = path?.goalClass ?? 'none'
    const taste = item.channelId === null ? 0 : (ctx.taste.get(item.channelId) ?? 0)
    ranked.push({
      item,
      match: chosen.match,
      closeness: chosen.closeness,
      score: freshScore(item, { nowMs: ctx.nowMs, closeness: chosen.closeness, goal, taste }),
    })
  }
  return ranked.sort(
    (a, b) =>
      b.score - a.score
      || b.item.publishedMs - a.item.publishedMs
      || compareCodePoints(a.item.videoId, b.item.videoId),
  )
}

/**
 * Variety rule of Req 9.13, 9.14 (decision D1): any VARIETY_WINDOW consecutive cards hold at most
 * VARIETY_MAX_PER_CHANNEL cards of one channel; a `null` channel never conflicts.
 * Builds the output left to right; a card that does not fit waits and lands at the first later
 * position where it fits. Cards that never fit go to the end in ranked order, from `tailStart` on.
 */
export function arrangeVariety<T>(
  cards: readonly T[],
  channelOf: (card: T) => string | null,
): { cards: T[]; tailStart: number } {
  const out: T[] = []
  const outChannels: (string | null)[] = []
  const waiting: { card: T; channel: string | null }[] = []

  const fits = (channel: string | null): boolean => {
    if (channel === null) return true
    let count = 0
    for (let i = Math.max(0, outChannels.length - (VARIETY_WINDOW - 1)); i < outChannels.length; i++) {
      if (outChannels[i] === channel) count++
    }
    return count < VARIETY_MAX_PER_CHANNEL
  }

  const place = (card: T, channel: string | null): void => {
    out.push(card)
    outChannels.push(channel)
  }

  // Place waiting cards that fit, earliest-ranked first, until none fits.
  const drainWaiting = (): void => {
    let i = 0
    while (i < waiting.length) {
      const entry = waiting[i]!
      if (fits(entry.channel)) {
        waiting.splice(i, 1)
        place(entry.card, entry.channel)
        i = 0
      } else {
        i++
      }
    }
  }

  for (const card of cards) {
    drainWaiting()
    const channel = channelOf(card)
    if (fits(channel)) place(card, channel)
    else waiting.push({ card, channel })
  }
  drainWaiting()

  const tailStart = out.length
  for (const entry of waiting) out.push(entry.card)
  return { cards: out, tailStart }
}
