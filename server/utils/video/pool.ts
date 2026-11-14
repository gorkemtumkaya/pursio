import type { PoolVideo } from '../../../shared/types/video'

/** Pool_Expiry in seconds (7 days). */
export const POOL_EXPIRY_SECONDS = 604800

/** Expiry of an empty pool (1 day): a run that found nothing is tried again sooner. */
export const EMPTY_POOL_EXPIRY_SECONDS = 86400

/** A pool is stale at exactly the expiry age and older. An empty pool uses the shorter expiry. */
export function isStale(ageSeconds: number, videoCount = 1): boolean {
  return ageSeconds >= (videoCount === 0 ? EMPTY_POOL_EXPIRY_SECONDS : POOL_EXPIRY_SECONDS)
}

/**
 * Builds the video list to store: only filtered and judged videos (the caller passes
 * the kept list from the Judge), each id once, first occurrence winning.
 */
export function buildPoolVideos(judged: readonly PoolVideo[]): PoolVideo[] {
  const seen = new Set<string>()
  const out: PoolVideo[] = []
  for (const v of judged) {
    if (seen.has(v.id)) continue
    seen.add(v.id)
    out.push(v)
  }
  return out
}
