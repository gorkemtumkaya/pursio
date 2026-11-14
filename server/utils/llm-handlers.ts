import type { PathSaveInput } from '../../shared/types/cloud'
import type { ErrorCode, Provider, ProviderConfig, StartLevel, TestResponse, TreeResponse } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import { parseBearer } from '../../shared/utils/auth'
import { DEFAULT_LEVEL, HOBBY_MAX_LENGTH, MODEL_MAX_LENGTH, isProvider, isStartLevel } from '../../shared/utils/llm'
import type { GoalClass } from '../../shared/types/video'
import { classifyGoal } from './goal-classifier'
import { generateSkillTree, type GenerationResult } from './generator'
import type { ProviderAdapter } from './providers/types'
import type { RateLimiter } from './rate-limiter'
import { cacheKey, type TreeCache } from './tree-cache'

/** Longest accepted Goal after trim. */
const GOAL_MAX_LENGTH = 200

export interface HandlerResponse<B> {
  status: number
  body: B
}

export interface DefaultConfigInput {
  provider: string
  model: string
  apiKey: string
}

export const ERROR_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  not_a_hobby: 422,
  rate_limited: 429,
  timeout: 504,
  generation_failed: 502,
  provider_auth: 502,
  provider_error: 502,
  no_key: 503,
  unauthorized: 401,
  save_failed: 502,
}

export type ResolvedConfig =
  | { ok: true; config: ProviderConfig; source: 'user' | 'default' }
  | { ok: false; status: 400 | 503; code: 'invalid_input' | 'no_key' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed model id of 1 to 100 characters, or undefined. */
function validModel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const model = value.trim()
  return model.length >= 1 && model.length <= MODEL_MAX_LENGTH ? model : undefined
}

/**
 * A non-empty header key gives a User_Config built from the body's provider and model (Req 2.1, 2.3).
 * Otherwise the Default_Config is used and body fields are ignored (Req 2.2, 2.4).
 */
export function resolveProviderConfig(input: {
  headerKey: string | undefined
  body: Record<string, unknown>
  defaults: DefaultConfigInput
}): ResolvedConfig {
  const userKey = input.headerKey?.trim() ?? ''
  if (userKey !== '') {
    const provider = input.body.provider
    const model = validModel(input.body.model)
    if (!isProvider(provider) || model === undefined) {
      return { ok: false, status: 400, code: 'invalid_input' }
    }
    return { ok: true, config: { provider, model, apiKey: userKey }, source: 'user' }
  }
  const { provider, model, apiKey } = input.defaults
  const defaultModel = model.trim()
  const defaultKey = apiKey.trim()
  if (!isProvider(provider) || defaultModel === '' || defaultKey === '') {
    return { ok: false, status: 503, code: 'no_key' }
  }
  return { ok: true, config: { provider, model: defaultModel, apiKey: defaultKey }, source: 'default' }
}

/**
 * Runs `task` with an abort signal that fires after `ms`. The task is raced against the abort,
 * so a call that ignores the signal still ends on time. The timer is always cleared.
 */
export async function withTimeout<T>(ms: number, onTimeout: T, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve(onTimeout)
    }, ms)
  })
  try {
    return await Promise.race([task(controller.signal), timedOut])
  } finally {
    clearTimeout(timer)
  }
}

/** Where in the request a failure happened (spec: tree-api-502-on-new-path). */
export type TreeStage = 'token_check' | 'prompt_load' | 'provider_call' | 'tree_validation' | 'path_save'

/** One error log entry. `reason` is a short fixed label. Provider and model are absent before the config is resolved. */
export interface TreeLogEntry {
  code: ErrorCode
  stage: TreeStage
  reason: string
  provider?: Provider
  model?: string
}

/** A thrown error's `reason` if it is a short safe label, else 'unknown'. Never the message. */
function errorReason(error: unknown): string {
  const reason = isRecord(error) ? error.reason : undefined
  return typeof reason === 'string' && /^[A-Za-z0-9_:]{1,40}$/.test(reason) ? reason : 'unknown'
}

