export interface RateLimiter {
  /** Returns true and records the request when the IP is under its limit. */
  tryConsume(ip: string): boolean
}

export interface RateLimiterOptions {
  limit: number
  windowMs: number
  /** Injected clock in milliseconds (Req 7.5). */
  now: () => number
}

/**
 * Sliding-window limiter keyed by client IP (Req 7.1, 7.6). Only allowed
 * requests are recorded. IPs whose window empties are dropped from the map.
 */
export function createRateLimiter({ limit, windowMs, now }: RateLimiterOptions): RateLimiter {
  const allowed = new Map<string, number[]>()

  return {
    tryConsume(ip) {
      const t = now()
      const recent = (allowed.get(ip) ?? []).filter((stamp) => stamp > t - windowMs)

      if (recent.length < limit) {
        recent.push(t)
        allowed.set(ip, recent)
        return true
      }

      if (recent.length === 0) allowed.delete(ip)
      else allowed.set(ip, recent)
      return false
    },
  }
}
