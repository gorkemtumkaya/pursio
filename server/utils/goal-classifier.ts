import type { ProviderConfig } from '../../shared/types/llm'
import type { GoalClass } from '../../shared/types/video'
import type { ProviderAdapter, StructuredSchema } from './providers/types'

/** Time limit for the one classifier call (spec: skill-video-pipeline, design: handleTreeRequest changes). */
const CLASSIFY_TIMEOUT_MS = 10_000
const CLASSIFY_MAX_TOKENS = 64

/** Closed object with every key required, as `toProviderSchema` produces. */
const GOAL_CLASS_SCHEMA: StructuredSchema = {
  type: 'object',
  properties: { goal_class: { type: 'string', enum: ['targeted', 'casual', 'none'] } },
  required: ['goal_class'],
  additionalProperties: false,
}

/** Returns the raw value only when it is exactly `targeted`, `casual` or `none`; anything else is `none` (Req 1.12). */
export function coerceGoalClass(raw: unknown): GoalClass {
  return raw === 'targeted' || raw === 'casual' || raw === 'none' ? raw : 'none'
}

let promptPromise: Promise<string> | undefined

/** Reads the classifier prompt server asset once. A failed read is not cached. */
function loadPrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('goal-class.md')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('prompt_missing')
    return text
  })().catch((error: unknown) => {
    promptPromise = undefined
    throw error
  })
  return promptPromise
}

function pickClass(value: unknown): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>).goal_class
    : undefined
}

/**
 * Classifies the learner's Goal once per path (Req 1.11).
 * An empty or whitespace goal makes no model call. Any failure (missing prompt, adapter error,
 * timeout, invalid output) returns `none` (Req 1.12). The goal is sent as the only user text.
 * `systemPrompt` overrides the server asset (used by tests).
 */
export async function classifyGoal(
  goal: string,
  config: ProviderConfig,
  adapter: ProviderAdapter,
  signal?: AbortSignal,
  systemPrompt?: string,
): Promise<GoalClass> {
  const text = goal.trim()
  if (text === '') return 'none'
  try {
    const prompt = systemPrompt ?? (await loadPrompt())
    const timeout = AbortSignal.timeout(CLASSIFY_TIMEOUT_MS)
    const result = await adapter.generateStructured(config, {
      systemPrompt: prompt,
      userText: text,
      schemaName: 'goal_class',
      schema: GOAL_CLASS_SCHEMA,
      maxTokens: CLASSIFY_MAX_TOKENS,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    return result.ok ? coerceGoalClass(pickClass(result.value)) : 'none'
  } catch {
    return 'none'
  }
}
