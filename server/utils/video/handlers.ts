/**
 * Handlers of the video endpoints (spec: skill-video-pipeline, Req 10).
 * `handleVideosRequest` reads pools and ranks them; it never calls the provider or a model.
 * Work is only queued (as due rows) and only for a Signed_In_User.
 */
import type { Level, SkillTree } from '../../../shared/types/skill-tree'
import type { GoalClass, VideosResponse } from '../../../shared/types/video'
import { parseBearer } from '../../../shared/utils/auth'
import { languageCode, normalizeText, poolKey } from '../../../shared/utils/video-normalize'
import { withTimeout, type HandlerResponse } from '../llm-handlers'
import type { RateLimiter } from '../rate-limiter'
import { composeVideos, fallbackApplies } from './compose'
import type { PipelineStore, PoolRead } from './pipeline-store'
import { isStale } from './pool'
import {
  DRAIN_AFTER_REQUEST,
  DRAIN_ROUTE_MAX,
  currentWindow,
  fillJobFor,
  lazyTask,
  type BackgroundFn,
  type Scheduler,
  type WindowSkill,
} from './scheduler'

/** Longest accepted hobby and Skill title after trim (Req 10.5). */
export const VIDEO_TEXT_MAX_LENGTH = 100
/** Longest accepted path id and Skill id. */
const ID_MAX_LENGTH = 200
const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']

/** The part of a user's stored path the videos endpoint needs. */
export interface StoredPath {
  tree: SkillTree
  goalClass: GoalClass
}

export interface VideosDeps {
  /** The user id of a valid Access_Token, else null. */
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  verifyTimeoutMs: number
  /** Counts a Signed_In_User by `user:<id>` and a Signed_Out_User by `ip:<address>`. */
  limiter: RateLimiter
  store: Pick<PipelineStore, 'readPools'>
  scheduler: Pick<Scheduler, 'requestFill' | 'drainDue'>
  background: BackgroundFn
  /**
   * Loads the user's path with the user's own token (RLS applies). Null when no such path
   * is visible; throws on a database error.
   */
  loadPath: (token: string, pathId: string, signal: AbortSignal) => Promise<StoredPath | null>
  loadTimeoutMs: number
  /** Receives fixed labels only, never keys, tokens or bodies. */
  log?: (entry: { type: string }) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && (LEVELS as readonly string[]).includes(value)
}

/** Trimmed string of 1 to `max` characters, else null. */
function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length >= 1 && text.length <= max ? text : null
}

function invalid(field: string): HandlerResponse<VideosResponse> {
  return { status: 400, body: { error: 'invalid_input', field } }
}

const UNAUTHORIZED: HandlerResponse<VideosResponse> = { status: 401, body: { error: 'unauthorized' } }
const RATE_LIMITED: HandlerResponse<VideosResponse> = { status: 429, body: { error: 'rate_limited' } }

/** A pool counts as Fresh_Pool when it exists and is younger than the Pool_Expiry, on the store clock. */
function isFresh(read: PoolRead | undefined): boolean {
  return !!read?.pool && !isStale((read.nowMs - read.pool.storedAt) / 1000, read.pool.videos.length)
}

/** A fill is in progress: not fresh and an unexpired Run_Lease exists. */
function isRunning(read: PoolRead | undefined): boolean {
  return !!read && !isFresh(read) && read.leaseActive
}

/** A fill must be requested: missing or stale pool, no unexpired lease, no queued fill waiting for a later time. */
function needsFill(read: PoolRead | undefined): boolean {
  if (!read || isFresh(read) || read.leaseActive) return false
  return read.fillNextRunMs === null || read.fillNextRunMs <= read.nowMs
}

/** The stored Skill with its section level, or null when no Skill has this id. */
function findSkill(tree: SkillTree, skillId: string): WindowSkill | null {
  for (const section of tree.sections) {
    const node = section.nodes.find((n) => n.id === skillId)
    if (node) return { node, level: section.level }
  }
  return null
}

