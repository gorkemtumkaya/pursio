/**
 * In-memory FreshStore with an injected clock, for tests. It mirrors the SQL functions of
 * `20261112000000_fresh_tables.sql` and shares the lease, pool and quota maps of an
 * `InMemoryPipelineStore`, so the Fresh Lease lives in the same lease table as Run_Leases,
 * the Skill titles and page pools come from the same pools, and one Daily_Quota is shared.
 * Every pool stored through the pipeline store runs `refreshSources` for its Check_Key in the
 * same "transaction": a failing refresh rolls the pool store back (Req 1.6).
 */
import type { CheckKey, FreshCheckTime, FreshSource } from '../../../shared/types/fresh'
import type { PoolVideo, VideoPool } from '../../../shared/types/video'
import { checkKeyId, compareCodePoints, freshLeaseKey } from '../../../shared/utils/fresh-keys'
import {
  InMemoryPipelineStore,
  type PipelineMemoryState,
} from '../video/pipeline-store-memory'
import {
  FRESH_LEASE_S,
  FRESH_PAGE_WINDOW_S,
  FRESH_RETENTION_S,
  PAGE_READ_MAX_KEYS,
  PAGE_READ_MAX_POOL_KEYS,
  SKILL_TITLES_LIMIT,
  type FreshItemInsert,
  type FreshItemRow,
  type FreshStore,
  type PageRead,
  type StoreCheckInput,
  type StoreCheckOutcome,
} from './check-store'
import { ACTIVE_PATH_S, type DueState } from './schedule'
import { rankChannelSources, refreshSources, type ChannelSourceRow } from './sources'

/** A `paths` row joined with its progress and profile, as `fresh_active_hobbies` sees it. */
export interface MemoryPathRow {
  hobby: string
  /** `profiles.language` as stored, null included. */
  language: string | null
  archived: boolean
  lastOpenedMs: number | null
  progressUpdatedMs: number | null
}

/** One `fresh_check_state` row. */
export interface MemoryCheckState {
  lastSuccessMs: number | null
  lastAttemptMs: number | null
}

/** The Fresh tables, keyed by `checkKeyId`. */
interface FreshMemoryState {
  sources: Map<string, ChannelSourceRow[]>
  /** checkKeyId -> video id -> item. */
  items: Map<string, Map<string, FreshItemRow>>
  checkState: Map<string, MemoryCheckState>
  paths: MemoryPathRow[]
  /** Pool stores whose Channel_Source upkeep fails next (test control). */
  failSourcesRefresh: number
}

/** One set of Fresh tables per shared pipeline state, like one database. */
const freshStates = new WeakMap<PipelineMemoryState, FreshMemoryState>()

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const LEVELS: ReadonlySet<string> = new Set(['beginner', 'intermediate', 'advanced'])

function charLength(text: string): number {
  return Array.from(text).length
}

/** `[hobby, skill, level, language]` parts of a Pool_Key, like `video_pool_store`, or null. */
function poolKeyParts(poolKey: string): { hobby: string; skill: string; language: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(poolKey)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) return null
  const [hobby, skill, , language] = parsed as unknown[]
  if (typeof hobby !== 'string' || typeof skill !== 'string' || typeof language !== 'string') return null
  return { hobby, skill, language }
}

/** The check constraints of `fresh_items`; a violation raises in SQL. */
function assertValidItem(item: FreshItemInsert): void {
  const valid =
    VIDEO_ID_RE.test(item.videoId) &&
    typeof item.skillNorm === 'string' &&
    LEVELS.has(item.level) &&
    charLength(item.channelId) >= 1 &&
    charLength(item.channelId) <= 64 &&
    typeof item.video === 'object' &&
    item.video !== null &&
    charLength(item.why) >= 1 &&
    charLength(item.why) <= 120 &&
    Number.isSafeInteger(item.publishedMs)
  if (!valid) throw new Error('check_violation')
}

function cloneSource(row: ChannelSourceRow): ChannelSourceRow {
  return { ...row }
}

function cloneItem(row: FreshItemRow): FreshItemRow {
  return { ...row, video: { ...row.video } }
}

type FreshMethod = keyof FreshStore

export class InMemoryFreshStore implements FreshStore {
  /** The pipeline store whose lease, pool and quota maps this store shares. */
  readonly pipeline: InMemoryPipelineStore
  private readonly shared: PipelineMemoryState
  private readonly fresh: FreshMemoryState
  private readonly failures = new Map<FreshMethod, number>()

