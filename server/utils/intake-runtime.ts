// Runtime dependencies of POST /api/intake (spec: path-intake).
import type { Provider } from '../../shared/types/llm'
import type { IntakeDeps, IntakeLogEntry } from './intake-handlers'
import { createAnthropicAdapter } from './providers/anthropic'
import { createOpenAIAdapter } from './providers/openai'
import type { Fetcher, ProviderAdapter } from './providers/types'
import { createRateLimiter } from './rate-limiter'
import { verifyAccessToken } from './supabase-server'

/** One budget for the token check and the model call (AS9). */
const INTAKE_DEADLINE_MS = 5_000
/** Intake calls per user per hour (decision 23). */
const INTAKE_LIMIT = 30
/** Output limits (decision 37): labels in other languages use more tokens. */
const INTAKE_MAX_TOKENS: Record<Provider, number> = { anthropic: 1200, openai: 2000 }

const fetcher: Fetcher = (url, options) => $fetch<unknown>(url, options)

const adapters: Record<Provider, ProviderAdapter> = {
  anthropic: createAnthropicAdapter(fetcher),
  openai: createOpenAIAdapter(fetcher),
}

/** Its own instance: intake never uses the Tree_Route's hourly limit (Req 2.16). */
const intakeLimiter = createRateLimiter({ limit: INTAKE_LIMIT, windowMs: 3_600_000, now: Date.now })

let promptPromise: Promise<string> | undefined

/** Reads the intake prompt server asset once. A failed read is not cached. */
function loadIntakePrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('intake.md')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('prompt_missing')
    return text
  })().catch((error: unknown) => {
    promptPromise = undefined
    throw error
  })
  return promptPromise
}

function stringConfig(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Logs only code, stage, provider and model. Explicit fields, no spread. */
function logIntakeError(entry: IntakeLogEntry): void {
  console.error('[intake]', { code: entry.code, stage: entry.stage, provider: entry.provider, model: entry.model })
}

export function intakeDeps(): IntakeDeps {
  const config = useRuntimeConfig()
  return {
    adapters,
    systemPrompt: loadIntakePrompt,
    defaults: {
      provider: stringConfig(config.llmProvider),
      model: stringConfig(config.llmModel),
      apiKey: stringConfig(config.llmApiKey),
    },
    smallModels: {
      anthropic: stringConfig(config.llmIntakeModelAnthropic),
      openai: stringConfig(config.llmIntakeModelOpenai),
    },
    maxTokens: INTAKE_MAX_TOKENS,
    openaiReasoningEffort: stringConfig(config.llmIntakeReasoningEffortOpenai),
    limiter: intakeLimiter,
    verifyToken: verifyAccessToken,
    deadlineMs: INTAKE_DEADLINE_MS,
    now: () => performance.now(),
    log: logIntakeError,
  }
}
