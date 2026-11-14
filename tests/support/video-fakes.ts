// Fakes for the video pipeline tests (spec: skill-video-pipeline, task 4.5).
// No network, no real provider, no real database.
import type { ProviderConfig } from '../../shared/types/llm'
import {
  ProviderError,
  type ProviderErrorKind,
  type SearchHit,
  type VideoDetails,
  type VideoProvider,
} from '../../server/utils/video/provider'
import type {
  AdapterResult,
  GenerateOptions,
  ProviderAdapter,
  StructuredOptions,
} from '../../server/utils/providers/types'

/** Sentinel API key for the secret-leak tests: it must never appear in any output. */
export const SENTINEL_API_KEY = 'SENTINEL_YOUTUBE_KEY_4d1e9b'

/** Puts the sentinel key in the process environment under the runtime config name. Returns a restore function. */
export function setSentinelApiKey(name = 'NUXT_YOUTUBE_API_KEY'): () => void {
  const previous = process.env[name]
  process.env[name] = SENTINEL_API_KEY
  return () => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

/** A promise that never settles, for timeout cases. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

// ---------------------------------------------------------------------------
// FakeVideoProvider
// ---------------------------------------------------------------------------

/** One scripted answer: a value, a failure kind, or a call that never returns. */
export type Scripted<T> = { ok: T } | { fail: ProviderErrorKind } | { hang: true }

export interface SearchRequest {
  query: string
  maxResults: number
  language: string
  /** Every option key the caller passed, so tests can assert no region value is sent. */
  optionKeys: string[]
}

export interface DetailsRequest {
  ids: string[]
}

export interface FakeVideoProviderOptions {
  /** Answer per query text. A query with no entry gets `defaultSearch`. */
  search?: Record<string, Scripted<SearchHit[]>>
  /** Answer when a query has no entry. Default: no hits. */
  defaultSearch?: Scripted<SearchHit[]>
  /**
   * Answers for `getDetails`, taken in call order. When the list is used up, or empty,
   * the details are built from `catalog` (ids missing from the catalog are absent).
   */
  details?: Array<Scripted<VideoDetails[]>>
  /** Known videos for the default details answer, by id. */
  catalog?: readonly VideoDetails[]
}

export interface FakeVideoProvider extends VideoProvider {
  readonly searchCalls: SearchRequest[]
  readonly detailsCalls: DetailsRequest[]
  /** Replaces the answer for one query. */
  scriptSearch(query: string, answer: Scripted<SearchHit[]>): void
  /** Appends a details answer. */
  scriptDetails(answer: Scripted<VideoDetails[]>): void
}

async function resolveScripted<T>(answer: Scripted<T>, signal?: AbortSignal): Promise<T> {
  if ('fail' in answer) throw new ProviderError(answer.fail)
  if ('hang' in answer) {
    // Settles only when the caller aborts, like a real timeout.
    return new Promise<T>((_resolve, reject) => {
      if (signal?.aborted) reject(new ProviderError('timeout'))
      else signal?.addEventListener('abort', () => reject(new ProviderError('timeout')), { once: true })
    })
  }
  return answer.ok
}

export function createFakeVideoProvider(options: FakeVideoProviderOptions = {}): FakeVideoProvider {
  const searchScript = new Map<string, Scripted<SearchHit[]>>(Object.entries(options.search ?? {}))
  const detailsScript: Array<Scripted<VideoDetails[]>> = [...(options.details ?? [])]
  const defaultSearch: Scripted<SearchHit[]> = options.defaultSearch ?? { ok: [] }
  const catalog = new Map((options.catalog ?? []).map((video) => [video.id, video]))
  const searchCalls: SearchRequest[] = []
  const detailsCalls: DetailsRequest[] = []

  return {
    searchCalls,
    detailsCalls,
    scriptSearch(query, answer) {
      searchScript.set(query, answer)
    },
    scriptDetails(answer) {
      detailsScript.push(answer)
    },
    async search(query, maxResults, opts) {
      searchCalls.push({ query, maxResults, language: opts.language, optionKeys: Object.keys(opts) })
      return resolveScripted(searchScript.get(query) ?? defaultSearch, opts.signal)
    },
    async getDetails(ids, opts) {
      detailsCalls.push({ ids: [...ids] })
      const scripted = detailsScript.shift()
      if (scripted) return resolveScripted(scripted, opts.signal)
      return ids.flatMap((id) => {
        const video = catalog.get(id)
        return video ? [video] : []
      })
    },
  }
}

/** A complete `VideoDetails` with plain defaults, for building catalogs. */
export function fakeDetails(id: string, overrides: Partial<VideoDetails> = {}): VideoDetails {
  return {
    id,
    title: `Title ${id}`,
    channel: 'Channel',
    description: `Description ${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds: 300,
    viewCount: 1000,
    likeCount: 100,
    publishedAt: '2026-01-01T00:00:00Z',
    defaultAudioLanguage: 'en',
    hasCaptions: true,
    embeddable: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// FakeJudge
// ---------------------------------------------------------------------------

/** What one Judge call answers. `verdicts` is wrapped as `{ verdicts }`, `raw` is returned as is. */
export type JudgeScript =
  | { verdicts: unknown[] }
  | { raw: unknown }
  | { error: 'provider_auth' | 'provider_error' | 'bad_output'; status?: number }
  | { hang: true }

export interface JudgeCall {
  config: ProviderConfig
  systemPrompt: string
  /** The user text sent to the model, for asserting what the Judge sees. */
  userText: string
  schemaName: string
}

export interface FakeJudge extends ProviderAdapter {
  /** Every `generateStructured` call, in order. */
  readonly calls: JudgeCall[]
  /** Appends an answer; calls beyond the script reuse the last one. */
  script(answer: JudgeScript): void
}

export function createFakeJudge(initial: JudgeScript[] = []): FakeJudge {
  const answers: JudgeScript[] = [...initial]
  const calls: JudgeCall[] = []
  let last: JudgeScript = { verdicts: [] }

  function next(): JudgeScript {
    const taken = answers.shift()
    if (taken) last = taken
    return last
  }

  return {
    calls,
    script(answer) {
      answers.push(answer)
    },
    async generateStructured(config: ProviderConfig, options: StructuredOptions): Promise<AdapterResult> {
      calls.push({ config, systemPrompt: options.systemPrompt, userText: options.userText, schemaName: options.schemaName })
      const answer = next()
      if ('hang' in answer) {
        return new Promise<AdapterResult>((resolve) => {
          const done = (): void => resolve({ ok: false, error: 'provider_error' })
          if (options.signal?.aborted) done()
          else options.signal?.addEventListener('abort', done, { once: true })
        })
      }
      if ('error' in answer) {
        return answer.status === undefined
          ? { ok: false, error: answer.error }
          : { ok: false, error: answer.error, status: answer.status }
      }
      if ('raw' in answer) return { ok: true, value: answer.raw }
      return { ok: true, value: { verdicts: answer.verdicts } }
    },
    async generateTree(_hobby: string, _config: ProviderConfig, _options: GenerateOptions): Promise<AdapterResult> {
      return { ok: false, error: 'bad_output' }
    },
    async testConnection(): Promise<AdapterResult> {
      return { ok: true, value: null }
    },
  }
}

// ---------------------------------------------------------------------------
// FakeBackground
// ---------------------------------------------------------------------------

export type BackgroundMode = 'run' | 'kill' | 'unavailable'

export interface FakeBackground {
  /** The `background` dependency: returns true when the task was accepted, false when no background is available. */
  background(task: Promise<unknown>): boolean
  /** Number of tasks accepted (in `run` mode or dropped in `kill` mode). */
  readonly accepted: number
  /** Tasks dropped by `kill` mode. */
  readonly dropped: number
  mode(): BackgroundMode
  /** Subsequent tasks are dropped, like the platform ending the function. Returns true to the caller. */
  kill(): void
  /** Subsequent calls return false so the caller writes a due row. */
  unavailable(): void
  /** Back to collecting tasks. */
  run(): void
  /** Waits for every collected task to settle. Never rejects. */
  settled(): Promise<void>
}

export function createFakeBackground(initial: BackgroundMode = 'run'): FakeBackground {
  let mode: BackgroundMode = initial
  let accepted = 0
  let dropped = 0
  const pending = new Set<Promise<unknown>>()

  return {
    background(task) {
      if (mode === 'unavailable') return false
      accepted += 1
      // A dropped task must not surface as an unhandled rejection.
      const safe = task.then(
        () => undefined,
        () => undefined,
      )
      if (mode === 'kill') {
        dropped += 1
        return true
      }
      pending.add(safe)
      void safe.then(() => pending.delete(safe))
      return true
    },
    get accepted() {
      return accepted
    },
    get dropped() {
      return dropped
    },
    mode: () => mode,
    kill() {
      mode = 'kill'
    },
    unavailable() {
      mode = 'unavailable'
    },
    run() {
      mode = 'run'
    },
    async settled() {
      while (pending.size > 0) await Promise.all([...pending])
    },
  }
}

export { never }