  /**
   * Called inside `storeCheck` after the writes and before the second deadline check, like
   * time passing during the transaction. Tests use it to move the clock past the deadline.
   */
  duringStore: (() => void) | null = null

  constructor(
    private readonly now: () => number,
    pipeline?: InMemoryPipelineStore,
  ) {
    this.pipeline = pipeline ?? new InMemoryPipelineStore(now)
    this.shared = this.pipeline.sharedState()
    const existing = freshStates.get(this.shared)
    if (existing) {
      this.fresh = existing
    } else {
      this.fresh = { sources: new Map(), items: new Map(), checkState: new Map(), paths: [], failSourcesRefresh: 0 }
      freshStates.set(this.shared, this.fresh)
      this.shared.poolStoreHooks.push((poolKey, videos, nowMs) => this.refreshOnPoolStore(poolKey, videos, nowMs))
    }
  }

  /** A new store object over the same tables, like a process restart with a persistent database. */
  restart(): InMemoryFreshStore {
    return new InMemoryFreshStore(this.now, this.pipeline.restart())
  }

  // -------------------------------------------------------------------------
  // Test controls and inspection
  // -------------------------------------------------------------------------

  /** The next `times` calls of `method` reject, like a database error. */
  failNext(method: FreshMethod, times = 1): void {
    this.failures.set(method, (this.failures.get(method) ?? 0) + times)
  }

  /** The next `times` pool stores fail in the Channel_Source upkeep and roll back. */
  failSourcesRefresh(times = 1): void {
    this.fresh.failSourcesRefresh += times
  }

  /** Replaces the rows `activeHobbies` reads. */
  setPaths(rows: readonly MemoryPathRow[]): void {
    this.fresh.paths = rows.map((row) => ({ ...row }))
  }

  /** Seeds the Channel_Sources of a key (stored in rank order, cut to 15). */
  setSources(key: CheckKey, rows: readonly ChannelSourceRow[]): void {
    const ranked = rankChannelSources(rows.map(cloneSource))
    if (ranked.length === 0) this.fresh.sources.delete(checkKeyId(key))
    else this.fresh.sources.set(checkKeyId(key), ranked)
  }

  /** Seeds one stored Fresh_Item, replacing any item with the same key and video id. */
  putItem(row: FreshItemRow): void {
    assertValidItem(row)
    this.itemsOf({ hobby: row.hobby, language: row.language }).set(row.videoId, cloneItem(row))
  }

  /** Seeds the check state of a key. */
  setCheckState(key: CheckKey, state: MemoryCheckState): void {
    this.fresh.checkState.set(checkKeyId(key), { ...state })
  }

  /** Stored items of a key ordered by video id, or of every key when omitted. */
  storedItems(key?: CheckKey): FreshItemRow[] {
    const maps = key ? [this.fresh.items.get(checkKeyId(key))] : [...this.fresh.items.values()]
    return maps
      .flatMap((m) => (m ? [...m.values()] : []))
      .sort((a, b) => compareKeys(a, b) || compareCodePoints(a.videoId, b.videoId))
      .map(cloneItem)
  }

  /** Check state of a key; both times null when never set. */
  checkStateOf(key: CheckKey): MemoryCheckState {
    const row = this.fresh.checkState.get(checkKeyId(key))
    return { lastSuccessMs: row?.lastSuccessMs ?? null, lastAttemptMs: row?.lastAttemptMs ?? null }
  }

  /** The Lease row of a key in the shared lease table, or null. */
  leaseOf(key: CheckKey): { runId: string; takenAt: number } | null {
    const lease = this.shared.leases.get(freshLeaseKey(key))
    return lease ? { ...lease } : null
  }

  // -------------------------------------------------------------------------
  // FreshStore
  // -------------------------------------------------------------------------

  async cleanup(): Promise<number> {
    this.maybeFail('cleanup')
    const cutoff = this.now() - FRESH_RETENTION_S * 1000
    let deleted = 0
    for (const [id, items] of this.fresh.items) {
      for (const [videoId, item] of items) {
        if (item.foundMs <= cutoff) {
          items.delete(videoId)
          deleted += 1
        }
      }
      if (items.size === 0) this.fresh.items.delete(id)
    }
    return deleted
  }

