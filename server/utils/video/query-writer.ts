import type { ProviderConfig } from '../../../shared/types/llm'
import type { Level } from '../../../shared/types/skill-tree'
import { repairSearchQueries, validateSearchQueries } from '../../../shared/utils/search-queries'
import type { ProviderAdapter, StructuredSchema } from '../providers/types'

/** Same model time limit as the Judge (design: Serverless execution). */
const WRITER_TIMEOUT_MS = 30_000
const WRITER_MAX_TOKENS = 400

/**
 * The only inputs of the writer: hobby, skill title and section level. There is no Goal and no
 * user field, so the queries depend on the Pool_Key alone (Req 1.3, 1.8, 1.9).
 */
export interface QueryWriterInput {
  hobby: string
  skill: string
  level: Level
}

export type QueryWriterResult =
  | { ok: true; queries: string[] }
  | { ok: false; reason: 'model_failure' }

/** Closed object with every key required, as `toProviderSchema` produces. */
const QUERIES_SCHEMA: StructuredSchema = {
  type: 'object',
  properties: { searchQueries: { type: 'array', items: { type: 'string' } } },
  required: ['searchQueries'],
  additionalProperties: false,
}

let promptPromise: Promise<string> | undefined

/** Reads the query writer prompt server asset once. A failed read is not cached. */
function loadPrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('search-queries.md')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('prompt_missing')
    return text
  })().catch((error: unknown) => {
    promptPromise = undefined
    throw error
  })
  return promptPromise
}

function pickQueries(value: unknown): string[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = (value as Record<string, unknown>).searchQueries
  if (!Array.isArray(raw) || !raw.every((q): q is string => typeof q === 'string')) return null
  return raw.map((q) => q.trim())
}

/**
 * Writes 2 or 3 Search_Queries for a Skill that has none (Req 1.18). Makes exactly one model
 * call. Any failure (missing prompt, adapter error, timeout, output that does not pass
 * `validateSearchQueries`) returns a model failure with no queries; the writer never retries,
 * so the Skill stays unchanged within the run (Req 1.19). `systemPrompt` overrides the server
 * asset (used by tests).
 */
export async function writeSearchQueries(
  input: QueryWriterInput,
  config: ProviderConfig,
  adapter: ProviderAdapter,
  signal?: AbortSignal,
  systemPrompt?: string,
): Promise<QueryWriterResult> {
  const failure: QueryWriterResult = { ok: false, reason: 'model_failure' }
  try {
    const prompt = systemPrompt ?? (await loadPrompt())
    const timeout = AbortSignal.timeout(WRITER_TIMEOUT_MS)
    const result = await adapter.generateStructured(config, {
      systemPrompt: prompt,
      userText: JSON.stringify({ hobby: input.hobby, skill: input.skill, level: input.level }),
      schemaName: 'search_queries',
      schema: QUERIES_SCHEMA,
      maxTokens: WRITER_MAX_TOKENS,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!result.ok) return failure
    const picked = pickQueries(result.value)
    if (!picked) return failure
    const queries = repairSearchQueries(picked, { hobby: input.hobby, skillTitle: input.skill, level: input.level })
    const issues = validateSearchQueries(queries, {
      hobby: input.hobby,
      skillTitle: input.skill,
      level: input.level,
    })
    return issues.length === 0 ? { ok: true, queries } : failure
  } catch {
    return failure
  }
}