export interface TreeDeps {
  adapters: Record<Provider, ProviderAdapter>
  systemPrompt: () => Promise<string>
  defaults: DefaultConfigInput
  cache: TreeCache
  limiter: RateLimiter
  /** Generation limit (Req 8.1). */
  timeoutMs: number
  /** The user id of a valid Access_Token, else null (spec: accounts-cloud-save, Req 9.1). */
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  /** Saves the path with the user's own token and returns the Path_Row id; throws on failure. */
  savePath: (token: string, input: PathSaveInput, signal: AbortSignal) => Promise<string>
  /** 5_000 at runtime (spec: accounts-cloud-save, Req 9.2). */
  verifyTimeoutMs: number
  /** 10_000 at runtime (spec: accounts-cloud-save, Req 9.10). */
  saveTimeoutMs: number
  /**
   * Called after a successful save, not awaited; it must never block or fail the response
   * (spec: skill-video-pipeline, Req 8.1, 8.2).
   */
  afterSave?: (input: { pathId: string; tree: SkillTree }) => void | Promise<void>
  /** Receives only code, stage, reason, provider and model, never keys, tokens or bodies (Req 2.6). */
  log?: (entry: TreeLogEntry) => void
}

function treeError(code: ErrorCode): HandlerResponse<TreeResponse> {
  return { status: ERROR_STATUS[code], body: { error: code } }
}

export async function handleTreeRequest(
  input: { body: unknown; headerKey: string | undefined; authorization: string | undefined },
  deps: TreeDeps,
): Promise<HandlerResponse<TreeResponse>> {
  // 0. Access_Token before anything else (spec: accounts-cloud-save, Req 9.1, 9.2).
  // The user id comes from the verified token only, never from the request.
  const unauthorized = (reason: string): HandlerResponse<TreeResponse> => {
    deps.log?.({ code: 'unauthorized', stage: 'token_check', reason })
    return treeError('unauthorized')
  }
  const token = parseBearer(input.authorization)
  if (token === null) return unauthorized('missing_token')
  // undefined marks a timeout; null is a token the verifier rejected.
  let userId: string | null | undefined
  let verifyReason = 'invalid_token'
  try {
    userId = await withTimeout<string | null | undefined>(deps.verifyTimeoutMs, undefined, (signal) =>
      deps.verifyToken(token, signal),
    )
    if (userId === undefined) verifyReason = 'timeout'
  } catch {
    userId = null
    verifyReason = 'verify_error'
  }
  if (typeof userId !== 'string' || userId === '') return unauthorized(verifyReason)

  // 1. Hobby check (Req 1.1, 1.2).
  const body = isRecord(input.body) ? input.body : {}
  if (typeof body.hobby !== 'string') return treeError('invalid_input')
  const hobby = body.hobby.trim()
  if (hobby === '' || hobby.length > HOBBY_MAX_LENGTH) return treeError('invalid_input')

  // 1a. Optional Goal: a string of at most 200 characters after trim (spec: skill-video-pipeline, Req 1.11).
  let goal = ''
  if (body.goal !== undefined) {
    if (typeof body.goal !== 'string') return treeError('invalid_input')
    goal = body.goal.trim()
    if (goal.length > GOAL_MAX_LENGTH) return treeError('invalid_input')
  }

  // 1b. Starting level: missing means the default, anything else must be a StartLevel.
  const rawLevel = body.level
  if (rawLevel !== undefined && !isStartLevel(rawLevel)) return treeError('invalid_input')
  const level: StartLevel = rawLevel ?? DEFAULT_LEVEL

  // 2. Provider_Config (Req 2.1 to 2.4).
  const resolved = resolveProviderConfig({ headerKey: input.headerKey, body, defaults: deps.defaults })
  if (!resolved.ok) return treeError(resolved.code)
  const { config, source } = resolved
  const fail = (code: ErrorCode, stage: TreeStage, reason: string): HandlerResponse<TreeResponse> => {
    deps.log?.({ code, stage, reason, provider: config.provider, model: config.model })
    return treeError(code)
  }

  // 3. Cache lookup; a hit is not counted (Req 6.2, 7.3).
  const key = cacheKey(hobby, level, config.provider, config.model)
  const cached = deps.cache.get(key)
  let tree: SkillTree
  let model: string
  if (cached) {
    tree = cached.tree
    model = cached.model
  } else {
    // 4. Billable_Generation: Default_Config only, counted per user (Req 7.2, 7.3).
    if (source === 'default' && !deps.limiter.tryConsume(userId)) return fail('rate_limited', 'provider_call', 'rate_limited')

    // 5. Generator under the abort (Req 8.1).
    let systemPrompt: string
    try {
      systemPrompt = await deps.systemPrompt()
    } catch {
      return fail('provider_error', 'prompt_load', 'prompt_missing')
    }
    const timeout: GenerationResult = { kind: 'error', code: 'timeout' }
    let result: GenerationResult
    let thrown = false
    try {
      result = await withTimeout(deps.timeoutMs, timeout, (signal) =>
        generateSkillTree(hobby, level, config, { adapters: deps.adapters, systemPrompt, signal }),
      )
    } catch {
      result = { kind: 'error', code: 'provider_error' }
      thrown = true
    }
    if (result.kind === 'not_a_hobby') return fail('not_a_hobby', 'tree_validation', 'not_a_hobby')
    if (result.kind === 'error') {
      const { code } = result
      if (code === 'generation_failed') return fail(code, 'tree_validation', result.detail ?? 'bad_output')
      const { status } = result
      const httpReason =
        !thrown && typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
          ? `http_${status}`
          : undefined
      const reason = code === 'provider_auth' ? 'auth' : code === 'timeout' ? 'timeout' : 'provider'
      return fail(code, 'provider_call', httpReason ?? (thrown ? 'provider' : reason))
    }

    // 6. Cache the tree BEFORE the save. If the save fails, the learner's retry hits the cache:
    // no second provider call and no second use of the hourly limit (Req 9.10).
    deps.cache.set(key, { tree: result.tree, model: result.model })
    tree = result.tree
    model = result.model
  }

  // 7. Save as the user's Path_Row with the user's own token (Req 9.7 to 9.10).
  // The classifier is not billable and never throws; any failure gives 'none' (Req 1.11, 1.12).
  let goalClass: GoalClass = 'none'
  try {
    goalClass = await classifyGoal(goal, config, deps.adapters[config.provider])
  } catch {
    goalClass = 'none'
  }
  const saveInput: PathSaveInput = { hobby, level, tree, model, goalClass }
  // null marks a timeout (the sentinel); a thrown error carries its own reason.
  let pathId: string | null
  let saveReason = 'unknown'
  try {
    pathId = await withTimeout<string | null>(deps.saveTimeoutMs, null, (signal) =>
      deps.savePath(token, saveInput, signal),
    )
    saveReason = pathId === null ? 'timeout' : 'invalid_id'
  } catch (error) {
    pathId = null
    saveReason = errorReason(error)
  }
  if (typeof pathId !== 'string' || pathId === '') return fail('save_failed', 'path_save', saveReason)

  // 8. Start the video fill without waiting for it (spec: skill-video-pipeline, Req 8.1, 8.2).
  try {
    void Promise.resolve(deps.afterSave?.({ pathId, tree })).catch(() => {})
  } catch {
    // afterSave must never fail the response.
  }
  return { status: 200, body: { tree, model, pathId } }
}