  async activeHobbies(): Promise<{ hobby: string; language: string | null }[]> {
    this.maybeFail('activeHobbies')
    const since = this.now() - ACTIVE_PATH_S * 1000
    const seen = new Set<string>()
    const out: { hobby: string; language: string | null }[] = []
    for (const row of this.fresh.paths) {
      if (row.archived) continue
      // greatest() in Postgres ignores nulls; both null gives null, which is not active.
      const times = [row.lastOpenedMs, row.progressUpdatedMs].filter((t): t is number => t !== null)
      if (times.length === 0 || !(Math.max(...times) > since)) continue
      const id = JSON.stringify([row.hobby, row.language])
      if (seen.has(id)) continue
      seen.add(id)
      out.push({ hobby: row.hobby, language: row.language })
    }
    return out
  }

  async checkStates(keys: readonly CheckKey[]): Promise<{ nowMs: number; states: DueState[] }> {
    this.maybeFail('checkStates')
    return {
      nowMs: this.now(),
      states: keys.map((key) => ({ key: { hobby: key.hobby, language: key.language }, ...this.checkStateOf(key) })),
    }
  }

  async takeLease(key: CheckKey, runId: string): Promise<number | null> {
    this.maybeFail('takeLease')
    if (!(await this.pipeline.takeLease(freshLeaseKey(key), runId, FRESH_LEASE_S))) return null
    const now = this.now()
    const id = checkKeyId(key)
    const row = this.fresh.checkState.get(id)
    this.fresh.checkState.set(id, { lastSuccessMs: row?.lastSuccessMs ?? null, lastAttemptMs: now })
    return now
  }

  async releaseLease(key: CheckKey, runId: string): Promise<void> {
    this.maybeFail('releaseLease')
    await this.pipeline.releaseLease(freshLeaseKey(key), runId)
  }

  async sources(key: CheckKey): Promise<ChannelSourceRow[]> {
    this.maybeFail('sources')
    return rankChannelSources(this.fresh.sources.get(checkKeyId(key)) ?? []).map(cloneSource)
  }

  async storedIds(key: CheckKey, ids: readonly string[]): Promise<Set<string>> {
    this.maybeFail('storedIds')
    const items = this.fresh.items.get(checkKeyId(key))
    return new Set(ids.filter((id) => items?.has(id) ?? false))
  }

  async skillTitles(hobby: string): Promise<string[]> {
    this.maybeFail('skillTitles')
    const latest = new Map<string, number>()
    for (const [poolKey, pool] of this.shared.pools) {
      const parts = poolKeyParts(poolKey)
      if (!parts || parts.hobby !== hobby || parts.skill === '') continue
      latest.set(parts.skill, Math.max(latest.get(parts.skill) ?? Number.NEGATIVE_INFINITY, pool.storedAt))
    }
    return [...latest.entries()]
      .sort((a, b) => b[1] - a[1] || compareCodePoints(a[0], b[0]))
      .slice(0, SKILL_TITLES_LIMIT)
      .map(([skill]) => skill)
  }

  async storeCheck(input: StoreCheckInput): Promise<StoreCheckOutcome> {
    this.maybeFail('storeCheck')
    const { key, runId } = input
    if (this.now() > input.deadlineMs) return 'deadline_exceeded'

    const leaseKey = freshLeaseKey(key)
    const lease = this.shared.leases.get(leaseKey)
    const now = this.now()
    if (!lease || lease.runId !== runId || lease.takenAt <= now - FRESH_LEASE_S * 1000) return 'lease_lost'

    // An invalid item raises before anything is written.
    for (const item of input.items) assertValidItem(item)

    // Build the writes on copies; commit only when the second deadline check passes.
    const id = checkKeyId(key)
    const items = new Map(this.fresh.items.get(id) ?? [])
    for (const item of input.items) {
      if (items.has(item.videoId)) continue // on conflict do nothing, also within one batch
      items.set(item.videoId, {
        hobby: key.hobby,
        language: key.language,
        videoId: item.videoId,
        skillNorm: item.skillNorm,
        level: item.level,
        channelId: item.channelId,
        video: { ...item.video },
        why: item.why,
        publishedMs: item.publishedMs,
        foundMs: now,
      })
    }
    const checked = new Set(input.checkedChannelIds)
    const sources = (this.fresh.sources.get(id) ?? []).map((row) =>
      checked.has(row.channelId) ? { ...row, lastCheckedMs: input.startedMs } : cloneSource(row),
    )
    const prior = this.fresh.checkState.get(id)

    this.duringStore?.()
    if (this.now() > input.deadlineMs) return 'deadline_exceeded' // raised and rolled back in SQL

    if (items.size > 0) this.fresh.items.set(id, items)
    if (sources.length > 0) this.fresh.sources.set(id, sources)
    this.fresh.checkState.set(id, { lastSuccessMs: now, lastAttemptMs: prior?.lastAttemptMs ?? null })
    this.shared.leases.delete(leaseKey)
    return 'stored'
  }

