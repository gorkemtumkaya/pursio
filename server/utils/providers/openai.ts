import { generationSchema } from '../generation-schema'
import type { ProviderConfig } from '../../../shared/types/llm'
import { callProvider, isRecord, type Fetcher, type ProviderAdapter, userMessage } from './types'

const URL = 'https://api.openai.com/v1/chat/completions'

function headers(config: ProviderConfig): Record<string, string> {
  return {
    authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
  }
}

/** Parses the first choice's JSON content, or reports that the answer is unusable. */
function parsedContent(response: unknown): { ok: true; value: unknown } | { ok: false } {
  if (!isRecord(response) || !Array.isArray(response.choices)) return { ok: false }
  const choice: unknown = response.choices[0]
  if (!isRecord(choice) || choice.finish_reason === 'length') return { ok: false }
  const message = choice.message
  if (!isRecord(message)) return { ok: false }
  if (typeof message.refusal === 'string' && message.refusal !== '') return { ok: false }
  if (typeof message.content !== 'string') return { ok: false }
  try {
    return { ok: true, value: JSON.parse(message.content) as unknown }
  } catch {
    return { ok: false }
  }
}

export function createOpenAIAdapter(fetcher: Fetcher): ProviderAdapter {
  return {
    async generateTree(hobby, config, options) {
      const messages = [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: userMessage(hobby, options.level) },
      ]
      if (options.retryNote) messages.push({ role: 'user', content: options.retryNote })
      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'skill_tree', strict: true, schema: generationSchema },
        },
      }
      const result = await callProvider(fetcher, URL, headers(config), body, options.signal)
      if (!result.ok) return result
      const parsed = parsedContent(result.response)
      return parsed.ok ? { ok: true, value: parsed.value } : { ok: false, error: 'bad_output' }
    },

    async testConnection(config, signal) {
      const body = {
        model: config.model,
        max_completion_tokens: 16,
        messages: [{ role: 'user', content: 'ping' }],
      }
      const result = await callProvider(fetcher, URL, headers(config), body, signal)
      return result.ok ? { ok: true, value: null } : result
    },
  }
}