export async function handleVideosRequest(
  input: { body: unknown; authorization: string | undefined; clientIp: string | undefined },
  deps: VideosDeps,
): Promise<HandlerResponse<VideosResponse>> {
  // 1. Access_Token. A present token that cannot be verified is a 401 before any other work (Req 10.10).
  const header = typeof input.authorization === 'string' ? input.authorization.trim() : ''
  const token = parseBearer(header)
  let userId: string | null = null
  if (header !== '') {
    if (token === null) return UNAUTHORIZED
    let verified: string | null | undefined
    try {
      verified = await withTimeout<string | null | undefined>(deps.verifyTimeoutMs, undefined, (signal) =>
        deps.verifyToken(token, signal),
      )
    }
    catch {
      verified = null
    }
    if (typeof verified !== 'string' || verified === '') return UNAUTHORIZED
    userId = verified
  }
  const signedIn = userId !== null && token !== null

  // 2. Validation (Req 10.5).
  const body = isRecord(input.body) ? input.body : {}
  const hobby = boundedText(body.hobby, VIDEO_TEXT_MAX_LENGTH)
  if (hobby === null) return invalid('hobby')
  const skillTitle = boundedText(body.skillTitle, VIDEO_TEXT_MAX_LENGTH)
  if (skillTitle === null) return invalid('skillTitle')
  if (!isLevel(body.level)) return invalid('level')
  const level = body.level
  let pathId = ''
  let skillId = ''
  if (signedIn) {
    const p = boundedText(body.pathId, ID_MAX_LENGTH)
    if (p === null) return invalid('pathId')
    const s = boundedText(body.skillId, ID_MAX_LENGTH)
    if (s === null) return invalid('skillId')
    pathId = p
    skillId = s
  }
  const language = languageCode(typeof body.language === 'string' ? body.language : null)

  // 3. Rate limit, before any pool read (Req 10.6).
  const limitKey = signedIn ? `user:${userId}` : `ip:${input.clientIp?.trim() || 'unknown'}`
  if (!deps.limiter.tryConsume(limitKey)) return RATE_LIMITED

  // 4. Read the pools in one call. No provider or model call in this path (Req 10.2).
  const userKey = poolKey({ hobby, skillTitle, level, language })
  const enKey = poolKey({ hobby, skillTitle, level, language: 'en' })
  const wantEn = language !== 'en'
  let reads: PoolRead[]
  try {
    reads = await deps.store.readPools(wantEn ? [userKey, enKey] : [userKey])
  }
  catch {
    deps.log?.({ type: 'pool_read_failed' })
    return { status: 200, body: { videos: [], fillInProgress: false } }
  }
  const userRead = reads.find((r) => r.poolKey === userKey)
  const enRead = wantEn ? reads.find((r) => r.poolKey === enKey) : undefined

  // 5. Goal_Class from the user's own path; Signed_Out_Users and failures use `none` (Req 11.6, 11.12).
  let path: StoredPath | null | undefined
  let pathFailed = false
  if (signedIn && token !== null) {
    try {
      path = await withTimeout<StoredPath | null | undefined>(deps.loadTimeoutMs, undefined, (signal) =>
        deps.loadPath(token, pathId, signal),
      )
      if (path === undefined) pathFailed = true
    }
    catch {
      pathFailed = true
    }
    if (pathFailed) deps.log?.({ type: 'path_load_failed' })
  }
  const goal: GoalClass = path?.goalClass ?? 'none'

  // 6. Rank, fall back to English, dedupe, limit (Req 10.1, 10.15 to 10.18).
  const videos = composeVideos({
    language,
    goal,
    userPool: userRead?.pool ?? null,
    enPool: enRead?.pool ?? null,
  })

  // 7. Signed_Out_User: read-only. No fill, no drain, no provider or model call (Req 10.9, 10.11, 10.12).
  if (!signedIn) return { status: 200, body: { videos, fillInProgress: false } }

  // 8. Signed_In_User: decide which pools need a fill (Req 10.4, 10.19, 10.20).
  const fallback = fallbackApplies(language, userRead?.pool?.videos.length ?? 0)
  let fillInProgress = isRunning(userRead) || (fallback && isRunning(enRead))
  const wanted: string[] = []
  if (needsFill(userRead)) wanted.push(language)
  if (fallback && needsFill(enRead)) wanted.push('en')

  if (wanted.length > 0 && !pathFailed) {
    // Cross-check the Skill against the stored path before any fill (Req 10.13, 10.14).
    const entry = path ? findSkill(path.tree, skillId) : null
    if (
      !path
      || !entry
      || normalizeText(path.tree.hobby) !== normalizeText(hobby)
      || normalizeText(entry.node.title) !== normalizeText(skillTitle)
      || entry.level !== level
    ) {
      return invalid('skillId')
    }
    for (const lang of wanted) {
      const { inProgress } = await deps.scheduler.requestFill(fillJobFor(path.tree.hobby, entry, lang))
      if (inProgress) fillInProgress = true
    }
  }

  // 9. Opportunistic drain of at most 2 due fills. Refused on Vercel, where the cron job drains (Req 9.18).
  try {
    deps.background(lazyTask(() => deps.scheduler.drainDue(DRAIN_AFTER_REQUEST)))
  }
  catch {
    deps.log?.({ type: 'drain_failed' })
  }

  return { status: 200, body: { videos, fillInProgress } }
}

/** Response of POST /api/videos/fill and /api/videos/drain. No pipeline state is ever included. */
export type AcceptedBody = { accepted: true } | { error: 'invalid_input' | 'unauthorized' | 'rate_limited' | 'not_found'; field?: string }

export interface FillDeps {
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  verifyTimeoutMs: number
  limiter: RateLimiter
  scheduler: Pick<Scheduler, 'fillWindow'>
  loadPath: (token: string, pathId: string, signal: AbortSignal) => Promise<StoredPath | null>
  loadTimeoutMs: number
  log?: (entry: { type: string }) => void
}

