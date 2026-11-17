/**
 * Pure view building for the Fresh_Page (Req 9, 11 to 16, 18.3). Runs on the Client and in tests.
 * `buildFreshView` turns one Fresh_Endpoint response plus the chip, mutes and events into
 * everything the page shows, so a chip change or a mute change is one recompute.
 */
import type {
  FreshItemCard,
  FreshPath,
  FreshResponseOk,
  FreshSkillPool,
  PoolCard,
  RankedFreshItem,
  SaveSnapshot,
  SkillMatch,
} from '../types/fresh'
import type { VideoEvent } from '../types/video'
import { checkKeyId, checkKeysForPath, compareCodePoints } from './fresh-keys'
import {
  BEST_MAX,
  MAX_PER_SKILL,
  FRESH_WINDOW_S,
  NEW_BADGE_S,
  NEW_MAX,
  arrangeVariety,
  rankFreshItems,
  tasteAdjustments,
} from './fresh-rank'
import { combineSources, mergeEvents } from './video-events'
import { normalizeText } from './video-normalize'

export type FilterChip =
  | { kind: 'current' }
  | { kind: 'all' }
  | { kind: 'path'; pathId: string }
  | { kind: 'saved' }

export interface FreshViewInput {
  response: FreshResponseOk
  chip: FilterChip
  /** Stored choice; resolved inside (Req 12.4, 14.9). */
  selectedPathId: string | null
  /** Channel id -> latest muted value. */
  mutes: ReadonlyMap<string, boolean>
  /** Merged: cloud rows + local unsent. */
  events: readonly VideoEvent[]
  demo: boolean
}

export interface ChipView {
  /** Stable key: 'current', 'all', 'saved' or 'path:<id>'. */
  key: string
  chip: FilterChip
  label: string
  selected: boolean
}

export type HeroView =
  | { kind: 'fresh'; card: FreshItemCard; match: SkillMatch; skillTitle: string; label: string; isNew: boolean }
  | { kind: 'pool'; card: PoolCard; match: SkillMatch; skillTitle: string; label: string }

export interface NewCardView {
  card: FreshItemCard
  match: SkillMatch
  skillTitle: string
  /** Published less than 24 h before the response time (Req 13.12). */
  isNew: boolean
}

export interface BestCardView {
  card: PoolCard
  match: SkillMatch
  skillTitle: string
}

export interface SavedCardView {
  videoId: string
  snapshot: SaveSnapshot
  /** Combined Saved_Time. */
  savedAt: number | null
  /** Render the thumbnail only when true (Req 18.3). */
  thumbnailAllowed: boolean
}

export interface SourceEntryView {
  channelId: string
  channelName: string
  muted: boolean
}

export interface SourceGroupView {
  /** Normalized hobby, unique per group. */
  key: string
  hobby: string
  /** Empty means "No sources yet for <hobby>." (Req 15.8). */
  entries: SourceEntryView[]
}

export interface FreshView {
  /** The chip actually shown as selected (a hidden or unknown chip falls back to "All skills"). */
  chip: FilterChip
  /** Order and visibility of Req 14.1, 14.10, 11.10. */
  chips: ChipView[]
  /** Req 11.4. */
  headerLabel: string
  /** Req 11.5, 11.6. */
  updatedMs: number | null
  /** Req 12. */
  hero: HeroView | null
  /** Req 16.2. */
  quietLine: boolean
  /** Req 13.1, 13.2, 13.12. */
  newCards: NewCardView[]
  /** Req 13.5, 13.11. */
  bestCards: BestCardView[]
  /** Req 14.6. */
  saved: SavedCardView[]
  /** Req 16.3, 14.7. */
  state: 'content' | 'empty' | 'saved_empty'
  /** Req 15.1, 15.2, 15.7, 15.8. */
  sources: SourceGroupView[]
}

const THUMBNAIL_HOST = 'i.ytimg.com'

/** True only for an `https:` URL whose host is `i.ytimg.com` (Req 18.3). */
export function isAllowedThumbnail(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.host === THUMBNAIL_HOST
  } catch {
    return false
  }
}

