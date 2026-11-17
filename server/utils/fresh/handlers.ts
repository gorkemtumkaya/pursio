/**
 * Handlers of the Fresh routes (spec: fresh, design "Scheduling" and "Fresh_Endpoint").
 *
 * - `handleCheckRequest`: POST /api/fresh/check (Check_Route), called by pg_cron + pg_net.
 * - `parseFreshRequest` and `handleFreshRequest`: POST /api/fresh (Fresh_Endpoint).
 *
 * Import boundary (Req 3.11, 8.6): this module has no value import of `check.ts`,
 * `feed-fetch.ts`, a video provider or a model adapter. The Check_Route receives
 * `runFreshCheck` and the work deps through `CheckRunDeps` (wired in `runtime.ts`); the
 * Fresh_Endpoint deps hold only the token check, the limiter, the page read and the user read,
 * so the endpoint cannot start a check, fetch a feed or call a provider or model.
 *
 * Logs carry fixed types only, never a URL, header, body, token, secret or key (Req 7.6, 18.6).
 */
import type {
  ChannelMute,
  CheckKey,
  FreshPath,
  FreshPathSkill,
  FreshRequest,
  FreshRequestPath,
  FreshResponse,
  FreshResponseOk,
  FreshSkillPool,
} from '../../../shared/types/fresh'
import type { VideoEvent, VideoPool } from '../../../shared/types/video'
import { isColorSlot, type ColorSlot } from '../../../shared/utils/color-slot'
import { checkKeyId, checkKeysForPath } from '../../../shared/utils/fresh-keys'
import { languageCode, poolKey } from '../../../shared/utils/video-normalize'
import { withTimeout, type HandlerResponse } from '../llm-handlers'
import type { RateLimiter } from '../rate-limiter'
import {
  REQUEST_ID_MAX_LENGTH,
  boundedText,
  isLevel,
  rateLimitKey,
  secretsMatch,
  verifyRequestToken,
} from '../video/request-guards'
import type { FreshCheckDeps, FreshCheckOutcome } from './check'
import { FRESH_PAGE_WINDOW_S, FRESH_RETENTION_S, type FreshStore } from './check-store'
import { composeFreshItems, poolCardsFor, windowSkillIds, type PathScope } from './compose'
import { CALL_DEADLINE_MS, CHECKS_PER_CALL, START_WINDOW_MS, activeCheckKeys, dueOrder, isDue } from './schedule'

// ---------------------------------------------------------------------------
// Check_Route
// ---------------------------------------------------------------------------

/** Header that carries the Check_Route secret. */
export const CHECK_SECRET_HEADER = 'x-fresh-check-secret'

/** Response of POST /api/fresh/check: never a secret, Lease or item (Req 3.3). */
export type CheckRouteBody = { accepted: true } | { error: 'unauthorized' | 'not_found' }

/** Runs one Fresh_Check; `runFreshCheck` in production. Must not throw (a throw counts as a failure). */
export type RunFreshCheck = (
  key: CheckKey,
  runId: string,
  startedMs: number,
  deps: FreshCheckDeps,
) => Promise<FreshCheckOutcome>

/** The work side of the Check_Route; null when the pipeline is not configured. */
export interface CheckRunDeps {
  store: FreshStore
  /** The same store raced against the Call_Deadline signal (Postgres `withDeadline`). Default: `store`. */
  bindStore?: (deadline: AbortSignal) => FreshStore
  runCheck: RunFreshCheck
  /** Deps of every Fresh_Check that do not depend on the call. */
  check: Pick<FreshCheckDeps, 'gate' | 'provider' | 'adapter' | 'config' | 'feedFetcher' | 'judgePrompt'>
  /** A uuid per Lease. Default `crypto.randomUUID`. */
  newRunId?: () => string
}

export interface CheckRouteDeps {
  /** Secret from server config. Empty disables the route (404). */
  secret: string
  run: CheckRunDeps | null
  /** App clock, epoch ms. Default `Date.now`. */
  now?: () => number
  /** Timeout signal factory for the Call_Deadline and per-call limits. Default `AbortSignal.timeout`. */
  timer?: (ms: number) => AbortSignal
  /** Fixed types only; `checkKey` is `checkKeyId(key)` for failed checks. */
  log?: (entry: { type: string; checkKey?: string }) => void
}

