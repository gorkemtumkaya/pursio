/**
 * Pure view building for the Fresh_Page (spec: fresh-v2, Req 1 to 5, 8, 10; spec: fresh, Req 9,
 * 14.6, 18.3). Runs on the Client and in tests. `buildFreshView` turns one Fresh_Endpoint
 * response plus the chip, mutes and events into everything the page shows, so a chip change or
 * a mute change is one recompute and sends no request.
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
import type { ColorSlot } from './color-slot'
import { checkKeyId, checkKeysForPath, compareCodePoints } from './fresh-keys'
import {
  FRESH_WINDOW_S,
  MAX_PER_SKILL,
  NEW_BADGE_S,
  SECTION_MAX,
  arrangeVariety,
  rankFreshItems,
  tasteAdjustments,
} from './fresh-rank'
import { combineSources, mergeEvents } from './video-events'
import { normalizeText } from './video-normalize'

export type FilterChip = { kind: 'all' } | { kind: 'path'; pathId: string } | { kind: 'saved' }

export interface FreshViewInput {
  response: FreshResponseOk
  chip: FilterChip
  /** Channel id -> latest muted value. */
  mutes: ReadonlyMap<string, boolean>
  /** Merged: cloud rows + local unsent. */
  events: readonly VideoEvent[]
  demo: boolean
}

export interface ChipView {
  /** Stable key: 'all', 'saved' or 'path:<id>'. */
  key: string
  chip: FilterChip
  label: string
  selected: boolean
  /** Hobby_Chips only: the path's Color_Slot, for the dot (Req 2.3). */
  colorSlot: ColorSlot | null
  /** Hobby_Chips only: the path's Shown_New_Items; 0 shows no badge (Req 2.4). */
  newCount: number
}

export type HeroBadge = 'today' | 'week' | 'best'

/** The path a Hero_Card belongs to, for its tag (Req 3.3). */
export interface HeroPathView {
  pathId: string
  hobby: string
  letter: string
  colorSlot: ColorSlot
}

export type HeroView =
  | {
      kind: 'fresh'
      card: FreshItemCard
      match: SkillMatch
      skillTitle: string
      isCurrentSkill: boolean
      badge: 'today' | 'week'
      path: HeroPathView
    }
  | {
      kind: 'pool'
      card: PoolCard
      match: SkillMatch
      skillTitle: string
      isCurrentSkill: true
      badge: 'best'
      path: HeroPathView
    }

/** `current`: the path's Current_Skill. `next`: another Skill of its Current_Window. `other`: the rest (Req 5.4). */
export type SkillTagKind = 'current' | 'next' | 'other'

export type SectionCardView =
  | {
      kind: 'fresh'
      card: FreshItemCard
      match: SkillMatch
      skillTitle: string
      tag: SkillTagKind
      /** Published less than 24 h before the response time (decision 4). */
      isNew: boolean
    }
  | { kind: 'pool'; card: PoolCard; match: SkillMatch; skillTitle: string; tag: SkillTagKind }

export interface HobbySectionView {
  pathId: string
  hobby: string
  /** First letter of the hobby, upper-cased, for the avatar (Req 4.2). */
  letter: string
  colorSlot: ColorSlot
  /** Null for a finished path (Req 4.8). */
  currentSkillTitle: string | null
  completedCount: number
  totalCount: number
  /** Shown_New_Items of the path, the Hero_Card video included (Req 4.4, D-A). */
  newCount: number
  /** `finished`: no Current_Skill. `empty`: a Current_Skill and no card left (Req 4.8, 4.9). */
  state: 'cards' | 'finished' | 'empty'
  cards: SectionCardView[]
}

/** "<videos> new videos today across <hobbies> hobbies" (Req 1.4). */
export interface NewToday {
  videos: number
  hobbies: number
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
  /** The path id; unique per group. */
  key: string
  pathId: string
  hobby: string
  colorSlot: ColorSlot
  /** Empty means "none yet": the group cannot open (Req 8.5). */
  entries: SourceEntryView[]
}

