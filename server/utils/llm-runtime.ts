import type { Provider } from '../../shared/types/llm'
import type { DefaultConfigInput, TestDeps, TreeDeps, TreeLogEntry } from './llm-handlers'
import { createAnthropicAdapter } from './providers/anthropic'
import { createOpenAIAdapter } from './providers/openai'
import type { Fetcher, ProviderAdapter } from './providers/types'
import { createRateLimiter } from './rate-limiter'
import { hobbyLimitBlocks } from '../../shared/utils/hobby-limit'
import { paidAccessForToken } from './billing-runtime'
import { listHobbiesForUser, savePathForUser, verifyAccessToken } from './supabase-server'
import { createTreeCache } from './tree-cache'
import { afterTreeSave } from './video/runtime'
import { captureServerEvent } from './analytics-events'

/** Request timeouts in milliseconds (Req 8.1, 12.3). */
const TREE_TIMEOUT_MS = 90_000
const TEST_TIMEOUT_MS = 15_000
/** Token check and path save limits (spec: accounts-cloud-save, Req 9.2, 9.10). */
const VERIFY_TIMEOUT_MS = 5_000
const SAVE_TIMEOUT_MS = 10_000
const LIMIT_TIMEOUT_MS = 8_000

/**
 * The free plan's hobby limit for one build. The paths are read with the user's token; paid
 * status comes from the billing mirror and is only read when the paths alone would stop the
 * build, so most builds cost one small query.
 */
async function treeHobbyLimitBlocks(input: { token: string; userId: string; hobby: string }, signal: AbortSignal): Promise<boolean> {
  const hobbies = await listHobbiesForUser(input.token, input.userId, signal)
  if (!hobbyLimitBlocks({ hobbies, requested: input.hobby, unlimited: false })) return false
  return !(await paidAccessForToken(input.token))
}

/** Narrows ofetch's generic $fetch to the subset the adapters use. */
const llmFetcher: Fetcher = (url, options) => $fetch<unknown>(url, options)

const llmAdapters: Record<Provider, ProviderAdapter> = {
  anthropic: createAnthropicAdapter(llmFetcher),
  openai: createOpenAIAdapter(llmFetcher),
}

const llmTreeCache = createTreeCache(200)
const llmRateLimiter = createRateLimiter({ limit: 10, windowMs: 3_600_000, now: Date.now })

let promptPromise: Promise<string> | undefined

/**
 * Reads the system prompt server asset once and passes it on unchanged (Req 3.2).
 * A failed read is not cached, so the next request tries again.
 */
function loadSystemPrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('skill-tree.md')
    if (typeof text !== 'string' || text.trim() === '') {
      console.error('[llm]', { code: 'prompt_missing' })
      throw new Error('prompt_missing')
    }
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

/** Default_Config from server-only runtime config (Req 2.5). */
function llmDefaultConfig(): DefaultConfigInput {
  const config = useRuntimeConfig()
  return {
    provider: stringConfig(config.llmProvider),
    model: stringConfig(config.llmModel),
    apiKey: stringConfig(config.llmApiKey),
  }
}

/** Logs only code, stage, reason, provider and model, never keys or bodies (Req 2.2, 2.6). Explicit fields, no spread. */
function logLlmError(entry: TreeLogEntry): void {
  console.error('[llm]', {
    code: entry.code,
    stage: entry.stage,
    reason: entry.reason,
    provider: entry.provider,
    model: entry.model,
  })
}

export function llmTreeDeps(): TreeDeps {
  return {
    adapters: llmAdapters,
    systemPrompt: loadSystemPrompt,
    defaults: llmDefaultConfig(),
    cache: llmTreeCache,
    limiter: llmRateLimiter,
    timeoutMs: TREE_TIMEOUT_MS,
    verifyToken: verifyAccessToken,
    savePath: savePathForUser,
    hobbyLimitBlocks: treeHobbyLimitBlocks,
    limitTimeoutMs: LIMIT_TIMEOUT_MS,
    verifyTimeoutMs: VERIFY_TIMEOUT_MS,
    saveTimeoutMs: SAVE_TIMEOUT_MS,
    afterSave: afterTreeSave,
    // spec: sample-path, Req 12.3. Same name and `start_level` as the browser event it replaces.
    recordGenerated: ({ identity, startLevel, cached }) =>
      captureServerEvent(identity, 'skill_path_generated', { start_level: startLevel, cached }),
    log: logLlmError,
  }
}

export function llmTestDeps(): TestDeps {
  return { adapters: llmAdapters, timeoutMs: TEST_TIMEOUT_MS }
}
