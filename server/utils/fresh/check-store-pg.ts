/**
 * Postgres FreshStore. Every call goes through a SQL function of
 * `20261112000000_fresh_tables.sql` (the Lease release through the existing
 * `video_lease_release`), using the service-role client. Every result is validated with zod
 * at this boundary. Times come from the database clock, never from the app server clock.
 *
 * Deadline: an optional deadline `AbortSignal` (the Call_Deadline signal of the Check_Route)
 * races every call. When it fires first, `storeCheck` resolves 'deadline_exceeded' and every
 * other method throws. `fresh_check_store` also enforces the deadline in SQL: past
 * `p_deadline_ms` it returns 'deadline_exceeded' before writing, or raises the error
 * `deadline_exceeded` after the writes, which rolls them back; both map to the same outcome
 * (Req 3.15).
 *
 * Errors carry a fixed label only (`fresh_store_failed:<op>`), never a Supabase message,
 * detail or URL.
 */
import { z } from 'zod'
import type { CheckKey } from '../../../shared/types/fresh'
import type { PoolVideo, VideoPool } from '../../../shared/types/video'
import { freshLeaseKey } from '../../../shared/utils/fresh-keys'
import {
  PAGE_READ_MAX_KEYS,
  PAGE_READ_MAX_POOL_KEYS,
  type FreshItemRow,
  type FreshStore,
  type PageRead,
  type StoreCheckInput,
  type StoreCheckOutcome,
} from './check-store'
import type { DueState } from './schedule'
import type { ChannelSourceRow } from './sources'

/** The part of the Supabase client this store uses; `SupabaseClient` fits it. */
export interface FreshRpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export interface PostgresFreshStoreOptions {
  /** Fires at the Call_Deadline; every call is raced against it. */
  deadline?: AbortSignal
}

/** Raised when the deadline signal fired before an RPC settled. */
const DEADLINE = Symbol('deadline')

function storeError(op: string): Error {
  return new Error(`fresh_store_failed:${op}`)
}

// --- zod schemas of the RPC results -----------------------------------------------------

/** bigint values arrive as numbers or numeric strings. */
const msSchema = z.union([z.number(), z.string().regex(/^-?\d+$/)]).transform(Number).pipe(z.number().int())
const msOrNull = msSchema.nullable()
const levelSchema = z.enum(['beginner', 'intermediate', 'advanced'])
const styleSchema = z.enum(['drill', 'technique', 'explainer', 'approachable'])

const cleanupSchema = z.number().int().nonnegative()
const activeHobbiesSchema = z.array(z.object({ hobby: z.string(), language: z.string().nullable() }))
const checkStatesSchema = z.object({
  nowMs: msSchema,
  states: z.array(
    z.object({
      hobby: z.string(),
      language: z.string(),
      lastSuccessMs: msOrNull,
      lastAttemptMs: msOrNull,
    }),
  ),
})
const sourcesSchema = z.array(
  z.object({
    channel_id: z.string(),
    channel_name: z.string(),
    qualifying_count: z.number().int(),
    latest_qualifying_ms: msSchema,
    last_checked_ms: msOrNull,
  }),
)
const textListSchema = z.array(z.string())
const storeOutcomeSchema = z.enum(['stored', 'lease_lost', 'deadline_exceeded'])

const itemVideoSchema = z.object({
  title: z.string(),
  channel: z.string(),
  thumbnailUrl: z.string(),
  durationSeconds: z.number(),
  style: styleSchema,
  teachesThisSkill: z.number(),
  levelFit: z.number(),
})
const pageItemSchema = z.object({
  hobby: z.string(),
  language: z.string(),
  videoId: z.string(),
  skillNorm: z.string(),
  level: levelSchema,
  channelId: z.string(),
  video: itemVideoSchema,
  why: z.string(),
  publishedMs: msSchema,
  foundMs: msSchema,
})

