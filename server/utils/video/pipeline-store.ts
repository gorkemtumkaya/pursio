/**
 * Storage interface for all Pipeline_State and Video_Pools.
 * The Postgres implementation calls the SQL functions of the video_pipeline migration;
 * the in-memory implementation mirrors them for tests. All times are epoch ms from the
 * store's clock (the database clock for Postgres), never from the app server clock.
 */
import type { PoolVideo, VideoPool } from '../../../shared/types/video'
import type { PipelineJob } from './pipeline'

/** Run_Lease timeout: 5 minutes. */
export const LEASE_TIMEOUT_S = 300

export type FillReason = 'new' | 'stale' | 'quota' | 'retry' | 'running'

/** The part of a PipelineJob that is stored: everything except the `persist` callback. */
export type StoredFillJob = Omit<PipelineJob, 'persist'>

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

/** Runtime check for a job read back from the database (`video_fills.job` is jsonb). */
export function isStoredFillJob(value: unknown): value is StoredFillJob {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.poolKey === 'string'
    && typeof v.hobby === 'string'
    && typeof v.skillTitle === 'string'
    && typeof v.skillDescription === 'string'
    && isStringArray(v.quests)
    && (v.level === 'beginner' || v.level === 'intermediate' || v.level === 'advanced')
    && typeof v.language === 'string'
    && (v.searchQueries === null || isStringArray(v.searchQueries))
    && typeof v.quickTip === 'boolean'
  )
}

/** One queued fill (a `video_fills` row). `job` holds no user id and no token. */
export interface FillRow {
  poolKey: string
  job: StoredFillJob
  reason: FillReason
  attempts: number
  /** Pacific_Day ('YYYY-MM-DD') the attempts count belongs to. */
  attemptsDay: string | null
  /** Epoch ms. */
  nextRunAt: number
}

/** The part of a FillRow a caller writes. */
export type FillUpsert = FillRow

/** Result of reading one Pool_Key (one entry per requested key, pool or not). */
export interface PoolRead {
  poolKey: string
  /** null when no pool is stored. */
  pool: VideoPool | null
  /** Current time of the store clock, epoch ms. Staleness is decided against this value. */
  nowMs: number
  /** An unexpired Run_Lease (age under the Lease_Timeout) exists. */
  leaseActive: boolean
  /** next_run_at of a queued fill for the key, epoch ms, or null. */
  fillNextRunMs: number | null
}

export interface QuotaReserveInput {
  units: number
  /** Daily_Quota. */
  quota: number
  /** Quota_Threshold, used only when gateThreshold is true. */
  threshold: number
  /** Also require used < threshold (searches). */
  gateThreshold: boolean
}

export interface PipelineStore {
  /** Reads at most 2 keys in one call. Returns one entry per key. */
  readPools(keys: readonly string[]): Promise<PoolRead[]>
  /** Takes the lease unless one younger than `timeoutS` exists. True when the caller now owns it. */
  takeLease(poolKey: string, runId: string, timeoutS?: number): Promise<boolean>
  /** Deletes the lease only when it belongs to `runId`. */
  releaseLease(poolKey: string, runId: string): Promise<void>
  /**
   * Stores the pool only when `runId` still owns the lease; then deletes the lease and any
   * queued fill (including the `running` row) for the key. False when the lease was lost.
   */
  storePool(poolKey: string, runId: string, videos: readonly PoolVideo[]): Promise<boolean>
  /** Atomic reserve for today's Pacific_Day. True when the units were reserved. */
  reserveQuota(input: QuotaReserveInput): Promise<boolean>
  /** Counts the whole day as used. */
  saturateQuota(quota: number): Promise<void>
  /** Insert or replace the fill row of a key. */
  upsertFill(row: FillUpsert): Promise<void>
  /** Up to `max` rows with nextRunAt <= now, oldest first. */
  dueFills(max: number): Promise<FillRow[]>
  deleteFill(poolKey: string): Promise<void>
}
