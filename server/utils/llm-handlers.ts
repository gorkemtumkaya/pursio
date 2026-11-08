import type { ErrorCode, Provider, ProviderConfig, TestResponse, TreeResponse } from '../../shared/types/llm'
import { HOBBY_MAX_LENGTH, MODEL_MAX_LENGTH, isProvider } from '../../shared/utils/llm'
import { generateSkillTree, type GenerationResult } from './generator'
import type { ProviderAdapter } from './providers/types'
import type { RateLimiter } from './rate-limiter'
import { cacheKey, type TreeCache } from './tree-cache'

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
async function withTimeout<T>(ms: number, onTimeout: T, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
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

export interface TreeDeps {
  adapters: Record<Provider, ProviderAdapter>
  systemPrompt: () => Promise<string>
  defaults: DefaultConfigInput
  cache: TreeCache
  limiter: RateLimiter
  /** 40_000 at runtime (Req 8.1). */
  timeoutMs: number
  /** Receives only the code, provider and model, never the key or bodies (Req 2.6). */
  log?: (entry: { code: ErrorCode; provider: Provider; model: string }) => void
}

function treeError(code: ErrorCode): HandlerResponse<TreeResponse> {
  return { status: ERROR_STATUS[code], body: { error: code } }
}

export async function handleTreeRequest(
  input: { body: unknown; headerKey: string | undefined; ip: string },
  deps: TreeDeps,
): Promise<HandlerResponse<TreeResponse>> {
  // 1. Hobby check (Req 1.1, 1.2).
  const body = isRecord(input.body) ? input.body : {}
  if (typeof body.hobby !== 'string') return treeError('invalid_input')
  const hobby = body.hobby.trim()
  if (hobby === '' || hobby.length > HOBBY_MAX_LENGTH) return treeError('invalid_input')

  // 2. Provider_Config (Req 2.1 to 2.4).
  const resolved = resolveProviderConfig({ headerKey: input.headerKey, body, defaults: deps.defaults })
  if (!resolved.ok) return treeError(resolved.code)
  const { config, source } = resolved
  const fail = (code: ErrorCode): HandlerResponse<TreeResponse> => {
    deps.log?.({ code, provider: config.provider, model: config.model })
    return treeError(code)
  }

  // 3. Cache lookup; a hit is not counted (Req 6.2, 7.3).
  const key = cacheKey(hobby, config.provider, config.model)
  const cached = deps.cache.get(key)
  if (cached) return { status: 200, body: { tree: cached.tree, model: cached.model } }

  // 4. Billable_Generation: Default_Config only (Req 7.2, 7.3).
  if (source === 'default' && !deps.limiter.tryConsume(input.ip)) return fail('rate_limited')

  // 5. Generator under the 40 s abort (Req 8.1).
  let systemPrompt: string
  try {
    systemPrompt = await deps.systemPrompt()
  } catch {
    return fail('provider_error')
  }
  const timeout: GenerationResult = { kind: 'error', code: 'timeout' }
  let result: GenerationResult
  try {
    result = await withTimeout(deps.timeoutMs, timeout, (signal) =>
      generateSkillTree(hobby, config, { adapters: deps.adapters, systemPrompt, signal }),
    )
  } catch {
    result = { kind: 'error', code: 'provider_error' }
  }

  // 6. Cache trees only, then map to a status (Req 4.5, 5.2, 5.4, 6.1, 8.3).
  if (result.kind === 'tree') {
    deps.cache.set(key, { tree: result.tree, model: result.model })
    return { status: 200, body: { tree: result.tree, model: result.model } }
  }
  return fail(result.kind === 'not_a_hobby' ? 'not_a_hobby' : result.code)
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