const CHECK_ACCEPTED: HandlerResponse<CheckRouteBody> = { status: 202, body: { accepted: true } }

function safeLog(log: CheckRouteDeps['log'], entry: { type: string; checkKey?: string }): void {
  try {
    log?.(entry)
  } catch {
    // Logging must not change the response.
  }
}

/**
 * POST /api/fresh/check (Req 3.3 to 3.8, 3.12 to 3.15, 7.4).
 * No configured secret: 404. Missing or wrong header: 401. Both run nothing.
 * Otherwise: cleanup, Active_Check_Keys, due order, then Fresh_Checks one after another,
 * at most 3, each started within 10 s of the call start, skipping held Leases without
 * counting them. Every check gets the Call_Deadline signal (call start + 117 s). Always 202.
 */
export async function handleCheckRequest(
  input: { secretHeader: string | undefined },
  deps: CheckRouteDeps,
): Promise<HandlerResponse<CheckRouteBody>> {
  if (deps.secret === '') return { status: 404, body: { error: 'not_found' } }
  if (typeof input.secretHeader !== 'string' || !(await secretsMatch(input.secretHeader, deps.secret))) {
    safeLog(deps.log, { type: 'check_rejected' })
    return { status: 401, body: { error: 'unauthorized' } }
  }
  const run = deps.run
  if (!run) {
    safeLog(deps.log, { type: 'not_configured' })
    return CHECK_ACCEPTED
  }

  const now = deps.now ?? Date.now
  const timer = deps.timer ?? ((ms: number) => AbortSignal.timeout(ms))
  const callStart = now()
  const callDeadline = callStart + CALL_DEADLINE_MS
  const deadline = timer(CALL_DEADLINE_MS)
  const store = run.bindStore ? run.bindStore(deadline) : run.store
  const newRunId = run.newRunId ?? (() => crypto.randomUUID())

  // Cleanup first; a failure is logged and the checks still run (Req 7.4).
  try {
    await store.cleanup()
  } catch {
    safeLog(deps.log, { type: 'cleanup_failed' })
  }

  // Active keys, their states and the due order (Req 3.5 to 3.7, 3.16).
  let due: CheckKey[]
  let deadlineDbMs: number
  try {
    const keys = activeCheckKeys(await store.activeHobbies())
    if (keys.length === 0) return CHECK_ACCEPTED
    const read = await store.checkStates(keys)
    // The Call_Deadline in db time: the db now of the read plus the time left at that read.
    deadlineDbMs = read.nowMs + (callDeadline - now())
    due = dueOrder(read.states.filter((s) => isDue(s, read.nowMs))).map((s) => s.key)
  } catch {
    safeLog(deps.log, { type: 'store_failed' })
    return CHECK_ACCEPTED
  }

  // Loop: at most 3 started, each within the Start_Window (Req 3.3, 3.8, 3.12, 3.13).
  let started = 0
  for (const key of due) {
    if (started >= CHECKS_PER_CALL || now() - callStart > START_WINDOW_MS || deadline.aborted) break
    const runId = newRunId()
    let startedMs: number | null
    try {
      startedMs = await store.takeLease(key, runId)
    } catch {
      safeLog(deps.log, { type: 'store_failed' })
      continue
    }
    if (startedMs === null) continue // held: skipped, not counted, no attempt recorded
    started += 1
    try {
      await run.runCheck(key, runId, startedMs, {
        ...run.check,
        store,
        deadline,
        remainingMs: () => callDeadline - now(),
        deadlineDbMs,
        timer,
        log: (entry) => safeLog(deps.log, { checkKey: entry.checkKey, type: entry.type }),
      })
    } catch {
      // runFreshCheck never throws; a throwing replacement counts as a failed check.
      safeLog(deps.log, { checkKey: checkKeyId(key), type: 'store_failed' })
    }
  }
  return CHECK_ACCEPTED
}

// ---------------------------------------------------------------------------
// Fresh_Endpoint
// ---------------------------------------------------------------------------

/** Most paths in a signed-out body, and most paths one response covers (Req 8.3, 8.7). */
export const FRESH_PATHS_MAX = 10
/** Most Skills in one path of a signed-out body (Req 8.3). */
export const FRESH_SKILLS_MAX = 200
/** Longest hobby and Skill title after trim (Req 8.3). */
export const FRESH_TEXT_MAX_LENGTH = 100

