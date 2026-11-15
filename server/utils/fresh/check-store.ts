/**
 * Storage interface of Fresh: Fresh_Items, Channel_Sources, check state and the Fresh Lease.
 * The Postgres implementation (`check-store-pg.ts`) calls the SQL functions of
 * `20261112000000_fresh_tables.sql`; the in-memory implementation (`check-store-memory.ts`)
 * mirrors them for tests. All times are epoch ms of the store clock (the database clock for
 * Postgres), never of the app server clock.
 *
 * Quota is not part of this interface: Fresh reserves units through `createQuotaGate` over the
 * existing `PipelineStore`, so Fresh and the skill pipeline share one Daily_Quota.
 */
import type { CheckKey, FreshCheckTime, FreshSource } from '../../../shared/types/fresh'
import type { Level } from '../../../shared/types/skill-tree'
import type { VideoPool, VideoStyle } from '../../../shared/types/video'
import type { ChannelSourceRow } from './sources'
// DueState lives in ./schedule (auto-imported there); it is not re-exported here, so the
// Nuxt auto-import sees one declaration only.
import type { DueState } from './schedule'

/** Fresh Lease timeout in seconds (Req 3.9, 7.9). */
export const FRESH_LEASE_S = 300
/** Fresh_Retention: items found this many seconds ago or earlier are deleted and never read (Req 7.4, 7.10). */
export const FRESH_RETENTION_S = 2592000
/** The Fresh_Endpoint reads items published within this many seconds (Req 8.10). */
export const FRESH_PAGE_WINDOW_S = 604800
/** Most Check_Keys one page read accepts. */
export const PAGE_READ_MAX_KEYS = 20
/** Most Pool_Keys one page read accepts. */
export const PAGE_READ_MAX_POOL_KEYS = 60
/** Most Skill titles `skillTitles` returns (decision D6). */
export const SKILL_TITLES_LIMIT = 60

/** The `video` jsonb of a Fresh_Item. */
export interface FreshItemVideo {
  title: string
  channel: string
  thumbnailUrl: string
  durationSeconds: number
  style: VideoStyle
  teachesThisSkill: number
  levelFit: number
}

/**
 * What `storeCheck` writes per item: the `p_items` element of `fresh_check_store`.
 * The Check_Key and the found time come from the store call, not from the item.
 */
export interface FreshItemInsert {
  /** 11 characters of `[A-Za-z0-9_-]`. */
  videoId: string
  /** Normalized Skill title. */
  skillNorm: string
  level: Level
  /** 1 to 64 characters. */
  channelId: string
  video: FreshItemVideo
  /** Trimmed Why_Line, 1 to 120 characters. */
  why: string
  /** Published time of the Feed_Entry. */
  publishedMs: number
}

/** One stored Fresh_Item, as `fresh_page_read` returns it. Assignable to `FreshItemInsert`. */
export interface FreshItemRow extends FreshItemInsert {
  /** Normalized hobby of the Check_Key. */
  hobby: string
  /** Language_Code of the Check_Key. */
  language: string
  /** Time of the store transaction that first stored the item (Req 7.3). */
  foundMs: number
}

/** Result of the Fresh_Endpoint read (`fresh_page_read`). */
export interface PageRead {
  /** Db time. */
  nowMs: number
  /**
   * Items of the requested keys published within 7 days and found within 30 days, ordered by
   * hobby, language (code point), published desc, video id (code point).
   */
  items: FreshItemRow[]
  /** Stored pools of the requested Pool_Keys, ordered by Pool_Key (code point). */
  pools: VideoPool[]
  /** Channel_Sources of the requested keys: no counts and no check times (Req 1.9, 7.7). */
  sources: FreshSource[]
  /** Last successful check time of keys that had one; never a Last_Attempt_Time (Req 7.7). */
  checkTimes: FreshCheckTime[]
}

export type StoreCheckOutcome = 'stored' | 'lease_lost' | 'deadline_exceeded'

export interface StoreCheckInput {
  key: CheckKey
  runId: string
  /** Start time of the Fresh_Check (db time from `takeLease`); new last check time of `checkedChannelIds`. */
  startedMs: number
  /** The Call_Deadline in db time. */
  deadlineMs: number
  items: readonly FreshItemInsert[]
  /** Channel_Sources whose feed was fetched and parsed without failure (Req 7.1). */
  checkedChannelIds: readonly string[]
}

export interface FreshStore {
  /** Fresh_Items with found time 30 days or older (db clock). Returns the count. */
  cleanup(): Promise<number>
  /** Raw hobby text and profile language of every non-archived path active in the last 14 days. */
  activeHobbies(): Promise<{ hobby: string; language: string | null }[]>
  /** Check state of the given keys, one per key in request order, plus the db time. */
  checkStates(keys: readonly CheckKey[]): Promise<{ nowMs: number; states: DueState[] }>
  /** Takes the Lease (300 s) and records Last_Attempt_Time in one statement. Db start time, or null when held. */
  takeLease(key: CheckKey, runId: string): Promise<number | null>
  /** Deletes the Lease only when `runId` owns it. */
  releaseLease(key: CheckKey, runId: string): Promise<void>
  /** Channel_Sources of the key in rank order. */
  sources(key: CheckKey): Promise<ChannelSourceRow[]>
  /** The given ids that are already stored as Fresh_Items for the key (Req 4.6). */
  storedIds(key: CheckKey, ids: readonly string[]): Promise<Set<string>>
  /** Distinct Normalized Skill titles of the hobby's pools in any language, newest first, at most 60. */
  skillTitles(hobby: string): Promise<string[]>
  /**
   * One transaction (Req 7.1, 7.2, 7.9). 'lease_lost' when runId no longer owns the Lease or it
   * is 300 s old; 'deadline_exceeded' when the db clock is past deadlineMs, with nothing written
   * (Req 3.15). Items go in with `on conflict do nothing`. An invalid item throws (store_failed).
   */
  storeCheck(input: StoreCheckInput): Promise<StoreCheckOutcome>
  /** Fresh_Endpoint read (service role). Throws for more than 20 keys or 60 Pool_Keys. */
  readPage(input: { checkKeys: readonly CheckKey[]; poolKeys: readonly string[] }): Promise<PageRead>
}
