import { AsyncLocalStorage } from 'node:async_hooks'
import { PostHog } from 'posthog-node'
import type { AdapterFailure } from './providers/types'

export interface AiObservabilityContext {
  distinctId?: string
  /** The server process; sent as `$ai_session_id`. */
  sessionId: string
  traceId: string
  /** The browser's PostHog session id, when the request sent one; sent as `$session_id` (spec: sample-path, Req 12.2). */
  browserSessionId?: string
}

interface GenerationCapture {
  url: string
  body: Record<string, unknown>
  result: { ok: true; response: unknown } | { ok: false; error: AdapterFailure; status?: number }
  latencySeconds: number
  /** No input and no output text in the record (spec: path-intake, Req 2.15). */
  redactContent?: boolean
}

const contexts = new AsyncLocalStorage<AiObservabilityContext>()
// There is no persisted conversation for server-side generation work, so a warm server process is the session.
const processSessionId = `server-${crypto.randomUUID()}`
let client: PostHog | undefined
let warnedMissingConfig = false

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function provider(url: string): 'anthropic' | 'openai' {
  return url.includes('anthropic') ? 'anthropic' : 'openai'
}

function inputFor(providerName: 'anthropic' | 'openai', body: Record<string, unknown>): unknown[] {
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (providerName !== 'anthropic') return messages
  const system = typeof body.system === 'string' ? [{ role: 'system', content: body.system }] : []
  return [...system, ...messages]
}

function outputFor(providerName: 'anthropic' | 'openai', response: unknown): { choices?: unknown[]; inputTokens?: number; outputTokens?: number; stopReason?: string } {
  const value = record(response)
  if (!value) return {}
  const usage = record(value.usage)
  if (providerName === 'anthropic') {
    return {
      choices: Array.isArray(value.content) ? [{ role: 'assistant', content: value.content }] : undefined,
      inputTokens: number(usage?.input_tokens),
      outputTokens: number(usage?.output_tokens),
      stopReason: typeof value.stop_reason === 'string' ? value.stop_reason : undefined,
    }
  }
  const choices = Array.isArray(value.choices)
    ? value.choices.flatMap((choice) => {
      const message = record(record(choice)?.message)
      return message ? [{ role: 'assistant', content: message.content }] : []
    })
    : undefined
  const firstChoice = Array.isArray(value.choices) ? record(value.choices[0]) : undefined
  return {
    choices,
    inputTokens: number(usage?.prompt_tokens),
    outputTokens: number(usage?.completion_tokens),
    stopReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : undefined,
  }
}

/** The server's PostHog client, or undefined when it is not configured. Shared with `analytics-events.ts`. */
export function serverPosthogClient(): PostHog | undefined {
  if (client) return client
  const key = process.env.NUXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NUXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) {
    if (process.env.NODE_ENV !== 'production' && !warnedMissingConfig) {
      warnedMissingConfig = true
      const variable = !key ? 'NUXT_PUBLIC_POSTHOG_KEY' : 'NUXT_PUBLIC_POSTHOG_HOST'
      console.warn(`${variable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${variable} is configured`)
    }
    return undefined
  }
  client = new PostHog(key, {
    host,
    privacyMode: false,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2000,
    fetchRetryCount: 0,
  })
  return client
}

/**
 * `distinctId`: the browser's PostHog id when the request sent one, else the user id, else none
 * (background jobs), which falls back to the process id.
 */
export function createAiObservabilityContext(distinctId?: string, browserSessionId?: string): AiObservabilityContext {
  return { distinctId, sessionId: processSessionId, traceId: crypto.randomUUID(), browserSessionId }
}

/** The context of the running call, for tests and for callers that pass it on. */
export function currentAiObservabilityContext(): AiObservabilityContext | undefined {
  return contexts.getStore()
}

export function withAiObservabilityContext<T>(context: AiObservabilityContext, task: () => Promise<T>): Promise<T> {
  return contexts.run(context, task)
}

export async function captureAiGeneration(capture: GenerationCapture): Promise<void> {
  const context = contexts.getStore()
  if (!context) return
  const posthog = serverPosthogClient()
  if (!posthog) return

  try {
    const providerName = provider(capture.url)
    const output = capture.result.ok ? outputFor(providerName, capture.result.response) : {}
    const redact = capture.redactContent === true
    posthog.capture({
      distinctId: context.distinctId ?? context.sessionId,
      event: '$ai_generation',
      properties: {
        $ai_trace_id: context.traceId,
        $ai_session_id: context.sessionId,
        $session_id: context.browserSessionId,
        $ai_model: typeof capture.body.model === 'string' ? capture.body.model : 'unknown',
        $ai_provider: providerName,
        $ai_input: redact ? undefined : inputFor(providerName, capture.body),
        $ai_output_choices: redact ? undefined : output.choices,
        $ai_input_tokens: output.inputTokens,
        $ai_output_tokens: output.outputTokens,
        $ai_latency: capture.latencySeconds,
        $ai_stop_reason: output.stopReason,
        $ai_request_url: capture.url,
        $ai_is_error: !capture.result.ok,
        $ai_http_status: capture.result.ok ? undefined : capture.result.status,
      },
    })
    await posthog.flush().catch(() => {})
  } catch {
    // Analytics must never fail or change an LLM request.
  }
}