/** One path of the response scope, with the hobby its pools are stored under. */
export interface FreshScopePath {
  path: FreshPath
  /** Raw hobby text of the pools (the tree hobby for a stored path). */
  poolHobby: string
}

/** What `loadFreshUserData` returns for a Signed_In_User (read with the user's token, RLS). */
export interface FreshUserData {
  /** `languageCode(profiles.language)`: missing or empty gives `en`. */
  language: string
  /** Non-archived paths, created_at ascending. */
  paths: FreshScopePath[]
  mutes: ChannelMute[]
  events: VideoEvent[]
}

export interface FreshEndpointDeps {
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  verifyTimeoutMs: number
  /** Counts `user:<id>` or `ip:<address>` (Req 8.5). */
  limiter: RateLimiter
  /** The single service-role read (`fresh_page_read`). */
  store: Pick<FreshStore, 'readPage'>
  /** Paths, progress, profile language, events and mutes. Throws on a database error. */
  loadUserData: (token: string, userId: string, signal: AbortSignal) => Promise<FreshUserData>
  loadTimeoutMs: number
  /** App clock for the timing log and the empty response. Default `Date.now`. */
  now?: () => number
  /** Fixed types only; `durationMs` only on `fresh_timing`. */
  log?: (entry: { type: string; durationMs?: number }) => void
}