const FILL_ACCEPTED: HandlerResponse<AcceptedBody> = { status: 202, body: { accepted: true } }

/**
 * POST /api/videos/fill: queues the Current_Window of the user's path (Req 8.3, 8.10).
 * Needs a verified Access_Token; a Signed_Out_User never reaches any work. On Vercel no
 * background execution exists, so the scheduler only writes due rows (a few quick database
 * calls) and the handler awaits them before it answers 202. The runs happen in the drain.
 */
export async function handleFillRequest(
  input: { body: unknown; authorization: string | undefined },
  deps: FillDeps,
): Promise<HandlerResponse<AcceptedBody>> {
  const header = typeof input.authorization === 'string' ? input.authorization.trim() : ''
  const token = parseBearer(header)
  if (token === null) return { status: 401, body: { error: 'unauthorized' } }
  let userId: string | null | undefined
  try {
    userId = await withTimeout<string | null | undefined>(deps.verifyTimeoutMs, undefined, (signal) =>
      deps.verifyToken(token, signal),
    )
  }
  catch {
    userId = null
  }
  if (typeof userId !== 'string' || userId === '') return { status: 401, body: { error: 'unauthorized' } }

  const body = isRecord(input.body) ? input.body : {}
  const pathId = boundedText(body.pathId, ID_MAX_LENGTH)
  if (pathId === null) return { status: 400, body: { error: 'invalid_input', field: 'pathId' } }
  const currentSkillId = boundedText(body.currentSkillId, ID_MAX_LENGTH)
  if (currentSkillId === null) return { status: 400, body: { error: 'invalid_input', field: 'currentSkillId' } }
  const language = languageCode(typeof body.language === 'string' ? body.language : null)

  if (!deps.limiter.tryConsume(`user:${userId}`)) return { status: 429, body: { error: 'rate_limited' } }

  let path: StoredPath | null | undefined
  try {
    path = await withTimeout<StoredPath | null | undefined>(deps.loadTimeoutMs, undefined, (signal) =>
      deps.loadPath(token, pathId, signal),
    )
  }
  catch {
    path = undefined
  }
  // A path that cannot be read changes nothing for the learner: videos are optional.
  if (path === undefined) {
    deps.log?.({ type: 'path_load_failed' })
    return FILL_ACCEPTED
  }
  if (path === null) return { status: 400, body: { error: 'invalid_input', field: 'pathId' } }

  const window = currentWindow(path.tree, currentSkillId)
  if (window.length === 0) return { status: 400, body: { error: 'invalid_input', field: 'currentSkillId' } }

  try {
    await deps.scheduler.fillWindow(window.map((entry) => fillJobFor(path.tree.hobby, entry, language)))
  }
  catch {
    deps.log?.({ type: 'fill_window_failed' })
  }
  return FILL_ACCEPTED
}

/** Header that carries the Drain_Route secret. */
export const DRAIN_SECRET_HEADER = 'x-video-drain-secret'
/** The drain stops starting new runs after this much of its time budget (Vercel limit is 60 s). */
export const DRAIN_BUDGET_MS = 50_000

export interface DrainDeps {
  /** Secret from server config. Empty or missing disables the route. */
  secret: string
  scheduler: Pick<Scheduler, 'drainDue'>
  /** Epoch ms. Defaults to Date.now. */
  now?: () => number
  budgetMs?: number
  log?: (entry: { type: string }) => void
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/**
 * Compares two strings in constant time, whatever their lengths: both are hashed to 32 bytes
 * and every byte is compared with no early exit (no `@types/node`, so no `timingSafeEqual`).
 */
export async function secretsMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

/**
 * POST /api/videos/drain: runs due fills, at most 5, called by pg_cron + pg_net (Req 9.20, 9.21).
 * No configured secret: 404 (route disabled). Missing or wrong header: 401. Both run nothing.
 * The work is awaited here, because no background execution exists on Vercel.
 */
export async function handleDrainRequest(
  input: { secretHeader: string | undefined },
  deps: DrainDeps,
): Promise<HandlerResponse<AcceptedBody>> {
  if (deps.secret === '') return { status: 404, body: { error: 'not_found' } }
  if (typeof input.secretHeader !== 'string' || !(await secretsMatch(input.secretHeader, deps.secret))) {
    return { status: 401, body: { error: 'unauthorized' } }
  }

  const now = deps.now ?? Date.now
  const deadline = now() + (deps.budgetMs ?? DRAIN_BUDGET_MS)
  let started = 0
  try {
    // One fill per call, so the time budget is checked before each new run.
    while (started < DRAIN_ROUTE_MAX && now() < deadline) {
      const ran = await deps.scheduler.drainDue(1)
      if (ran === 0) break
      started += ran
    }
  }
  catch {
    deps.log?.({ type: 'drain_failed' })
  }
  return { status: 202, body: { accepted: true } }
}
