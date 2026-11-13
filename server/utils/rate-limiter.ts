export interface RateLimiter {
  /** Returns true and records the request when the key is under its limit. */
  tryConsume(key: string): boolean
}

export interface RateLimiterOptions {
  limit: number
  windowMs: number
  /** Injected clock in milliseconds (Req 7.5). */
  now: () => number
}

/**
 * Sliding-window limiter keyed by a caller-chosen string, the verified user id
 * (spec: accounts-cloud-save, Req 9.4). Only allowed requests are recorded. Keys whose window empties are dropped from the map.
 */
export function createRateLimiter({ limit, windowMs, now }: RateLimiterOptions): RateLimiter {
  const allowed = new Map<string, number[]>()

  return {
    tryConsume(key) {
      const t = now()
      const recent = (allowed.get(key) ?? []).filter((stamp) => stamp > t - windowMs)

      if (recent.length < limit) {
        recent.push(t)
        allowed.set(key, recent)
        return true
      }

      if (recent.length === 0) allowed.delete(key)
      else allowed.set(key, recent)
      return false
    },
  }
}