export interface FreshView {
  /** The chip actually shown as selected (a hidden or unknown chip falls back to "All hobbies"). */
  chip: FilterChip
  /** Req 2.1, 2.6, 2.9. */
  chips: ChipView[]
  /** Req 1.2. */
  updatedMs: number | null
  /** Null hides the header text (Req 1.5). */
  newToday: NewToday | null
  /** Req 3. */
  hero: HeroView | null
  /** One per path in Scope, in Path_Order (Req 4.1). Empty under "Saved". */
  sections: HobbySectionView[]
  /** Req 10.2. */
  quietLine: boolean
  /** Req 10.3, 2.7. */
  state: 'content' | 'empty' | 'saved_empty'
  /** `fresh` Req 14.6. */
  saved: SavedCardView[]
  /** One group per path in Path_Order, whichever chip is selected (Req 8.2). */
  sources: SourceGroupView[]
  /** The group to open when the page opens or a chip is selected, or null (Req 8.3). */
  defaultOpenSource: string | null
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


function chipKey(chip: FilterChip): string {
  return chip.kind === 'path' ? `path:${chip.pathId}` : chip.kind
}

function skillTitleOf(path: FreshPath | undefined, skillId: string): string {
  return path?.skills.find((s) => s.id === skillId)?.title ?? ''
}

/** Avatar letter: the first code point of the trimmed hobby, upper-cased; "?" for an empty hobby (Req 4.2). */
export function hobbyLetter(hobby: string): string {
  const first = [...hobby.trim()][0]
  return first === undefined ? '?' : first.toLocaleUpperCase()
}

/**
 * Path_Order (Req 2.2, decision 8): `activeAt` descending; paths with no Active_Time come
 * after, in response order. Equal times keep response order.
 */
export function pathOrder(paths: readonly FreshPath[]): FreshPath[] {
  return paths
    .map((p, index) => ({ p, index }))
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
}

/**
 * Visible chips in order (Req 2.1, 2.6): "All hobbies", one Hobby_Chip per path in Path_Order
 * only when there are 2 or more paths, then "Saved" (hidden in Demo_Mode, Req 11.1).
 * `ordered` is already in Path_Order.
 */
export function freshChips(ordered: readonly FreshPath[], demo: boolean): { chip: FilterChip; label: string }[] {
  const out: { chip: FilterChip; label: string }[] = [{ chip: { kind: 'all' }, label: 'All hobbies' }]
  if (ordered.length >= 2) {
    for (const p of ordered) out.push({ chip: { kind: 'path', pathId: p.id }, label: p.hobby })
  }
  if (!demo) out.push({ chip: { kind: 'saved' }, label: 'Saved' })
  return out
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
 * Sources_Panel groups (Req 8.2; `fresh` Req 15.1, 15.2, 15.7): one group per path in
 * Path_Order, the Channel_Sources of that hobby's Check_Keys, one entry per channel id, sorted
 * by name case-insensitively then id. Muted channels stay listed with `muted` true.
 */
export function sourceGroups(
  response: FreshResponseOk,
  mutes: ReadonlyMap<string, boolean>,
  ordered: readonly FreshPath[] = pathOrder(response.paths),
): SourceGroupView[] {
  const groups: SourceGroupView[] = []
  const seen = new Set<string>()
  for (const p of ordered) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
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
    groups.push({ key: p.id, pathId: p.id, hobby: p.hobby, colorSlot: p.colorSlot, entries })
  }
  return groups
}

function heroPathOf(path: FreshPath): HeroPathView {
  return { pathId: path.id, hobby: path.hobby, letter: hobbyLetter(path.hobby), colorSlot: path.colorSlot }
}

/**
 * Hero_Card choice across the given paths (Req 3.1, 3.2, 3.4, 3.6, decision 6):
 * - the first ranked item whose matched path is one of `paths` and has a Current_Skill, with
 *   badge `today` under 24 h, else `week`;
 * - else, for each of `paths` in order with a Current_Skill, the first pool video of that
 *   Current_Skill whose channel is not muted, with badge `best`;
 * - else none.
 * `ranked` is already filtered for mutes and the 7-day window. `paths` is in Path_Order.
 */
export function chooseHeroAcross(
  ranked: readonly RankedFreshItem[],
  paths: readonly FreshPath[],
  pools: readonly FreshSkillPool[],
  mutes: ReadonlyMap<string, boolean>,
  nowMs: number,
): HeroView | null {
  const scoped = new Map<string, FreshPath>()
  for (const p of paths) if (p.currentSkillId !== null && !scoped.has(p.id)) scoped.set(p.id, p)

  for (const r of ranked) {
    const path = scoped.get(r.match.pathId)
    if (!path) continue
    return {
      kind: 'fresh',
      card: r.item,
      match: r.match,
      skillTitle: skillTitleOf(path, r.match.skillId),
      isCurrentSkill: r.match.skillId === path.currentSkillId,
      badge: isNewItem(r.item, nowMs) ? 'today' : 'week',
      path: heroPathOf(path),
    }
  }
  for (const path of scoped.values()) {
    const skillId = path.currentSkillId
    if (skillId === null) continue
    const pool = pools.find((p) => p.pathId === path.id && p.skillId === skillId)
    const card = pool?.videos.find((v) => !isMuted(mutes, v.channelId))
    if (!card) continue
    return {
      kind: 'pool',
      card,
      match: { pathId: path.id, skillId },
      skillTitle: skillTitleOf(path, skillId),
      isCurrentSkill: true,
      badge: 'best',
      path: heroPathOf(path),
    }
  }
  return null
}

const skillKey = (pathId: string, skillId: string): string => JSON.stringify([pathId, skillId])

function tagOf(path: FreshPath, skillId: string): SkillTagKind {
  if (skillId === path.currentSkillId) return 'current'
  return path.windowSkillIds.includes(skillId) ? 'next' : 'other'
}

/** One built Hobby_Section with the card order before the variety rule, for tests (D-B). */
export interface SectionBuild {
  section: HobbySectionView
  /** Fresh_Items in rank order, then Video_Pool cards in Current_Window order. */
  beforeVariety: SectionCardView[]
  /** Index in `section.cards` from which cards that never fit the variety rule sit. */
  tailStart: number
}

export interface BuildSectionsInput {
  /** The paths to build, in Path_Order. */
  paths: readonly FreshPath[]
  /** Shown_Items of every path with a Current_Skill, in rank order, one per video id. */
  ranked: readonly RankedFreshItem[]
  hero: HeroView | null
  pools: readonly FreshSkillPool[]
  mutes: ReadonlyMap<string, boolean>
  nowMs: number
  /**
   * The New_Items a section may show, or null for any. Under a Hobby_Chip this is the set
   * shown under "All hobbies", so a "new" count is the same under both chips (D-A).
   */
  allowedNew?: ReadonlySet<string> | null
}

/**
 * Hobby_Sections (Req 4, 5). For each path in order: its Shown_Items in rank order, then the
 * Video_Pool videos of its Current_Window in window order, ranked inside each Skill. A video
 * id shows once on the page: the Hero_Card first, then sections in order. One Skill holds at
 * most 3 cards across the Hero_Card and all sections, counted in that order, and a section at
 * most 12 (Req 5.5). The variety rule then runs over the whole section (Req 5.6, D-B).
 *
 * A video that is a Shown_Item is never taken as a Video_Pool card, so a new video always
 * shows as a new video. A path with no Current_Skill gives `finished` and no cards, and its
 * Fresh_Items show nowhere (Req 4.8, AS3); `ranked` holds none of them.
 */
export function buildSections(input: BuildSectionsInput): SectionBuild[] {
  const { hero, mutes, nowMs } = input
  const allowedNew = input.allowedNew ?? null
  const heroId = hero?.card.videoId ?? null
  const used = new Set<string>()
  if (heroId !== null) used.add(heroId)
  const freshIds = new Set(input.ranked.map((r) => r.item.videoId))

  const perSkill = new Map<string, number>()
  const hasRoom = (match: SkillMatch): boolean =>
    (perSkill.get(skillKey(match.pathId, match.skillId)) ?? 0) < MAX_PER_SKILL
  const count = (match: SkillMatch): void => {
    const key = skillKey(match.pathId, match.skillId)
    perSkill.set(key, (perSkill.get(key) ?? 0) + 1)
  }
  if (hero) count(hero.match)

  const poolMap = new Map<string, PoolCard[]>()
  for (const pool of input.pools) {
    const key = skillKey(pool.pathId, pool.skillId)
    if (!poolMap.has(key)) poolMap.set(key, pool.videos)
  }

  const out: SectionBuild[] = []
  for (const path of input.paths) {
    const cards: SectionCardView[] = []
    if (path.currentSkillId !== null) {
      // 1. The path's Shown_Items, in rank order.
      for (const r of input.ranked) {
        if (cards.length >= SECTION_MAX) break
        if (r.match.pathId !== path.id) continue
        const id = r.item.videoId
        if (used.has(id)) continue
        const isNew = isNewItem(r.item, nowMs)
        if (isNew && allowedNew !== null && !allowedNew.has(id)) continue
        if (!hasRoom(r.match)) continue
        used.add(id)
        count(r.match)
        cards.push({
          kind: 'fresh',
          card: r.item,
          match: r.match,
          skillTitle: skillTitleOf(path, r.match.skillId),
          tag: tagOf(path, r.match.skillId),
          isNew,
        })
      }
      // 2. Video_Pool videos of the Current_Window, Current_Skill first.
      fill: for (const skillId of path.windowSkillIds) {
        const match: SkillMatch = { pathId: path.id, skillId }
        for (const card of poolMap.get(skillKey(path.id, skillId)) ?? []) {
          if (cards.length >= SECTION_MAX) break fill
          if (!hasRoom(match)) break
          if (used.has(card.videoId) || freshIds.has(card.videoId) || isMuted(mutes, card.channelId)) continue
          used.add(card.videoId)
          count(match)
          cards.push({ kind: 'pool', card, match, skillTitle: skillTitleOf(path, skillId), tag: tagOf(path, skillId) })
        }
      }
    }
    const arranged = arrangeVariety(cards, (c) => c.card.channelId)
    const heroIsNewHere = hero?.kind === 'fresh' && hero.badge === 'today' && hero.match.pathId === path.id
    const total = path.skills.length
    out.push({
      beforeVariety: cards,
      tailStart: arranged.tailStart,
      section: {
        pathId: path.id,
        hobby: path.hobby,
        letter: hobbyLetter(path.hobby),
        colorSlot: path.colorSlot,
        currentSkillTitle: path.currentSkillId === null ? null : skillTitleOf(path, path.currentSkillId),
        completedCount: Math.min(total, Math.max(0, path.completedCount)),
        totalCount: total,
        newCount: arranged.cards.filter((c) => c.kind === 'fresh' && c.isNew).length + (heroIsNewHere ? 1 : 0),
        state: path.currentSkillId === null ? 'finished' : arranged.cards.length === 0 ? 'empty' : 'cards',
        cards: arranged.cards,
      },
    })
  }
  return out
}

const EMPTY_TASTE: ReadonlyMap<string, number> = new Map()

/** Video ids of the New_Items a build shows: the Hero_Card (when new) and the `isNew` cards. */
function shownNewIds(hero: HeroView | null, sections: readonly HobbySectionView[]): Set<string> {
  const ids = new Set<string>()
  if (hero?.kind === 'fresh' && hero.badge === 'today') ids.add(hero.card.videoId)
  for (const section of sections) {
    for (const c of section.cards) if (c.kind === 'fresh' && c.isNew) ids.add(c.card.videoId)
  }
  return ids
}

/** The view plus each shown section's build details (card order before the variety rule). */
export function buildFreshViewDetails(input: FreshViewInput): { view: FreshView; builds: SectionBuild[] } {
  const { response, mutes, demo } = input
  const nowMs = response.nowMs

  // 1. Path_Order, used by the chips, the sections and the Sources_Panel alike (Req 2.2).
  // A repeated path id keeps its first entry, so every list is keyed by a unique id.
  const seenPaths = new Set<string>()
  const ordered = pathOrder(
    response.paths.filter((p) => {
      if (seenPaths.has(p.id)) return false
      seenPaths.add(p.id)
      return true
    }),
  )
  const sources = sourceGroups(response, mutes, ordered)
  const firstOpenable = sources.find((g) => g.entries.length > 0)?.key ?? null

  // 2. Chips; a hidden or unknown chip falls back to "All hobbies" (Req 2.9).
  const visible = freshChips(ordered, demo)
  const requested = chipKey(input.chip)
  const chip: FilterChip = visible.find((c) => chipKey(c.chip) === requested)?.chip ?? { kind: 'all' }
  const chipPath = chip.kind === 'path' ? (ordered.find((p) => p.id === chip.pathId) ?? null) : null

  // 3. Shown_Items: matched to a path with a Current_Skill (AS3), not muted, under 7 days.
  // Ranked once; each item keeps its best match, so it belongs to exactly one path.
  const scoped = new Map<string, FreshPath>()
  for (const p of ordered) if (p.currentSkillId !== null && !scoped.has(p.id)) scoped.set(p.id, p)
  const minPublished = nowMs - FRESH_WINDOW_S * 1000
  const candidates = response.items.filter((item) => !isMuted(mutes, item.channelId) && item.publishedMs > minPublished)
  const taste = demo ? EMPTY_TASTE : tasteAdjustments(input.events, channelLookup(response))
  const seenRanked = new Set<string>()
  const ranked = rankFreshItems(candidates, {
    nowMs,
    paths: scoped,
    selectedPathId: ordered[0]?.id ?? '',
    taste,
  }).filter((r) => {
    if (seenRanked.has(r.item.videoId)) return false
    seenRanked.add(r.item.videoId)
    return true
  })

  // 4. The "All hobbies" pass. Every "new" count comes from it (D-A).
  const allHero = chooseHeroAcross(ranked, ordered, response.pools, mutes, nowMs)
  const allBuilds = buildSections({ paths: ordered, ranked, hero: allHero, pools: response.pools, mutes, nowMs })
  const newCountOf = new Map<string, number>(allBuilds.map((b) => [b.section.pathId, b.section.newCount]))

  // 5. Chip views with the badges of the "All hobbies" pass (Req 2.4).
  const chips: ChipView[] = visible.map((c) => {
    const pathId = c.chip.kind === 'path' ? c.chip.pathId : null
    const path = pathId === null ? undefined : ordered.find((p) => p.id === pathId)
    return {
      key: chipKey(c.chip),
      chip: c.chip,
      label: c.label,
      selected: chipKey(c.chip) === chipKey(chip),
      colorSlot: path?.colorSlot ?? null,
      newCount: path ? (newCountOf.get(path.id) ?? 0) : 0,
    }
  })

  const updatedMs = freshUpdatedMs(response, chipPath ? [chipPath] : ordered)
  const saved = demo ? [] : savedCards(input.events, mutes)
  const base = { chip, chips, updatedMs, saved, sources }

  // 6. "Saved": the list only, no Hero_Card and no section (Req 2.7, 3.6).
  if (chip.kind === 'saved') {
    const view: FreshView = {
      ...base,
      newToday: null,
      hero: null,
      sections: [],
      quietLine: false,
      state: saved.length === 0 ? 'saved_empty' : 'content',
      defaultOpenSource: firstOpenable,
    }
    return { view, builds: [] }
  }

  // 7. Selected scope. A Hobby_Chip shows its path's hero and its one section, rebuilt with
  // that hero. It may show only the New_Items shown under "All hobbies", and its "new" count
  // stays the one of that pass, so the badge is the same under both chips (D-A).
  let hero = allHero
  let builds = allBuilds
  if (chipPath) {
    hero = chooseHeroAcross(ranked, [chipPath], response.pools, mutes, nowMs)
    const allowedNew = shownNewIds(
      allHero,
      allBuilds.map((b) => b.section),
    )
    builds = buildSections({ paths: [chipPath], ranked, hero, pools: response.pools, mutes, nowMs, allowedNew }).map(
      (b) => ({ ...b, section: { ...b.section, newCount: newCountOf.get(chipPath.id) ?? 0 } }),
    )
  }
  const sections = builds.map((b) => b.section)

  // 8. Header counts (Req 1.4, 1.5).
  const videos = shownNewIds(hero, sections).size
  const hobbies = sections.filter((s) => s.newCount > 0).length
  const newToday: NewToday | null = videos > 0 ? { videos, hobbies } : null

  // 9. States (Req 10.2, 10.3).
  const cards = sections.flatMap((s) => s.cards)
  const freshShown = hero?.kind === 'fresh' || cards.some((c) => c.kind === 'fresh')
  const poolShown = hero?.kind === 'pool' || cards.some((c) => c.kind === 'pool')
  const state: FreshView['state'] = hero === null && cards.length === 0 ? 'empty' : 'content'

  // 10. The Sources_Panel default (Req 8.3): the selected Hobby_Chip's group, else the first
  // group. A group with no channel cannot open (Req 8.5).
  let defaultOpenSource = firstOpenable
  if (chipPath) {
    const group = sources.find((g) => g.pathId === chipPath.id)
    defaultOpenSource = group && group.entries.length > 0 ? group.key : null
  }

  const view: FreshView = {
    ...base,
    newToday,
    hero,
    sections,
    quietLine: !freshShown && poolShown,
    state,
    defaultOpenSource,
  }
  return { view, builds }
}

export function buildFreshView(input: FreshViewInput): FreshView {
  return buildFreshViewDetails(input).view
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