/** A missing optional field of an old pool reads as null. */
function nullish<T extends z.ZodType>(schema: T) {
  return schema.nullish().transform((v) => v ?? null)
}
const poolVideoSchema = z.object({
  id: z.string(),
  title: z.string(),
  channel: z.string(),
  channelId: nullish(z.string()),
  thumbnailUrl: z.string(),
  durationSeconds: z.number(),
  viewCount: nullish(z.number()),
  likeCount: nullish(z.number()),
  publishedAt: nullish(z.string()),
  defaultAudioLanguage: nullish(z.string()),
  hasCaptions: nullish(z.boolean()),
  teachesThisSkill: z.number(),
  levelFit: z.number(),
  style: styleSchema,
  matchedQuestText: nullish(z.string()),
})
const pageReadSchema = z.object({
  nowMs: msSchema,
  items: z.array(pageItemSchema),
  pools: z.array(z.object({ poolKey: z.string(), videos: z.array(z.unknown()), storedAtMs: msSchema })),
  sources: z.array(
    z.object({ hobby: z.string(), language: z.string(), channelId: z.string(), channelName: z.string() }),
  ),
  checkTimes: z.array(z.object({ hobby: z.string(), language: z.string(), lastSuccessMs: msSchema })),
})

/** Pool videos that do not parse are left out, like a video the pipeline would not store. */
function parsePoolVideos(videos: readonly unknown[]): PoolVideo[] {
  return videos.flatMap((v) => {
    const parsed = poolVideoSchema.safeParse(v)
    return parsed.success ? [parsed.data] : []
  })
}

function parse<T extends z.ZodType>(schema: T, data: unknown, op: string): z.output<T> {
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw storeError(op)
  return parsed.data
}

/** A raised `deadline_exceeded` from `fresh_check_store` (Postgres error text and P0001). */
function isRaisedDeadline(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'message' in error && error.message === 'deadline_exceeded'
}

export class PostgresFreshStore implements FreshStore {
  private readonly deadline: AbortSignal | undefined

  constructor(
    private readonly client: FreshRpcClient,
    options: PostgresFreshStoreOptions = {},
  ) {
    this.deadline = options.deadline
  }

  /** The same store on the same client, raced against `deadline`. */
  withDeadline(deadline: AbortSignal): PostgresFreshStore {
    return new PostgresFreshStore(this.client, { deadline })
  }

