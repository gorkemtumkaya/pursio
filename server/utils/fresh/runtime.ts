/**
 * Runtime wiring of Fresh (spec: fresh, task 10.2, 12.3). Deps of the Check_Route and the
 * Fresh_Endpoint come from `videoRuntime()` (service-role client, pipeline store, provider,
 * Default_Config adapter), the Postgres FreshStore, the check secret and an own limiter.
 * Handlers never read runtime config themselves.
 *
 * Only the Check_Route deps hold a feed fetcher, provider, model adapter and `runFreshCheck`.
 * The Fresh_Endpoint deps hold the token check, the limiter, the page read and the user read.
 */
import { createRateLimiter } from '../rate-limiter'
import { loadFreshUserData, verifyAccessToken } from '../supabase-server'
import { videoRuntime } from '../video/runtime'
import { runFreshCheck } from './check'
import { PostgresFreshStore } from './check-store-pg'
import type { CheckRouteDeps, FreshEndpointDeps } from './handlers'

/** Requests per minute per user or IP on POST /api/fresh (Req 8.5). */
export const FRESH_RATE_LIMIT = 60
export const FRESH_RATE_WINDOW_MS = 60_000
/** Token check and user read limits (milliseconds). */
const FRESH_VERIFY_TIMEOUT_MS = 5_000
const FRESH_LOAD_TIMEOUT_MS = 5_000

const freshLimiter = createRateLimiter({
  limit: FRESH_RATE_LIMIT,
  windowMs: FRESH_RATE_WINDOW_MS,
  now: Date.now,
})

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function log(entry: { type: string; checkKey?: string; durationMs?: number }): void {
  // Fixed fields only: never a URL, header, body, token, secret or key.
  const line: { type: string; checkKey?: string; durationMs?: number } = { type: entry.type }
  if (typeof entry.checkKey === 'string') line.checkKey = entry.checkKey
  if (typeof entry.durationMs === 'number') line.durationMs = entry.durationMs
  if (entry.type === 'fresh_timing') console.info('[fresh]', line)
  else console.error('[fresh]', line)
}

/**
 * Deps of POST /api/fresh/check. The secret is read on its own, so an unset secret disables
 * the route even when the pipeline is not configured; `run` is null then, or when the
 * Supabase URL or Service_Role_Key is missing.
 */
export function checkRouteDeps(): CheckRouteDeps {
  const secret = str(useRuntimeConfig().freshCheckSecret)
  const runtime = secret === '' ? null : videoRuntime()
  if (!runtime) return { secret, run: null, log }
  const store = new PostgresFreshStore(runtime.client)
  return {
    secret,
    log,
    run: {
      store,
      bindStore: (deadline) => store.withDeadline(deadline),
      runCheck: runFreshCheck,
      check: {
        gate: runtime.quotaGate(),
        provider: runtime.pipeline.provider,
        adapter: runtime.pipeline.adapter,
        config: runtime.pipeline.config,
        feedFetcher: globalThis.fetch,
      },
    },
  }
}

/** Deps of POST /api/fresh, or null when the Supabase URL or Service_Role_Key is missing. */
export function freshEndpointDeps(): FreshEndpointDeps | null {
  const runtime = videoRuntime()
  if (!runtime) return null
  return {
    verifyToken: verifyAccessToken,
    verifyTimeoutMs: FRESH_VERIFY_TIMEOUT_MS,
    limiter: freshLimiter,
    store: new PostgresFreshStore(runtime.client),
    loadUserData: loadFreshUserData,
    loadTimeoutMs: FRESH_LOAD_TIMEOUT_MS,
    log,
  }
}