export interface TestDeps {
  adapters: Record<Provider, ProviderAdapter>
  /** 15_000 at runtime (Req 12.3). */
  timeoutMs: number
}

export async function handleTestRequest(
  input: { body: unknown; headerKey: string | undefined },
  deps: TestDeps,
): Promise<HandlerResponse<TestResponse>> {
  const invalid: HandlerResponse<TestResponse> = { status: 400, body: { ok: false, error: 'invalid_input' } }
  const body = isRecord(input.body) ? input.body : {}
  const apiKey = input.headerKey?.trim() ?? ''
  const provider = body.provider
  const model = validModel(body.model)
  if (apiKey === '' || !isProvider(provider) || model === undefined) return invalid

  const config: ProviderConfig = { provider, model, apiKey }
  type Outcome = 'ok' | 'provider_auth' | 'provider_error' | 'timeout'
  let outcome: Outcome
  try {
    outcome = await withTimeout<Outcome>(deps.timeoutMs, 'timeout', async (signal) => {
      const result = await deps.adapters[provider].testConnection(config, signal)
      if (signal.aborted) return 'timeout'
      if (result.ok) return 'ok'
      // bad_output is not an ErrorCode; anything non-auth is a provider_error.
      return result.error === 'provider_auth' ? 'provider_auth' : 'provider_error'
    })
  } catch {
    outcome = 'provider_error'
  }
  return { status: 200, body: outcome === 'ok' ? { ok: true } : { ok: false, error: outcome } }
}
