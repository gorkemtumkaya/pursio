/**
 * runPipeline: Search, Details, Filter, Judge, Store for one Pool_Key.
 * The caller (scheduler) has already taken the Run_Lease for `runId`. Every outcome that does
 * not store a pool releases the lease and leaves any existing pool unchanged (Req 7.10).
 */
import { z } from 'zod'
import type { ProviderConfig } from '../../../shared/types/llm'
import type { Level } from '../../../shared/types/skill-tree'
import { languageCode } from '../../../shared/utils/video-normalize'
import { toProviderSchema, type JsonSchema } from '../generation-schema'
import type { ProviderAdapter } from '../providers/types'
import { fetchDetails } from './details'
import { filterCandidates } from './filter'
import { applyVerdicts, buildJudgeInput, judgeOutputSchema } from './judge'
import type { PipelineStore } from './pipeline-store'
import { buildPoolVideos } from './pool'
import type { VideoProvider } from './provider'
import { createQuotaGate, type QuotaGate } from './quota'
import { searchAll } from './search'
import { writeSearchQueries } from './query-writer'

/** Model time limit for the Judge call (design: Serverless execution). */
export const JUDGE_TIMEOUT_MS = 30_000
export const JUDGE_MAX_TOKENS = 4096

/** What a run needs to know about one Pool_Key. Holds no user id and no token. */
export interface PipelineJob {
  poolKey: string
  hobby: string
  skillTitle: string
  skillDescription: string
  quests: readonly string[]
  level: Level
  language: string
  searchQueries: readonly string[] | null
  quickTip: boolean
  /** Writes generated queries back to the user's path. Only set inside a Signed_In_User request. */
  persist?: (queries: string[]) => Promise<void>
}

/**
 * - stored: a pool (possibly empty) replaced the old one.
 * - provider_failure / model_failure: nothing stored, retry schedule applies (Req 9.8 to 9.12).
 * - blocked: the quota gate refused a call, wait for the next Pacific midnight (Req 9.6).
 * - lease_lost: another run took the lease over, so this run stored nothing (Req 7.12).
 * - error: an unexpected failure (for example the database); nothing stored.
 */
export type PipelineOutcome =
  | { kind: 'stored'; videoCount: number }
  | { kind: 'provider_failure' }
  | { kind: 'model_failure' }
  | { kind: 'blocked' }
  | { kind: 'lease_lost' }
  | { kind: 'error' }

export interface PipelineDeps {
  store: PipelineStore
  provider: VideoProvider
  /** Judge and query writer adapter, with the Default_Config. Null config means a model failure. */
  adapter: ProviderAdapter
  config: ProviderConfig | null
  /** Quota gate; built from `dailyQuota` when absent. */
  gate?: QuotaGate
  dailyQuota?: unknown
  signal?: AbortSignal
  /** Overrides the server prompt asset (tests). */
  judgePrompt?: string
}

const JUDGE_SCHEMA: JsonSchema = toProviderSchema(z.toJSONSchema(judgeOutputSchema) as JsonSchema)

let promptPromise: Promise<string> | undefined

/** Reads the Judge prompt server asset once. A failed read is not cached. */
function loadJudgePrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('video-judge.md')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('prompt_missing')
    return text
  })().catch((error: unknown) => {
    promptPromise = undefined
    throw error
  })
  return promptPromise
}

async function release(store: PipelineStore, job: PipelineJob, runId: string): Promise<void> {
  try {
    await store.releaseLease(job.poolKey, runId)
  }
  catch {
    // The lease expires by itself after the Lease_Timeout.
  }
}