  async readPage(input: { checkKeys: readonly CheckKey[]; poolKeys: readonly string[] }): Promise<PageRead> {
    this.maybeFail('readPage')
    if (input.checkKeys.length > PAGE_READ_MAX_KEYS || input.poolKeys.length > PAGE_READ_MAX_POOL_KEYS) {
      throw new Error('bad_arguments')
    }
    const now = this.now()
    const unique = new Map<string, CheckKey>()
    for (const key of input.checkKeys) unique.set(checkKeyId(key), { hobby: key.hobby, language: key.language })
    const keys = [...unique.values()].sort(compareKeys)
    const publishedAfter = now - FRESH_PAGE_WINDOW_S * 1000
    const foundAfter = now - FRESH_RETENTION_S * 1000

    const items: FreshItemRow[] = []
    const sources: FreshSource[] = []
    const checkTimes: FreshCheckTime[] = []
    for (const { hobby, language } of keys) {
      const id = checkKeyId({ hobby, language })
      const keyItems = [...(this.fresh.items.get(id)?.values() ?? [])]
        .filter((item) => item.publishedMs > publishedAfter && item.foundMs > foundAfter)
        .sort((a, b) => b.publishedMs - a.publishedMs || compareCodePoints(a.videoId, b.videoId))
      items.push(...keyItems.map(cloneItem))

      for (const row of rankChannelSources(this.fresh.sources.get(id) ?? [])) {
        sources.push({ hobby, language, channelId: row.channelId, channelName: row.channelName })
      }
      const state = this.fresh.checkState.get(id)
      if (state?.lastSuccessMs != null) checkTimes.push({ hobby, language, lastSuccessMs: state.lastSuccessMs })
    }

    const wanted = new Set(input.poolKeys)
    const pools: VideoPool[] = [...this.shared.pools.entries()]
      .filter(([poolKey]) => wanted.has(poolKey))
      .sort((a, b) => compareCodePoints(a[0], b[0]))
      .map(([poolKey, pool]) => ({ poolKey, videos: structuredClone(pool.videos), storedAt: pool.storedAt }))

    return { nowMs: now, items, pools, sources, checkTimes }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private maybeFail(method: FreshMethod): void {
    const left = this.failures.get(method) ?? 0
    if (left <= 0) return
    this.failures.set(method, left - 1)
    throw new Error('store_unavailable')
  }

  /** Mirror of `fresh_sources_refresh` inside `video_pool_store`. Writes only on success. */
  private refreshOnPoolStore(poolKey: string, videos: readonly PoolVideo[], nowMs: number): void {
    if (this.fresh.failSourcesRefresh > 0) {
      this.fresh.failSourcesRefresh -= 1
      throw new Error('sources_refresh_failed')
    }
    const parts = poolKeyParts(poolKey)
    if (!parts) return
    const id = checkKeyId({ hobby: parts.hobby, language: parts.language })
    const poolsOfKey: PoolVideo[][] = []
    for (const [otherKey, pool] of this.shared.pools) {
      const other = poolKeyParts(otherKey)
      if (other && other.hobby === parts.hobby && other.language === parts.language) poolsOfKey.push(pool.videos)
    }
    const next = refreshSources(this.fresh.sources.get(id) ?? [], poolsOfKey, videos, nowMs)
    if (next.length > 0) this.fresh.sources.set(id, next)
    else this.fresh.sources.delete(id)
  }

  private itemsOf(key: CheckKey): Map<string, FreshItemRow> {
    const id = checkKeyId(key)
    let items = this.fresh.items.get(id)
    if (!items) {
      items = new Map()
      this.fresh.items.set(id, items)
    }
    return items
  }
}

/** Hobby, then language, both in code point order (`collate "C"`). */
function compareKeys(a: CheckKey, b: CheckKey): number {
  return compareCodePoints(a.hobby, b.hobby) || compareCodePoints(a.language, b.language)
}