  /** One RPC raced against the deadline signal; DEADLINE when the signal fired first. */
  private async call(
    fn: string,
    args: Record<string, unknown> | undefined,
  ): Promise<{ data: unknown; error: unknown } | typeof DEADLINE> {
    const signal = this.deadline
    if (signal?.aborted) return DEADLINE
    const request = Promise.resolve(this.client.rpc(fn, args))
    if (!signal) return request
    let onAbort: (() => void) | undefined
    const aborted = new Promise<typeof DEADLINE>((resolve) => {
      onAbort = () => resolve(DEADLINE)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      return await Promise.race([request, aborted])
    } finally {
      if (onAbort) signal.removeEventListener('abort', onAbort)
    }
  }

  /** RPC result data, or a fixed error for a db error, a rejected call or the deadline. */
  private async data(op: string, fn: string, args?: Record<string, unknown>): Promise<unknown> {
    let result: Awaited<ReturnType<PostgresFreshStore['call']>>
    try {
      result = await this.call(fn, args)
    } catch {
      throw storeError(op)
    }
    if (result === DEADLINE) throw storeError(`${op}:deadline`)
    if (result.error) throw storeError(op)
    return result.data
  }

  async cleanup(): Promise<number> {
    return parse(cleanupSchema, await this.data('cleanup', 'fresh_items_cleanup'), 'cleanup')
  }

  async activeHobbies(): Promise<{ hobby: string; language: string | null }[]> {
    return parse(activeHobbiesSchema, await this.data('active_hobbies', 'fresh_active_hobbies'), 'active_hobbies')
  }

  async checkStates(keys: readonly CheckKey[]): Promise<{ nowMs: number; states: DueState[] }> {
    const p_keys = keys.map((k) => ({ hobby: k.hobby, language: k.language }))
    const read = parse(checkStatesSchema, await this.data('check_states', 'fresh_check_states', { p_keys }), 'check_states')
    // One state per requested key, in request order.
    if (read.states.length !== keys.length) throw storeError('check_states')
    const states = read.states.map((s, i): DueState => {
      const key = keys[i]
      if (!key || key.hobby !== s.hobby || key.language !== s.language) throw storeError('check_states')
      return { key: { hobby: s.hobby, language: s.language }, lastSuccessMs: s.lastSuccessMs, lastAttemptMs: s.lastAttemptMs }
    })
    return { nowMs: read.nowMs, states }
  }

  async takeLease(key: CheckKey, runId: string): Promise<number | null> {
    const data = await this.data('lease_take', 'fresh_lease_take', {
      p_hobby: key.hobby,
      p_language: key.language,
      p_run: runId,
    })
    return parse(msOrNull, data, 'lease_take')
  }

  async releaseLease(key: CheckKey, runId: string): Promise<void> {
    await this.data('lease_release', 'video_lease_release', { p_key: freshLeaseKey(key), p_run: runId })
  }

  async sources(key: CheckKey): Promise<ChannelSourceRow[]> {
    const data = await this.data('sources', 'fresh_sources_of', { p_hobby: key.hobby, p_language: key.language })
    return parse(sourcesSchema, data, 'sources').map((r) => ({
      channelId: r.channel_id,
      channelName: r.channel_name,
      qualifyingCount: r.qualifying_count,
      latestQualifyingMs: r.latest_qualifying_ms,
      lastCheckedMs: r.last_checked_ms,
    }))
  }

  async storedIds(key: CheckKey, ids: readonly string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const data = await this.data('stored_ids', 'fresh_stored_ids', {
      p_hobby: key.hobby,
      p_language: key.language,
      p_ids: [...ids],
    })
    return new Set(parse(textListSchema, data, 'stored_ids'))
  }

  async skillTitles(hobby: string): Promise<string[]> {
    return parse(textListSchema, await this.data('skill_titles', 'fresh_skill_titles', { p_hobby: hobby }), 'skill_titles')
  }

  async storeCheck(input: StoreCheckInput): Promise<StoreCheckOutcome> {
    let result: Awaited<ReturnType<PostgresFreshStore['call']>>
    try {
      result = await this.call('fresh_check_store', {
        p_hobby: input.key.hobby,
        p_language: input.key.language,
        p_run: input.runId,
        p_started_ms: input.startedMs,
        p_deadline_ms: input.deadlineMs,
        p_items: input.items.map((i) => ({
          videoId: i.videoId,
          skillNorm: i.skillNorm,
          level: i.level,
          channelId: i.channelId,
          why: i.why,
          publishedMs: i.publishedMs,
          video: { ...i.video },
        })),
        p_channels: [...input.checkedChannelIds],
      })
    } catch {
      throw storeError('store')
    }
    if (result === DEADLINE) return 'deadline_exceeded'
    if (result.error) {
      if (isRaisedDeadline(result.error)) return 'deadline_exceeded'
      throw storeError('store')
    }
    return parse(storeOutcomeSchema, result.data, 'store')
  }

  async readPage(input: { checkKeys: readonly CheckKey[]; poolKeys: readonly string[] }): Promise<PageRead> {
    if (input.checkKeys.length > PAGE_READ_MAX_KEYS || input.poolKeys.length > PAGE_READ_MAX_POOL_KEYS) {
      throw storeError('page_read')
    }
    const data = await this.data('page_read', 'fresh_page_read', {
      p_keys: input.checkKeys.map((k) => ({ hobby: k.hobby, language: k.language })),
      p_pool_keys: [...input.poolKeys],
    })
    const read = parse(pageReadSchema, data, 'page_read')
    const items: FreshItemRow[] = read.items
    const pools: VideoPool[] = read.pools.map((p) => ({
      poolKey: p.poolKey,
      videos: parsePoolVideos(p.videos),
      storedAt: p.storedAtMs,
    }))
    return { nowMs: read.nowMs, items, pools, sources: read.sources, checkTimes: read.checkTimes }
  }
}
