/**
 * Runtime wiring of the video pipeline: config, service-role client, Postgres store, provider,
 * Default_Config adapter, rate limiter and scheduler. Handlers receive these through
 * `videoRuntime()` and never read runtime config themselves.
 */
import { createClient } from '@supabase/supabase-js'
import type { Provider, ProviderConfig } from '../../../shared/types/llm'
import type { SkillTree } from '../../../shared/types/skill-tree'
import { isProvider } from '../../../shared/utils/llm'
import { createAnthropicAdapter } from '../providers/anthropic'
import { createOpenAIAdapter } from '../providers/openai'
import type { Fetcher, ProviderAdapter } from '../providers/types'
import { createRateLimiter, type RateLimiter } from '../rate-limiter'
import { loadPathForUser, verifyAccessToken } from '../supabase-server'
import type { DrainDeps, FillDeps, VideosDeps } from './handlers'
import type { PipelineDeps } from './pipeline'
import { PostgresPipelineStore } from './pipeline-store-pg'
import { createScheduler, currentWindow, fillJobFor, type BackgroundFn, type Scheduler } from './scheduler'
import { selectVideoProvider } from './select-provider'

/** Requests per minute per user or IP on the videos routes. */
export const VIDEO_RATE_LIMIT = 60
export const VIDEO_RATE_WINDOW_MS = 60_000

export interface VideoRuntime {
  scheduler: Scheduler
  pipeline: PipelineDeps
  limiter: RateLimiter
  /** Secret for POST /api/videos/drain. Empty when not configured. */
  drainSecret: string
}

/**
 * No background execution is available on Vercel (no waitUntil, no fire-and-forget), so
 * every fill is refused here and the scheduler writes it as a due row for the drain.
 */
export const noBackground: BackgroundFn = () => false

/**
 * Local dev only: the pg_cron drain cannot reach localhost, so queued fills would never run.
 * The long-lived dev server runs the task in-process instead. Production keeps `noBackground`.
 */
export const devBackground: BackgroundFn = (task) => {
  task.catch(() => console.error('[video]', { type: 'background_failed' }))
  return true
}

const background: BackgroundFn = import.meta.dev ? devBackground : noBackground

const fetcher: Fetcher = (url, options) => $fetch<unknown>(url, options)

const adapters: Record<Provider, ProviderAdapter> = {
  anthropic: createAnthropicAdapter(fetcher),
  openai: createOpenAIAdapter(fetcher),
}

const limiter = createRateLimiter({
  limit: VIDEO_RATE_LIMIT,
  windowMs: VIDEO_RATE_WINDOW_MS,
  now: Date.now,
})

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Default_Config for the Judge and query writer; null when incomplete (a model failure). */
function defaultConfig(config: ReturnType<typeof useRuntimeConfig>): ProviderConfig | null {
  const provider = str(config.llmProvider)
  const model = str(config.llmModel)
  const apiKey = str(config.llmApiKey)
  if (!isProvider(provider) || model === '' || apiKey === '') return null
  return { provider, model, apiKey }
}

/** Token check and path load limits (milliseconds). */
const VERIFY_TIMEOUT_MS = 5_000
const LOAD_PATH_TIMEOUT_MS = 5_000

/** Deps of POST /api/videos, or null when the Supabase URL or Service_Role_Key is missing. */
export function videosDeps(): VideosDeps | null {
  const runtime = videoRuntime()
  if (!runtime) return null
  return {
    verifyToken: verifyAccessToken,
    verifyTimeoutMs: VERIFY_TIMEOUT_MS,
    limiter: runtime.limiter,
    store: runtime.pipeline.store,
    scheduler: runtime.scheduler,
    background,
    loadPath: loadPathForUser,
    loadTimeoutMs: LOAD_PATH_TIMEOUT_MS,
    log: (entry) => console.error('[video]', { type: entry.type }),
  }
}

/** Deps of POST /api/videos/fill, or null when the Supabase URL or Service_Role_Key is missing. */
export function fillDeps(): FillDeps | null {
  const runtime = videoRuntime()
  if (!runtime) return null
  return {
    verifyToken: verifyAccessToken,
    verifyTimeoutMs: VERIFY_TIMEOUT_MS,
    limiter: runtime.limiter,
    scheduler: runtime.scheduler,
    loadPath: loadPathForUser,
    loadTimeoutMs: LOAD_PATH_TIMEOUT_MS,
    log: (entry) => console.error('[video]', { type: entry.type }),
  }
}

/**
 * Deps of POST /api/videos/drain. The secret is read on its own, so an unset secret disables
 * the route even when the rest of the pipeline is not configured. The scheduler is null then.
 */
export function drainDeps(): { secret: string; scheduler: Scheduler | null; log: DrainDeps['log'] } {
  const secret = str(useRuntimeConfig().videoDrainSecret)
  return {
    secret,
    scheduler: secret === '' ? null : (videoRuntime()?.scheduler ?? null),
    log: (entry) => console.error('[video]', { type: entry.type }),
  }
}

/**
 * `afterSave` of the tree route: queues the Current_Window of a new path (its first skill and
 * the next 2). In production `background` is always false, so the scheduler only writes due rows that
 * the drain runs. The tree request carries no language, so rows use `en`; the client's fill
 * request adds the learner's language later. Never throws; does nothing when the runtime is
 * not configured (spec: skill-video-pipeline, Req 8.1, 8.2, 8.4, 8.5, 9.11).
 */
export async function afterTreeSave(input: { pathId: string; tree: SkillTree }): Promise<void> {
  try {
    const runtime = videoRuntime()
    const first = input.tree.sections[0]?.nodes[0]
    if (!runtime || !first) return
    const window = currentWindow(input.tree, first.id)
    await runtime.scheduler.fillWindow(window.map((entry) => fillJobFor(input.tree.hobby, entry, 'en')))
  } catch {
    console.error('[video]', { type: 'after_save_failed' })
  }
}

let cached: { key: string; runtime: VideoRuntime } | undefined

/** Builds the real deps. Returns null when the Supabase URL or Service_Role_Key is missing. */
export function videoRuntime(): VideoRuntime | null {
  const config = useRuntimeConfig()
  const url = str(config.public.supabaseUrl)
  const serviceRoleKey = str(config.supabaseServiceRoleKey)
  if (url === '' || serviceRoleKey === '') return null

  const youtubeKey = str(config.youtubeApiKey)
  const llm = defaultConfig(config)
  const key = [url, serviceRoleKey, youtubeKey, llm?.provider, llm?.model, llm?.apiKey, config.videoDailyQuota].join('\n')
  if (cached?.key === key) return cached.runtime

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const pipeline: PipelineDeps = {
    store: new PostgresPipelineStore(client),
    provider: selectVideoProvider({ apiKey: youtubeKey }),
    adapter: adapters[llm?.provider ?? 'anthropic'],
    config: llm,
    dailyQuota: config.videoDailyQuota,
  }
  const runtime: VideoRuntime = {
    scheduler: createScheduler({ pipeline, background }),
    pipeline,
    limiter,
    drainSecret: str(config.videoDrainSecret),
  }
  cached = { key, runtime }
  return runtime
}