export type FreshParseResult = { ok: true; request: FreshRequest } | { ok: false; field: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates a signed-out body (Req 8.2, 8.3). Returns the request (texts trimmed, language
 * reduced by `languageCode`) or the first invalid field, in the order `body`, `language`,
 * `paths`, then per path `paths.<i>.id`, `.hobby`, `.skills`, `.skills.<j>.id`, `.title`,
 * `.level`, `.currentSkillId`, then `paths[<i>].colorSlot` and `paths[<i>].completedCount`.
 * A missing, null, empty or whitespace-only language is `en`.
 * `currentSkillId` must be null or the id of one of the path's Skills.
 * `colorSlot` must be an integer from 1 to 5 and `completedCount` an integer from 0 to the
 * path's Skill count; a missing one (a tab opened before fresh-v2) reads as slot 1 and
 * 0 completed (spec: fresh-v2, Req 9.9, D-C).
 */
export function parseFreshRequest(body: unknown): FreshParseResult {
  if (!isRecord(body)) return { ok: false, field: 'body' }
  const rawLanguage = body.language
  if (rawLanguage !== undefined && rawLanguage !== null && typeof rawLanguage !== 'string') {
    return { ok: false, field: 'language' }
  }
  const language = languageCode(rawLanguage ?? null)
  const rawPaths = body.paths
  if (!Array.isArray(rawPaths) || rawPaths.length > FRESH_PATHS_MAX) return { ok: false, field: 'paths' }

  const paths: FreshRequestPath[] = []
  for (let i = 0; i < rawPaths.length; i += 1) {
    const at = `paths.${i}`
    const raw: unknown = rawPaths[i]
    const p = isRecord(raw) ? raw : {}
    const id = boundedText(p.id, REQUEST_ID_MAX_LENGTH)
    if (id === null) return { ok: false, field: `${at}.id` }
    const hobby = boundedText(p.hobby, FRESH_TEXT_MAX_LENGTH)
    if (hobby === null) return { ok: false, field: `${at}.hobby` }
    const rawSkills = p.skills
    if (!Array.isArray(rawSkills) || rawSkills.length < 1 || rawSkills.length > FRESH_SKILLS_MAX) {
      return { ok: false, field: `${at}.skills` }
    }
    const skills: FreshPathSkill[] = []
    for (let j = 0; j < rawSkills.length; j += 1) {
      const sat = `${at}.skills.${j}`
      const rawSkill: unknown = rawSkills[j]
      const s = isRecord(rawSkill) ? rawSkill : {}
      const skillId = boundedText(s.id, REQUEST_ID_MAX_LENGTH)
      if (skillId === null) return { ok: false, field: `${sat}.id` }
      const title = boundedText(s.title, FRESH_TEXT_MAX_LENGTH)
      if (title === null) return { ok: false, field: `${sat}.title` }
      if (!isLevel(s.level)) return { ok: false, field: `${sat}.level` }
      skills.push({ id: skillId, title, level: s.level })
    }
    const rawCurrent = p.currentSkillId
    let currentSkillId: string | null = null
    if (rawCurrent !== null) {
      const current = typeof rawCurrent === 'string' ? rawCurrent.trim() : ''
      if (!skills.some((s) => s.id === current)) return { ok: false, field: `${at}.currentSkillId` }
      currentSkillId = current
    }
    const rawSlot = p.colorSlot
    let colorSlot: ColorSlot = 1
    if (rawSlot !== undefined) {
      if (!isColorSlot(rawSlot)) return { ok: false, field: `paths[${i}].colorSlot` }
      colorSlot = rawSlot
    }
    const rawCompleted = p.completedCount
    let completedCount = 0
    if (rawCompleted !== undefined) {
      if (
        typeof rawCompleted !== 'number'
        || !Number.isInteger(rawCompleted)
        || rawCompleted < 0
        || rawCompleted > skills.length
      ) {
        return { ok: false, field: `paths[${i}].completedCount` }
      }
      completedCount = rawCompleted
    }
    paths.push({ id, hobby, skills, currentSkillId, colorSlot, completedCount })
  }
  return { ok: true, request: { language, paths } }
}

/** Signed-out scope: Goal_Class `none`, no activity time, window from the body (Req 8.2, 8.17). */
function requestScope(request: FreshRequest): FreshScopePath[] {
  return request.paths.map((p) => ({
    poolHobby: p.hobby,
    path: {
      id: p.id,
      hobbyId: null,
      hobby: p.hobby,
      goalClass: 'none',
      currentSkillId: p.currentSkillId,
      windowSkillIds: windowSkillIds(p.skills, p.currentSkillId),
      skills: p.skills.map((s) => ({ ...s })),
      activeAt: null,
      colorSlot: p.colorSlot,
      completedCount: p.completedCount,
    },
  }))
}

function emptyResponse(nowMs: number, language: string, paths: FreshPath[]): FreshResponseOk {
  return { nowMs, language, paths, items: [], pools: [], sources: [], checkTimes: [], mutes: [], events: [] }
}

/** Check keys of every path (Req 8.17), deduplicated, in path order. */
function checkKeysOf(scope: readonly FreshScopePath[], language: string): CheckKey[] {
  const keys = new Map<string, CheckKey>()
  for (const { path } of scope) {
    for (const key of checkKeysForPath(path.hobby, language)) keys.set(checkKeyId(key), key)
  }
  return [...keys.values()]
}

interface WindowPoolKeys {
  pathIndex: number
  skillId: string
  userKey: string
  enKey: string | null
}

/** Pool_Keys of every window Skill: user language, plus `en` when the language is not `en`. */
function windowPoolKeys(scope: readonly FreshScopePath[], language: string): WindowPoolKeys[] {
  const out: WindowPoolKeys[] = []
  scope.forEach(({ path, poolHobby }, pathIndex) => {
    for (const skillId of path.windowSkillIds) {
      const skill = path.skills.find((s) => s.id === skillId)
      if (!skill) continue
      const parts = { hobby: poolHobby, skillTitle: skill.title, level: skill.level }
      out.push({
        pathIndex,
        skillId,
        userKey: poolKey({ ...parts, language }),
        enKey: language === 'en' ? null : poolKey({ ...parts, language: 'en' }),
      })
    }
  })
  return out
}

const UNAUTHORIZED: HandlerResponse<FreshResponse> = { status: 401, body: { error: 'unauthorized' } }
const RATE_LIMITED: HandlerResponse<FreshResponse> = { status: 429, body: { error: 'rate_limited' } }

/**
 * POST /api/fresh (Req 8). Read-only: one token check, one parallel user read (signed in),
 * one `readPage` call, then pure composition. Any read failure gives 200 with empty lists
 * and no check time (Req 8.9).
 */
export async function handleFreshRequest(
  input: { body: unknown; authorization: string | undefined; clientIp: string | undefined },
  deps: FreshEndpointDeps,
): Promise<HandlerResponse<FreshResponse>> {
  const now = deps.now ?? Date.now
  const begin = now()
  const log = (entry: { type: string; durationMs?: number }): void => {
    try {
      deps.log?.(entry)
    } catch {
      // Logging must not change the response.
    }
  }
  const done = (result: HandlerResponse<FreshResponse>): HandlerResponse<FreshResponse> => {
    log({ type: 'fresh_timing', durationMs: Math.max(0, now() - begin) })
    return result
  }

  // 1. Access_Token: a present token that cannot be verified is a 401 before any read (Req 8.4).
  const auth = await verifyRequestToken(input.authorization, deps)
  if (auth.kind === 'unauthorized') return done(UNAUTHORIZED)

  // 2. Signed out: the body is validated before any read (Req 8.3). Signed in: it is ignored.
  let request: FreshRequest | null = null
  if (auth.kind === 'anonymous') {
    const parsed = parseFreshRequest(input.body)
    if (!parsed.ok) return done({ status: 400, body: { error: 'invalid_input', field: parsed.field } })
    request = parsed.request
  }

  // 3. Rate limit before any read (Req 8.5).
  const userId = auth.kind === 'user' ? auth.userId : null
  if (!deps.limiter.tryConsume(rateLimitKey(userId, input.clientIp))) return done(RATE_LIMITED)

  // 4. Scope: the user's stored paths, or the body.
  let language: string
  let scope: FreshScopePath[]
  let mutes: ChannelMute[] = []
  let events: VideoEvent[] = []
  if (auth.kind === 'user') {
    let data: FreshUserData | undefined
    try {
      data = await withTimeout<FreshUserData | undefined>(deps.loadTimeoutMs, undefined, (signal) =>
        deps.loadUserData(auth.token, auth.userId, signal),
      )
    } catch {
      data = undefined
    }
    if (!data) {
      log({ type: 'fresh_read_failed' })
      return done({ status: 200, body: emptyResponse(now(), 'en', []) })
    }
    language = languageCode(data.language)
    scope = data.paths.slice(0, FRESH_PATHS_MAX)
    mutes = data.mutes
    events = data.events
  } else {
    language = request?.language ?? 'en'
    scope = requestScope(request ?? { language, paths: [] })
  }
  const paths = scope.map((s) => s.path)

  // 5. No paths: empty lists and no check time (Req 8.13).
  if (scope.length === 0) return done({ status: 200, body: emptyResponse(now(), language, []) })

  // 6. One service-role read (Req 8.1, 8.10).
  const checkKeys = checkKeysOf(scope, language)
  const windowKeys = windowPoolKeys(scope, language)
  const poolKeys = [...new Set(windowKeys.flatMap((w) => (w.enKey ? [w.userKey, w.enKey] : [w.userKey])))]
  let read: Awaited<ReturnType<FreshStore['readPage']>>
  try {
    read = await deps.store.readPage({ checkKeys, poolKeys })
  } catch {
    log({ type: 'fresh_read_failed' })
    return done({ status: 200, body: emptyResponse(now(), language, paths) })
  }

  // 7. Compose (Req 8.1, 8.11, 8.12, 8.17). The read filters by time already; the filter is
  // repeated here so a store that returns more never shows an old item (Req 7.10, 8.10).
  const publishedAfter = read.nowMs - FRESH_PAGE_WINDOW_S * 1000
  const foundAfter = read.nowMs - FRESH_RETENTION_S * 1000
  const pathScopes: PathScope[] = scope.map(({ path }) => ({ pathId: path.id, hobby: path.hobby, skills: path.skills }))
  const items = composeFreshItems({
    language,
    paths: pathScopes,
    items: read.items.filter((i) => i.publishedMs > publishedAfter && i.foundMs > foundAfter),
  })
  const poolByKey = new Map<string, VideoPool>(read.pools.map((p) => [p.poolKey, p]))
  const pools: FreshSkillPool[] = windowKeys.map((w) => {
    const path = scope[w.pathIndex]?.path
    return poolCardsFor({
      language,
      goal: path?.goalClass ?? 'none',
      pathId: path?.id ?? '',
      skillId: w.skillId,
      userPool: poolByKey.get(w.userKey) ?? null,
      enPool: w.enKey ? (poolByKey.get(w.enKey) ?? null) : null,
    })
  })

  const wanted = new Set(checkKeys.map(checkKeyId))
  const body: FreshResponseOk = {
    nowMs: read.nowMs,
    language,
    paths,
    items,
    pools,
    sources: read.sources.filter((s) => wanted.has(checkKeyId({ hobby: s.hobby, language: s.language }))),
    checkTimes: read.checkTimes.filter((t) => wanted.has(checkKeyId({ hobby: t.hobby, language: t.language }))),
    mutes,
    events,
  }
  return done({ status: 200, body })
}
