import { generationSchema } from '../generation-schema'
import type { ProviderConfig } from '../../../shared/types/llm'
import { callProvider, isRecord, type Fetcher, type ProviderAdapter } from './types'

const URL = 'https://api.anthropic.com/v1/messages'
const TOOL_NAME = 'submit_skill_tree'

function headers(config: ProviderConfig): Record<string, string> {
  return {
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  }
}

/** Finds the forced tool call's input, or undefined when the answer is unusable. */
function toolInput(response: unknown): { found: true; input: unknown } | { found: false } {
  if (!isRecord(response)) return { found: false }
  if (response.stop_reason === 'max_tokens') return { found: false }
  const content = response.content
  if (!Array.isArray(content)) return { found: false }
  for (const block of content) {
    if (isRecord(block) && block.type === 'tool_use' && block.name === TOOL_NAME && 'input' in block) {
      return { found: true, input: block.input }
    }
  }
  return { found: false }
}

export function createAnthropicAdapter(fetcher: Fetcher): ProviderAdapter {
  return {
    async generateTree(hobby, config, options) {
      const text = [{ type: 'text', text: hobby }]
      if (options.retryNote) text.push({ type: 'text', text: options.retryNote })
      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: 8192,
        system: options.systemPrompt,
        messages: [{ role: 'user', content: text }],
        tools: [
          {
            name: TOOL_NAME,
            description: 'Submit the skill tree or the not_a_hobby error.',
            input_schema: generationSchema,
          },
        ],
        tool_choice: { type: 'tool', name: TOOL_NAME },
      }
      const result = await callProvider(fetcher, URL, headers(config), body, options.signal)
      if (!result.ok) return result
      const tool = toolInput(result.response)
      return tool.found ? { ok: true, value: tool.input } : { ok: false, error: 'bad_output' }
    },

    async testConnection(config, signal) {
      const body = { model: config.model, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] }
      const result = await callProvider(fetcher, URL, headers(config), body, signal)
      return result.ok ? { ok: true, value: null } : result
    },
  }
}
