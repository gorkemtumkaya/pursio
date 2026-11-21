// POST /api/intake (spec: path-intake, Requirement 2). Pure: every dependency is injected.
import { z } from 'zod'
import type { IntakeResponse } from '../../shared/types/learner-profile'
import type { ErrorCode, Provider, ProviderConfig } from '../../shared/types/llm'
import { parseBearer } from '../../shared/utils/auth'
import { NOTE_MAX, sanitizeIntakeProfile } from '../../shared/utils/learner-profile'
import { HOBBY_MAX_LENGTH, isProvider } from '../../shared/utils/llm'
import { createAiObservabilityContext, withAiObservabilityContext } from './ai-observability'
import { toProviderSchema, type JsonSchema } from './generation-schema'
import { ERROR_STATUS, withTimeout, type DefaultConfigInput, type HandlerResponse } from './llm-handlers'
import type { AdapterResult, ProviderAdapter } from './providers/types'
import type { RateLimiter } from './rate-limiter'

export type IntakeStage = 'token_check' | 'prompt_load' | 'provider_call' | 'sanitize'

/** One error log entry. Never the hobby, the Note or any text of the answer (Req 2.15). */
export interface IntakeLogEntry {
  code: ErrorCode
  stage: IntakeStage
  provider?: Provider
  model?: string
}

export interface IntakeDeps {
  adapters: Record<Provider, ProviderAdapter>
  systemPrompt: () => Promise<string>
  defaults: DefaultConfigInput
  /** Small_Model id per provider, from runtime config (decision 32). */
  smallModels: Record<Provider, string>
  /** Output limit per provider: 1200 for Anthropic, 2000 for OpenAI (decision 37). */
  maxTokens: Record<Provider, number>
  /** Lowest reasoning effort of the OpenAI Small_Model; empty sends none. */
  openaiReasoningEffort: string
  /** 30 per user per hour; its own instance, never the Tree_Route's (Req 2.3, 2.16). */
  limiter: RateLimiter
  verifyToken: (token: string, signal: AbortSignal) => Promise<string | null>
  /** One budget for the token check and the model call: 5000 at runtime (AS9). */
  deadlineMs: number
  /** Milliseconds; injected so tests control the budget. */
  now: () => number
  log?: (entry: IntakeLogEntry) => void
}

/**
 * What the model is asked for. Loose on purpose: plain strings and arrays, no limits.
 * The Sanitizer enforces the limits, so a small slip is repaired instead of failing the call.
 */
const optionShape = { id: z.string(), label: z.string() }
const goalOptionSchema = z.object({ ...optionShape, finishLine: z.string() })
export const rawIntakeSchema = z.object({
  notAHobby: z.boolean(),
  level: z.enum(['new', 'returning', 'regular']).nullable(),
  goal: goalOptionSchema.nullable(),
  avoid: z.array(z.string()),
  taste: z.array(z.string()),
  goalOptions: z.array(goalOptionSchema),
  knownOptions: z.array(z.object(optionShape)),
  tasteOptions: z.array(z.object(optionShape)),
  mascotSet: z.string(),
})

/** Closed object, every key required, as both providers need. */
export const intakeProviderSchema: JsonSchema = toProviderSchema(z.toJSONSchema(rawIntakeSchema) as JsonSchema)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The primary language subtag in lowercase when it has 2 or 3 letters, else `en`. */
export function intakeLanguage(value: unknown): string {
  if (typeof value !== 'string') return 'en'
  const primary = value.trim().split(/[-_]/)[0]?.toLowerCase() ?? ''
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'en'
}

export type IntakeConfig =
  | { ok: true; config: ProviderConfig }
  | { ok: false; code: 'invalid_input' | 'no_key' }

/**
 * A User_Config key runs that provider's Small_Model with that key; otherwise the
 * Default_Config's provider and key run its Small_Model (Req 2.4).
 */
export function resolveIntakeConfig(input: {
  headerKey: string | undefined
  bodyProvider: unknown
  defaults: DefaultConfigInput
  smallModels: Record<Provider, string>
}): IntakeConfig {
  const userKey = input.headerKey?.trim() ?? ''
  if (userKey !== '') {
    if (!isProvider(input.bodyProvider)) return { ok: false, code: 'invalid_input' }
    const model = input.smallModels[input.bodyProvider].trim()
    if (model === '') return { ok: false, code: 'no_key' }
    return { ok: true, config: { provider: input.bodyProvider, model, apiKey: userKey } }
  }
  const { provider } = input.defaults
  const apiKey = input.defaults.apiKey.trim()
  if (!isProvider(provider) || apiKey === '') return { ok: false, code: 'no_key' }
  const model = input.smallModels[provider].trim()
  if (model === '') return { ok: false, code: 'no_key' }
  return { ok: true, config: { provider, model, apiKey } }
}

