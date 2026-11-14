/**
 * Quota policy over PipelineStore (Req 9.1, 9.3, 9.4, 9.5, 9.7, 9.16).
 * Units are reserved before a call starts, so errored calls stay counted.
 */
import type { PipelineStore } from './pipeline-store'

export const SEARCH_COST = 100
export const DETAILS_COST = 1
export const DEFAULT_DAILY_QUOTA = 10000

/** Daily_Quota from configuration: a positive integer, else 10000 (Req 9.7). */
export function dailyQuota(raw: unknown): number {
  let n: number
  if (typeof raw === 'number') n = raw
  else if (typeof raw === 'string' && /^\s*\d+\s*$/.test(raw)) n = Number(raw)
  else return DEFAULT_DAILY_QUOTA
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_DAILY_QUOTA
}

/** Quota_Threshold: 90 percent of the Daily_Quota. */
export function quotaThreshold(quota: number): number {
  return Math.ceil(quota * 0.9)
}

export interface QuotaGate {
  /** Reserves 100 units when used < threshold and used + 100 <= quota. */
  reserveSearch(): Promise<boolean>
  /** Reserves 1 unit when used + 1 <= quota (threshold ignored). */
  reserveDetails(): Promise<boolean>
  /** Counts the whole Pacific_Day as used (provider quota-exceeded response). */
  markExceeded(): Promise<void>
}

export function createQuotaGate(store: PipelineStore, rawQuota?: unknown): QuotaGate {
  const quota = dailyQuota(rawQuota)
  const threshold = quotaThreshold(quota)
  return {
    reserveSearch: () =>
      store.reserveQuota({ units: SEARCH_COST, quota, threshold, gateThreshold: true }),
    reserveDetails: () =>
      store.reserveQuota({ units: DETAILS_COST, quota, threshold, gateThreshold: false }),
    markExceeded: () => store.saturateQuota(quota),
  }
}
