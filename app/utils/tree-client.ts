import type { ErrorCode, Provider, StartLevel } from '#shared/types/llm'
import { KEY_HEADER, isErrorCode } from '#shared/utils/llm'
import { effectiveModel, type LlmSettings } from './llm-settings'

export interface TreeRequest {
  body: { hobby: string; level: StartLevel; provider?: Provider; model?: string }
  headers: Record<string, string>
  usesOwnKey: boolean
}

/** Sends the key, provider and effective model only when the user set a key (Req 9.5, 11.2). */
export function buildTreeRequest(hobby: string, level: StartLevel, settings: LlmSettings): TreeRequest {
  const apiKey = settings.apiKey.trim()
  if (apiKey.length === 0) return { body: { hobby, level }, headers: {}, usesOwnKey: false }
  return {
    body: { hobby, level, provider: settings.provider, model: effectiveModel(settings) },
    headers: { [KEY_HEADER]: apiKey },
    usesOwnKey: true,
  }
}

/** A known `error` field, else `generation_failed` (Req 8.5). */
export function errorCodeFrom(data: unknown): ErrorCode {
  if (typeof data === 'object' && data !== null) {
    const error = (data as Record<string, unknown>).error
    if (isErrorCode(error)) return error
  }
  return 'generation_failed'
}

const MESSAGES: Record<ErrorCode, string> = {
  not_a_hobby: "That doesn't look like a hobby yet. Try something you can practice, like bouldering or guitar.",
  rate_limited: "You've built a lot of trees this hour. Try again later, or add your own API key in Settings.",
  timeout: 'Building your tree took too long. Please try again.',
  generation_failed: "We couldn't build a tree for that just now. Please try again.",
  provider_auth: 'The AI service is not available right now. Please try again later.',
  provider_error: 'The AI service had a problem. Please try again.',
  no_key: "Tree building isn't set up yet. Add your own API key in Settings.",
  invalid_input: 'Type a hobby of up to 60 characters.',
}

/** One plain sentence per Error_Code, no technical detail (Req 5.3, 7.4, 8.6). */
export function friendlyMessage(code: ErrorCode, context: { usesOwnKey: boolean }): string {
  if (code === 'provider_auth' && context.usesOwnKey) {
    return 'Your API key was not accepted. Check it in Settings.'
  }
  return MESSAGES[code]
}