function intakeError(code: ErrorCode): HandlerResponse<IntakeResponse> {
  return { status: ERROR_STATUS[code], body: { error: code } }
}

export async function handleIntakeRequest(
  input: { body: unknown; headerKey: string | undefined; authorization: string | undefined },
  deps: IntakeDeps,
): Promise<HandlerResponse<IntakeResponse>> {
  const startedAt = deps.now()
  const remaining = (): number => Math.max(0, deps.deadlineMs - (deps.now() - startedAt))

  // 1. Access_Token, checked as the Tree_Route checks it, within the shared budget (Req 2.1).
  const token = parseBearer(input.authorization)
  if (token === null) {
    deps.log?.({ code: 'unauthorized', stage: 'token_check' })
    return intakeError('unauthorized')
  }
  let userId: string | null | undefined
  try {
    userId = await withTimeout<string | null | undefined>(remaining(), undefined, (signal) =>
      deps.verifyToken(token, signal),
    )
  } catch {
    userId = null
  }
  if (typeof userId !== 'string' || userId === '') {
    deps.log?.({ code: 'unauthorized', stage: 'token_check' })
    return intakeError('unauthorized')
  }

  // 2. Body: hobby 1 to 60 characters, Note at most 800 (decision 40), both after trim (Req 2.2).
  const body = isRecord(input.body) ? input.body : {}
  if (typeof body.hobby !== 'string') return intakeError('invalid_input')
  const hobby = body.hobby.trim()
  if (hobby === '' || hobby.length > HOBBY_MAX_LENGTH) return intakeError('invalid_input')
  let note = ''
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') return intakeError('invalid_input')
    note = body.note.trim()
    if (Array.from(note).length > NOTE_MAX) return intakeError('invalid_input')
  }
  const language = intakeLanguage(body.language)

  // 3. Provider and Small_Model (Req 2.4).
  const resolved = resolveIntakeConfig({
    headerKey: input.headerKey,
    bodyProvider: body.provider,
    defaults: deps.defaults,
    smallModels: deps.smallModels,
  })
  if (!resolved.ok) return intakeError(resolved.code)
  const { config } = resolved
  const fail = (code: ErrorCode, stage: IntakeStage): HandlerResponse<IntakeResponse> => {
    deps.log?.({ code, stage, provider: config.provider, model: config.model })
    return intakeError(code)
  }

  // 4. Its own hourly limit; the Tree_Route's limiter is never touched (Req 2.3, 2.16).
  if (!deps.limiter.tryConsume(userId)) return fail('rate_limited', 'provider_call')

  // 5. Prompt.
  let systemPrompt: string
  try {
    systemPrompt = await deps.systemPrompt()
  } catch {
    return fail('provider_error', 'prompt_load')
  }

  // 6. Exactly one structured call, no retry, in what is left of the budget (Req 2.5, 2.6).
  // The inputs travel as one JSON value, apart from the instructions.
  const sentinel = { timedOut: true } as const
  let result: AdapterResult | typeof sentinel
  try {
    result = await withTimeout<AdapterResult | typeof sentinel>(remaining(), sentinel, (signal) =>
      withAiObservabilityContext(createAiObservabilityContext(userId), () =>
        deps.adapters[config.provider].generateStructured(config, {
          systemPrompt,
          userText: JSON.stringify({ language, hobby, note }),
          schemaName: 'intake_profile',
          schema: intakeProviderSchema,
          maxTokens: deps.maxTokens[config.provider],
          signal,
          redactContent: true,
          // Anthropic: thinking off. OpenAI: the lowest reasoning effort (decision 37).
          fastMode: config.provider === 'openai' ? { reasoningEffort: deps.openaiReasoningEffort } : {},
        }),
      ),
    )
  } catch {
    result = { ok: false, error: 'provider_error' }
  }

  // 7. Failures of the call.
  if ('timedOut' in result) return fail('timeout', 'provider_call')
  if (!result.ok) {
    if (result.error === 'bad_output') return fail('generation_failed', 'provider_call')
    return fail(result.error, 'provider_call')
  }

  // 8. Not a hobby: generation decides later, the page opens no Panel (Req 2.14, decision 22).
  if (isRecord(result.value) && result.value.notAHobby === true) return fail('not_a_hobby', 'sanitize')

  // 9. Repair, never reject a small slip (Req 2.8, 2.9).
  const sanitized = sanitizeIntakeProfile(result.value, { noteEmpty: note === '' })
  if (!sanitized.ok) return fail('generation_failed', 'sanitize')
  return { status: 200, body: { profile: sanitized.profile } }
}
