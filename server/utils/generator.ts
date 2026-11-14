import type { Provider, ProviderConfig, StartLevel } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import type { ValidationError } from '../../shared/types/validation'
import { formatValidationError, loadSkillTree } from '../../shared/utils/skill-tree-load'
import { unwrapGenerationOutput } from './generation-schema'
import type { ProviderAdapter } from './providers/types'

export type GenerationResult =
  | { kind: 'tree'; tree: SkillTree; model: string }
  | { kind: 'not_a_hobby' }
  | { kind: 'error'; code: 'generation_failed' | 'provider_auth' | 'provider_error' | 'timeout'; status?: number; detail?: string }

export interface GeneratorDeps {
  adapters: Record<Provider, ProviderAdapter>
  systemPrompt: string
  signal?: AbortSignal
}

/** At most one retry, so at most two adapter calls per generation (Req 4.6). */
const MAX_ATTEMPTS = 2
const MAX_NOTE_ERRORS = 20

const REJECTED_HEADER =
  'Your previous answer was rejected. Fix these problems and return the complete skill tree again:'
const SCHEMA_MISMATCH =
  'Your previous answer did not match the schema. Return the complete skill tree again.'

/** A short fixed-label summary of why the last answer was rejected. Labels only, never model text. */
export function rejectionDetail(errors: ValidationError[] | null): string {
  if (errors === null) return 'schema_mismatch'
  const first = errors[0]
  if (!first) return 'unknown'
  if (first.kind === 'video_fields') return `video_fields:${first.field}:${first.issues[0] ?? 'invalid'}`
  if (first.kind === 'schema') return `schema:${String(first.path[first.path.length - 1] ?? 'root').replace(/[^A-Za-z0-9_]/g, '')}`
  return first.kind
}

/** Extra user text for the retry call: the first 20 Validation_Errors, or the schema-mismatch sentence for `null` (Req 4.3). */
export function retryNote(errors: ValidationError[] | null): string {
  if (errors === null) return SCHEMA_MISMATCH
  const lines = errors.slice(0, MAX_NOTE_ERRORS).map((error) => `- ${formatValidationError(error)}`)
  return [REJECTED_HEADER, ...lines].join('\n')
}

/**
 * Calls the configured Provider_Adapter, checks the answer with the Tree_Loader and retries once
 * on an unusable or rejected answer. The returned tree is always the Tree_Loader's output (Req 4.7).
 */
export async function generateSkillTree(
  hobby: string,
  level: StartLevel,
  config: ProviderConfig,
  deps: GeneratorDeps,
): Promise<GenerationResult> {
  const adapter = deps.adapters[config.provider]
  const { systemPrompt, signal } = deps
  let note: string | undefined
  let detail = 'unknown'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await adapter.generateTree(hobby, config, { systemPrompt, level, retryNote: note, signal })
    if (signal?.aborted) return { kind: 'error', code: 'timeout' }

    if (!result.ok) {
      if (result.error === 'bad_output') {
        note = retryNote(null)
        detail = 'bad_output'
        continue
      }
      return result.status === undefined
        ? { kind: 'error', code: result.error }
        : { kind: 'error', code: result.error, status: result.status }
    }

    const unwrapped = unwrapGenerationOutput(result.value)
    if (unwrapped.kind === 'not_a_hobby') return { kind: 'not_a_hobby' }

    const loaded = loadSkillTree(unwrapped.value, { requireVideoFields: true })
    if (loaded.ok) return { kind: 'tree', tree: loaded.value, model: config.model }
    note = retryNote(loaded.errors)
    detail = rejectionDetail(loaded.errors)
  }

  return { kind: 'error', code: 'generation_failed', detail }
}
