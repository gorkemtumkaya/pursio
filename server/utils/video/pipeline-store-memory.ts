/**
 * In-memory PipelineStore with an injected clock. It mirrors the SQL functions of the
 * video_pipeline migration. Several schedulers can share one instance (several servers),
 * and restart() returns a new instance over the same state (a server restart).
 */
import type { PoolVideo, VideoPool } from '../../../shared/types/video'
import { pacificDay } from '../../../shared/utils/pacific-time'
import {
  LEASE_TIMEOUT_S,
  type FillRow,
  type FillUpsert,
  type PipelineStore,
  type PoolRead,
  type QuotaReserveInput,
} from './pipeline-store'

interface StoredPool {
  videos: PoolVideo[]
  storedAt: number
  runId: string
}

interface Lease {
  runId: string
  takenAt: number
}

interface State {
  pools: Map<string, StoredPool>
  leases: Map<string, Lease>
  quota: Map<string, number>
  fills: Map<string, FillRow>
}

export class InMemoryPipelineStore implements PipelineStore {
  private readonly state: State

  constructor(
    private readonly now: () => number,
    state?: State,
  ) {
    this.state = state ?? { pools: new Map(), leases: new Map(), quota: new Map(), fills: new Map() }
  }

  /** A new store object over the same state, like a process restart with a persistent database. */
  restart(): InMemoryPipelineStore {
    return new InMemoryPipelineStore(this.now, this.state)
  }

  /** Units used on a Pacific_Day (default: today). For tests. */
  quotaUsed(day: string = pacificDay(this.now())): number {
    return this.state.quota.get(day) ?? 0
  }

  async readPools(keys: readonly string[]): Promise<PoolRead[]> {
    if (keys.length > 2) throw new Error('bad_arguments')
    const now = this.now()
    return keys.map((poolKey) => {
      const stored = this.state.pools.get(poolKey)
      const lease = this.state.leases.get(poolKey)
      const fill = this.state.fills.get(poolKey)
      const pool: VideoPool | null = stored
        ? { poolKey, videos: structuredClone(stored.videos), storedAt: stored.storedAt }
        : null
      return {
        poolKey,
        pool,
        nowMs: now,
        leaseActive: lease !== undefined && lease.takenAt > now - LEASE_TIMEOUT_S * 1000,
        fillNextRunMs: fill ? fill.nextRunAt : null,
      }
    })
  }

  async takeLease(poolKey: string, runId: string, timeoutS: number = LEASE_TIMEOUT_S): Promise<boolean> {
    const now = this.now()
    const lease = this.state.leases.get(poolKey)
    if (lease && lease.takenAt > now - timeoutS * 1000) return false
    this.state.leases.set(poolKey, { runId, takenAt: now })
    return true
  }

  async releaseLease(poolKey: string, runId: string): Promise<void> {
    if (this.state.leases.get(poolKey)?.runId === runId) this.state.leases.delete(poolKey)
  }

  async storePool(poolKey: string, runId: string, videos: readonly PoolVideo[]): Promise<boolean> {
    if (this.state.leases.get(poolKey)?.runId !== runId) return false
    this.state.pools.set(poolKey, { videos: structuredClone([...videos]), storedAt: this.now(), runId })
    this.state.leases.delete(poolKey)
    this.state.fills.delete(poolKey)
    return true
  }

  async reserveQuota(input: QuotaReserveInput): Promise<boolean> {
    if (!Number.isFinite(input.units) || input.units <= 0) throw new Error('bad_arguments')
    const day = pacificDay(this.now())
    const used = this.state.quota.get(day) ?? 0
    if (used + input.units > input.quota) return false
    if (input.gateThreshold && used >= input.threshold) return false
    this.state.quota.set(day, used + input.units)
    return true
  }

  async saturateQuota(quota: number): Promise<void> {
    const day = pacificDay(this.now())
    this.state.quota.set(day, Math.max(this.state.quota.get(day) ?? 0, Math.max(quota, 0)))
  }

  async upsertFill(row: FillUpsert): Promise<void> {
    this.state.fills.set(row.poolKey, { ...row })
  }

  async dueFills(max: number): Promise<FillRow[]> {
    const now = this.now()
    return [...this.state.fills.values()]
      .filter((row) => row.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt - b.nextRunAt)
      .slice(0, Math.max(max, 0))
      .map((row) => ({ ...row }))
  }

  async deleteFill(poolKey: string): Promise<void> {
    this.state.fills.delete(poolKey)
  }
}