/** "just now", "<n>m ago", "<n>h ago" or "<n>d ago", rounded down (Req 11.5). */
export function relativeTime(nowMs: number, checkMs: number): string {
  const seconds = (nowMs - checkMs) / 1000
  if (!(seconds >= 60)) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

/** The stored Selected_Path when it is a response path, else the first path (Req 12.4, 14.9). */
export function resolveSelectedPath(paths: readonly FreshPath[], storedId: string | null): FreshPath | null {
  return paths.find((p) => p.id === storedId) ?? paths[0] ?? null
}

function chipKey(chip: FilterChip): string {
  return chip.kind === 'path' ? `path:${chip.pathId}` : chip.kind
}

function skillTitleOf(path: FreshPath | undefined, skillId: string): string {
  return path?.skills.find((s) => s.id === skillId)?.title ?? ''
}

/**
 * Visible chips in order (Req 14.1): "All skills", "For <current skill>" (hidden without a
 * Current_Skill, Req 14.10), one per path, "Saved" (hidden in Demo_Mode, Req 11.10).
 */
export function freshChips(
  paths: readonly FreshPath[],
  selected: FreshPath | null,
  demo: boolean,
): { chip: FilterChip; label: string }[] {
  if (paths.length === 0) return []
  const out: { chip: FilterChip; label: string }[] = [{ chip: { kind: 'all' }, label: 'All skills' }]
  if (selected && selected.currentSkillId !== null) {
    out.push({ chip: { kind: 'current' }, label: `For ${skillTitleOf(selected, selected.currentSkillId)}` })
  }
  for (const p of paths) out.push({ chip: { kind: 'path', pathId: p.id }, label: p.hobby })
  if (!demo) out.push({ chip: { kind: 'saved' }, label: 'Saved' })
  return out
}

/** Header filter label (Req 11.4). */
export function headerLabel(chip: FilterChip, paths: readonly FreshPath[], selected: FreshPath | null): string {
  switch (chip.kind) {
    case 'current':
      return selected?.hobby ?? ''
    case 'all':
      return paths.length === 1 ? paths[0]!.hobby : 'All hobbies'
    case 'path':
      return paths.find((p) => p.id === chip.pathId)?.hobby ?? ''
    case 'saved':
      return 'Saved'
  }
}

/** Paths whose Check_Keys count for the "Updated" time (Req 11.5). */
function pathsInScope(chip: FilterChip, paths: readonly FreshPath[], selected: FreshPath | null): FreshPath[] {
  if (chip.kind === 'current') return selected ? [selected] : []
  if (chip.kind === 'path') return paths.filter((p) => p.id === chip.pathId)
  return [...paths]
}

/** Latest last successful check time of the Check_Keys of the given paths, or null (Req 11.5, 11.6). */
export function freshUpdatedMs(response: FreshResponseOk, scopePaths: readonly FreshPath[]): number | null {
  const ids = new Set<string>()
  for (const p of scopePaths) for (const k of checkKeysForPath(p.hobby, response.language)) ids.add(checkKeyId(k))
  let latest: number | null = null
  for (const t of response.checkTimes) {
    if (!Number.isFinite(t.lastSuccessMs)) continue
    if (!ids.has(checkKeyId({ hobby: normalizeText(t.hobby), language: t.language }))) continue
    if (latest === null || t.lastSuccessMs > latest) latest = t.lastSuccessMs
  }
  return latest
}

function isMuted(mutes: ReadonlyMap<string, boolean>, channelId: string | null): boolean {
  return channelId !== null && mutes.get(channelId) === true
}

/**
 * Hero_Card choice (Req 12.1, 12.2, 12.7, decision D7): the first ranked in-scope Fresh_Item, else the
 * first non-muted pool video of the Hero_Path's Current_Skill, else none. `ranked` is already
 * filtered for scope, mutes and the 7-day window.
 */
export function chooseHero(args: {
  ranked: readonly RankedFreshItem[]
  heroPath: FreshPath | null
  paths: ReadonlyMap<string, FreshPath>
  pools: readonly FreshSkillPool[]
  mutes: ReadonlyMap<string, boolean>
  nowMs: number
}): HeroView | null {
  const first = args.ranked[0]
  if (first) {
    const skillTitle = skillTitleOf(args.paths.get(first.match.pathId), first.match.skillId)
    return {
      kind: 'fresh',
      card: first.item,
      match: first.match,
      skillTitle,
      label: `New for ${skillTitle}`,
      isNew: isNewItem(first.item, args.nowMs),
    }
  }
  const path = args.heroPath
  if (!path || path.currentSkillId === null) return null
  const skillId = path.currentSkillId
  const pool = args.pools.find((p) => p.pathId === path.id && p.skillId === skillId)
  const card = pool?.videos.find((v) => !isMuted(args.mutes, v.channelId))
  if (!card) return null
  return {
    kind: 'pool',
    card,
    match: { pathId: path.id, skillId },
    skillTitle: skillTitleOf(path, skillId),
    label: 'Best for your current skill',
  }
}

function isNewItem(item: FreshItemCard, nowMs: number): boolean {
  return nowMs - item.publishedMs < NEW_BADGE_S * 1000
}

/**
 * "Saved" list (Req 14.6): videos whose combined saved value over all sources is true, with a
 * Save_Snapshot on the `feed` record and a non-muted snapshot channel; Saved_Time desc, then id asc.
 */
export function savedCards(events: readonly VideoEvent[], mutes: ReadonlyMap<string, boolean>): SavedCardView[] {
  const byVideo = new Map<string, VideoEvent[]>()
  for (const e of events) {
    const list = byVideo.get(e.videoId)
    if (list) list.push(e)
    else byVideo.set(e.videoId, [e])
  }
  const out: SavedCardView[] = []
  for (const [videoId, recs] of byVideo) {
    const combined = combineSources(recs)
    if (!combined?.saved) continue
    const feed = recs.filter((r) => r.source === 'feed')
    const first = feed[0]
    if (!first) continue
    const merged = feed.slice(1).reduce(mergeEvents, first)
    const snapshot = merged.snapshot
    if (!snapshot || isMuted(mutes, snapshot.channelId)) continue
    out.push({ videoId, snapshot, savedAt: combined.savedAt, thumbnailAllowed: isAllowedThumbnail(snapshot.thumbnailUrl) })
  }
  return out.sort((a, b) => {
    const ta = a.savedAt ?? Number.NEGATIVE_INFINITY
    const tb = b.savedAt ?? Number.NEGATIVE_INFINITY
    if (ta !== tb) return tb > ta ? 1 : -1
    return compareCodePoints(a.videoId, b.videoId)
  })
}

/**
 * Sources_Panel groups (Req 15.1, 15.2, 15.7, 15.8): one group per hobby in path-chip order, the
 * Channel_Sources of that hobby's Check_Keys, one entry per channel id, sorted by name
 * case-insensitively then id. Muted channels stay listed with `muted` true.
 */
export function sourceGroups(response: FreshResponseOk, mutes: ReadonlyMap<string, boolean>): SourceGroupView[] {
  const groups: SourceGroupView[] = []
  const seen = new Set<string>()
  for (const p of response.paths) {
    const key = normalizeText(p.hobby)
    if (seen.has(key)) continue
    seen.add(key)
    const keyIds = new Set(checkKeysForPath(p.hobby, response.language).map(checkKeyId))
    const candidates = response.sources
      .filter((s) => keyIds.has(checkKeyId({ hobby: normalizeText(s.hobby), language: s.language })))
      .sort(
        (a, b) =>
          compareCodePoints(a.channelName.toLowerCase(), b.channelName.toLowerCase())
          || compareCodePoints(a.channelId, b.channelId),
      )
    const ids = new Set<string>()
    const entries: SourceEntryView[] = []
    for (const s of candidates) {
      if (ids.has(s.channelId)) continue
      ids.add(s.channelId)
      entries.push({ channelId: s.channelId, channelName: s.channelName, muted: isMuted(mutes, s.channelId) })
    }
    groups.push({ key, hobby: p.hobby, entries })
  }
  return groups
}

/** Path order of the Best_Section: Selected_Path first, then activeAt desc (null last, then response order). */
function bestPathOrder(paths: readonly FreshPath[], selected: FreshPath): FreshPath[] {
  const others = paths
    .map((p, index) => ({ p, index }))
    .filter(({ p }) => p.id !== selected.id)
    .sort((a, b) => {
      const ta = a.p.activeAt
      const tb = b.p.activeAt
      if (ta !== tb) {
        if (ta === null) return 1
        if (tb === null) return -1
        return tb - ta
      }
      return a.index - b.index
    })
    .map(({ p }) => p)
  return [selected, ...others]
}

const EMPTY_TASTE: ReadonlyMap<string, number> = new Map()

export function buildFreshView(input: FreshViewInput): FreshView {
  const { response, mutes, demo } = input
  const paths = response.paths
  const pathMap = new Map<string, FreshPath>(paths.map((p) => [p.id, p]))
  const sources = sourceGroups(response, mutes)

  // 1. Selected_Path and chip resolution (hidden or unknown chips fall back to "All skills").
  const selected = resolveSelectedPath(paths, input.selectedPathId)
  const visible = freshChips(paths, selected, demo)
  const requested = chipKey(input.chip)
  const chip: FilterChip = visible.find((c) => chipKey(c.chip) === requested)?.chip ?? { kind: 'all' }
  const chips: ChipView[] = visible.map((c) => ({
    key: chipKey(c.chip),
    chip: c.chip,
    label: c.label,
    selected: chipKey(c.chip) === chipKey(chip),
  }))
  const label = headerLabel(chip, paths, selected)
  const updatedMs = freshUpdatedMs(response, pathsInScope(chip, paths, selected))
  const saved = demo ? [] : savedCards(input.events, mutes)

  if (!selected) {
    return { chip, chips, headerLabel: label, updatedMs, hero: null, quietLine: false, newCards: [], bestCards: [], saved, state: 'empty', sources }
  }
  if (chip.kind === 'saved') {
    return {
      chip, chips, headerLabel: label, updatedMs, hero: null, quietLine: false, newCards: [], bestCards: [], saved,
      state: saved.length === 0 ? 'saved_empty' : 'content', sources,
    }
  }

  const heroPath = chip.kind === 'path' ? (pathMap.get(chip.pathId) ?? null) : selected

  // 2. Scope: Skills shown under the chip, and pool Skills (as pathId -> ordered skill ids).
  const skillScope = new Set<string>()
  const poolScope: { path: FreshPath; skillIds: string[] }[] = []
  const scopeKey = (pathId: string, skillId: string): string => JSON.stringify([pathId, skillId])
  if (chip.kind === 'current') {
    if (selected.currentSkillId !== null) {
      skillScope.add(scopeKey(selected.id, selected.currentSkillId))
      poolScope.push({ path: selected, skillIds: [selected.currentSkillId] })
    }
  } else {
    const scoped = chip.kind === 'path' ? paths.filter((p) => p.id === chip.pathId) : paths
    for (const p of scoped) for (const s of p.skills) skillScope.add(scopeKey(p.id, s.id))
    const scopedIds = new Set(scoped.map((p) => p.id))
    for (const p of bestPathOrder(paths, selected)) {
      if (scopedIds.has(p.id)) poolScope.push({ path: p, skillIds: [...p.windowSkillIds] })
    }
  }

  // 3. Fresh_Items in scope, not muted, published within 7 days; ranked on in-scope matches only.
  const minPublished = response.nowMs - FRESH_WINDOW_S * 1000
  const inScope: FreshItemCard[] = []
  for (const item of response.items) {
    if (isMuted(mutes, item.channelId)) continue
    if (!(item.publishedMs > minPublished)) continue
    const matches = item.matches.filter((m) => skillScope.has(scopeKey(m.pathId, m.skillId)))
    if (matches.length > 0) inScope.push({ ...item, matches })
  }
  const taste = demo ? EMPTY_TASTE : tasteAdjustments(input.events, channelLookup(response))
  const rankedAll = rankFreshItems(inScope, { nowMs: response.nowMs, paths: pathMap, selectedPathId: selected.id, taste })
  const seenRanked = new Set<string>()
  const ranked = rankedAll.filter((r) => {
    if (seenRanked.has(r.item.videoId)) return false
    seenRanked.add(r.item.videoId)
    return true
  })

  // 4. Hero_Card.
  const hero = chooseHero({ ranked, heroPath, paths: pathMap, pools: response.pools, mutes, nowMs: response.nowMs })
  const heroId = hero?.card.videoId ?? null

  // Skill cap (decision D17): under "All skills" and the path chips a Skill holds at most
  // MAX_PER_SKILL cards on the page, counted in display order: Hero_Card, New_Section, Best_Section.
  const capped = chip.kind !== 'current'
  const perSkill = new Map<string, number>()
  const hasRoom = (match: SkillMatch): boolean =>
    !capped || (perSkill.get(scopeKey(match.pathId, match.skillId)) ?? 0) < MAX_PER_SKILL
  const count = (match: SkillMatch): void => {
    const key = scopeKey(match.pathId, match.skillId)
    perSkill.set(key, (perSkill.get(key) ?? 0) + 1)
  }
  if (hero) count(hero.match)

  // 5. New_Section.
  const newRanked: NewCardView[] = []
  for (const r of ranked) {
    if (newRanked.length >= NEW_MAX) break
    if (r.item.videoId === heroId || !hasRoom(r.match)) continue
    count(r.match)
    newRanked.push({
      card: r.item,
      match: r.match,
      skillTitle: skillTitleOf(pathMap.get(r.match.pathId), r.match.skillId),
      isNew: isNewItem(r.item, response.nowMs),
    })
  }
  const newCards = arrangeVariety(newRanked, (c) => c.card.channelId).cards

  // 6. Best_Section: per path, per window Skill, pool order; no taste involved (Req 9.9).
  const taken = new Set<string>(newCards.map((c) => c.card.videoId))
  if (heroId !== null) taken.add(heroId)
  const poolMap = new Map<string, PoolCard[]>()
  for (const pool of response.pools) {
    const key = scopeKey(pool.pathId, pool.skillId)
    if (!poolMap.has(key)) poolMap.set(key, pool.videos)
  }
  const bestRanked: BestCardView[] = []
  outer: for (const { path, skillIds } of poolScope) {
    for (const skillId of skillIds) {
      const videos = poolMap.get(scopeKey(path.id, skillId)) ?? []
      for (const card of videos) {
        if (bestRanked.length >= BEST_MAX) break outer
        const match = { pathId: path.id, skillId }
        if (!hasRoom(match)) break
        if (taken.has(card.videoId) || isMuted(mutes, card.channelId)) continue
        taken.add(card.videoId)
        count(match)
        bestRanked.push({ card, match, skillTitle: skillTitleOf(path, skillId) })
      }
    }
  }
  const bestCards = arrangeVariety(bestRanked, (c) => c.card.channelId).cards

  // 8. States (Req 16.2, 16.3).
  const freshShown = hero?.kind === 'fresh' || newCards.length > 0
  const poolShown = hero?.kind === 'pool' || bestCards.length > 0
  const state: FreshView['state'] = hero === null && newCards.length === 0 && bestCards.length === 0 ? 'empty' : 'content'

  return {
    chip,
    chips,
    headerLabel: label,
    updatedMs,
    hero,
    quietLine: !freshShown && poolShown,
    newCards,
    bestCards,
    saved,
    state,
    sources,
  }
}

/** Channel id of a video from the returned items and pools (taste, Req 9.8). */
function channelLookup(response: FreshResponseOk): (videoId: string) => string | null {
  const map = new Map<string, string>()
  for (const item of response.items) if (item.channelId !== null && !map.has(item.videoId)) map.set(item.videoId, item.channelId)
  for (const pool of response.pools) {
    for (const v of pool.videos) if (v.channelId !== null && !map.has(v.videoId)) map.set(v.videoId, v.channelId)
  }
  return (videoId) => map.get(videoId) ?? null
}
