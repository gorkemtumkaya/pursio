/**
 * Postgres PipelineStore. Every call goes through a SQL function of the video_pipeline
 * migration, using the service-role client. Staleness is decided against `nowMs`, which
 * comes from the database clock (`video_pools_read`), never from the app server clock.
 * Errors carry a fixed label only, never a Supabase message, detail or URL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PoolVideo, VideoPool } from '../../../shared/types/video'
import {
  isStoredFillJob,
  LEASE_TIMEOUT_S,
  type FillReason,
  type FillRow,
  type FillUpsert,
  type PipelineStore,
  type PoolRead,
  type QuotaReserveInput,
} from './pipeline-store'

const REASONS: readonly FillReason[] = ['new', 'stale', 'quota', 'retry', 'running']

function storeError(op: string): Error {
  return new Error(`pipeline_store_failed:${op}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** bigint columns arrive as numbers (or numeric strings); anything else is a store error. */
function toMs(value: unknown, op: string): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) throw storeError(op)
  return n
}

function toMsOrNull(value: unknown, op: string): number | null {
  return value === null || value === undefined ? null : toMs(value, op)
}

function parsePoolRead(row: unknown): PoolRead {
  if (!isRecord(row) || typeof row.pool_key !== 'string') throw storeError('read')
  const poolKey = row.pool_key
  const storedAt = toMsOrNull(row.stored_at_ms, 'read')
  const pool: VideoPool | null =
    storedAt !== null && Array.isArray(row.videos)
      ? { poolKey, videos: row.videos as PoolVideo[], storedAt }
      : null
  return {
    poolKey,
    pool,
    nowMs: toMs(row.now_ms, 'read'),
    leaseActive: row.lease_active === true,
    fillNextRunMs: toMsOrNull(row.fill_next_run_ms, 'read'),
  }
}

/** Returns null for a row whose job is not a valid job; such a row is skipped, not run. */
function parseFillRow(row: unknown): FillRow | null {
  if (!isRecord(row) || typeof row.pool_key !== 'string') throw storeError('due')
  const reason = REASONS.find((r) => r === row.reason)
  const nextRunAt = typeof row.next_run_at === 'string' ? Date.parse(row.next_run_at) : Number.NaN
  if (!reason || Number.isNaN(nextRunAt)) throw storeError('due')
  if (!isStoredFillJob(row.job)) return null
  return {
    poolKey: row.pool_key,
    job: row.job,
    reason,
    attempts: typeof row.attempts === 'number' ? row.attempts : 0,
    attemptsDay: typeof row.attempts_day === 'string' ? row.attempts_day : null,
    nextRunAt,
  }
}

export class PostgresPipelineStore implements PipelineStore {
  constructor(private readonly client: SupabaseClient) {}

  async readPools(keys: readonly string[]): Promise<PoolRead[]> {
    if (keys.length > 2) throw storeError('read')
    const { data, error } = await this.client.rpc('video_pools_read', { p_keys: [...keys] })
    if (error || !Array.isArray(data)) throw storeError('read')
    return data.map(parsePoolRead)
  }

  async takeLease(poolKey: string, runId: string, timeoutS: number = LEASE_TIMEOUT_S): Promise<boolean> {
    const { data, error } = await this.client.rpc('video_lease_take', {
      p_key: poolKey,
      p_run: runId,
      p_timeout_s: timeoutS,
    })
    if (error) throw storeError('lease_take')
    return data === true
  }

  async releaseLease(poolKey: string, runId: string): Promise<void> {
    const { error } = await this.client.rpc('video_lease_release', { p_key: poolKey, p_run: runId })
    if (error) throw storeError('lease_release')
  }

  async storePool(poolKey: string, runId: string, videos: readonly PoolVideo[]): Promise<boolean> {
    const { data, error } = await this.client.rpc('video_pool_store', {
      p_key: poolKey,
      p_run: runId,
      p_videos: [...videos],
    })
    if (error) throw storeError('store')
    return data === true
  }

  async reserveQuota(input: QuotaReserveInput): Promise<boolean> {
    const { data, error } = await this.client.rpc('video_quota_reserve', {
      p_units: input.units,
      p_quota: input.quota,
      p_threshold: input.threshold,
      p_gate: input.gateThreshold,
    })
    if (error) throw storeError('quota_reserve')
    return data === true
  }

  async saturateQuota(quota: number): Promise<void> {
    const { error } = await this.client.rpc('video_quota_saturate', { p_quota: quota })
    if (error) throw storeError('quota_saturate')
  }

  async upsertFill(row: FillUpsert): Promise<void> {
    const { error } = await this.client.rpc('video_fill_upsert', {
      p_key: row.poolKey,
      p_job: row.job,
      p_reason: row.reason,
      p_attempts: row.attempts,
      p_attempts_day: row.attemptsDay,
      p_next: new Date(row.nextRunAt).toISOString(),
    })
    if (error) throw storeError('fill_upsert')
  }

  async dueFills(max: number): Promise<FillRow[]> {
    const { data, error } = await this.client.rpc('video_fills_due', { p_max: max })
    if (error || !Array.isArray(data)) throw storeError('due')
    return data.flatMap((row) => {
      const parsed = parseFillRow(row)
      return parsed ? [parsed] : []
    })
  }

  async deleteFill(poolKey: string): Promise<void> {
    const { error } = await this.client.rpc('video_fill_delete', { p_key: poolKey })
    if (error) throw storeError('fill_delete')
  }
}