/** Runs one Pipeline_Run. Never throws. */
export async function runPipeline(
  job: PipelineJob,
  runId: string,
  deps: PipelineDeps,
): Promise<PipelineOutcome> {
  const { store } = deps
  const fail = async (outcome: PipelineOutcome): Promise<PipelineOutcome> => {
    await release(store, job, runId)
    return outcome
  }

  try {
    const gate = deps.gate ?? createQuotaGate(store, deps.dailyQuota)
    const language = languageCode(job.language)

    // Search_Queries: use the stored ones, or write them once (Req 1.18, 1.19).
    let queries: readonly string[] | null = job.searchQueries && job.searchQueries.length > 0
      ? job.searchQueries
      : null
    if (!queries) {
      if (!deps.config) return await fail({ kind: 'model_failure' })
      const written = await writeSearchQueries(
        { hobby: job.hobby, skill: job.skillTitle, level: job.level },
        deps.config,
        deps.adapter,
        deps.signal,
      )
      if (!written.ok) return await fail({ kind: 'model_failure' })
      queries = written.queries
      if (job.persist) {
        try {
          await job.persist(written.queries)
        }
        catch {
          // The queries are still used for this run; persisting is best effort.
        }
      }
    }

    // Search.
    const search = await searchAll({ provider: deps.provider, gate, signal: deps.signal }, queries, language)
    if (search.kind === 'blocked') return await fail({ kind: 'blocked' })
    if (search.kind === 'provider_failure') return await fail({ kind: 'provider_failure' })

    let kept: ReturnType<typeof buildPoolVideos> = []
    // Stage counts for the empty-pool log line (numbers only).
    const counts: Record<string, number | null> = { hits: 0, details: 0, filtered: 0 }
    if (search.kind === 'candidates') {
      // Details.
      const details = await fetchDetails(
        { provider: deps.provider, gate, signal: deps.signal },
        search.hits.map((h) => h.id),
      )
      if (details.kind === 'blocked') return await fail({ kind: 'blocked' })
      if (details.kind === 'provider_failure') return await fail({ kind: 'provider_failure' })
      counts.hits = search.hits.length
      counts.details = details.details.length

      // Filter.
      const candidates = filterCandidates(details.details, { language, quickTip: job.quickTip })
      counts.filtered = candidates.length

      // Judge: skipped when nothing is left (Req 5.7).
      if (candidates.length > 0) {
        if (!deps.config) return await fail({ kind: 'model_failure' })
        let judged: ReturnType<typeof applyVerdicts>
        try {
          const prompt = deps.judgePrompt ?? (await loadJudgePrompt())
          const timeout = AbortSignal.timeout(JUDGE_TIMEOUT_MS)
          const result = await deps.adapter.generateStructured(deps.config, {
            systemPrompt: prompt,
            userText: buildJudgeInput(
              {
                hobby: job.hobby,
                skillTitle: job.skillTitle,
                skillDescription: job.skillDescription,
                questTexts: job.quests,
                level: job.level,
              },
              candidates,
            ),
            schemaName: 'video_verdicts',
            schema: JUDGE_SCHEMA,
            maxTokens: JUDGE_MAX_TOKENS,
            signal: deps.signal ? AbortSignal.any([deps.signal, timeout]) : timeout,
          })
          if (!result.ok) return await fail({ kind: 'model_failure' })
          judged = applyVerdicts(result.value, candidates, job.quests)
        }
        catch {
          return await fail({ kind: 'model_failure' })
        }
        if (!judged.ok) return await fail({ kind: 'model_failure' })
        kept = buildPoolVideos(judged.kept)
        Object.assign(counts, judged.stats)
      }
    }

    if (kept.length === 0) {
      // Shows which stage dropped every video. Fixed labels and counts only.
      console.error('[video]', { poolKey: job.poolKey, type: 'empty_pool', ...counts })
    }

    // Store. Only the run that still owns the lease may replace the pool (Req 7.12).
    const stored = await store.storePool(job.poolKey, runId, kept)
    if (!stored) return { kind: 'lease_lost' }
    return { kind: 'stored', videoCount: kept.length }
  }
  catch {
    return await fail({ kind: 'error' })
  }
}
