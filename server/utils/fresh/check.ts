/**
 * One Fresh_Check for one Check_Key (spec: fresh, design "One Fresh_Check"):
 * sources, feeds (8 at a time), window, merge, details (all units reserved first, batches in
 * parallel), filter, pools check, Judge (one call, newest 40), verdicts, store.
 *
 * The caller (the Check_Route) has already taken the Lease for `runId` at `startedMs` (db time).
 * Every failure releases the Lease (best effort; it expires after 300 s anyway) and logs
 * `{ checkKey, type }` with exactly one fixed type and nothing else (Req 7.6). Nothing is written
 * except through the single `storeCheck` transaction, so a failure stores nothing (Req 7.5).
 *
 * Deadline rule (Req 3.15, 4.4): after every stage and on every caught error the deadline
 * signal is checked first; once it has fired the outcome is `deadline_exceeded`, whatever the
 * stage's own result. The store starts only with at least `STORE_RESERVE_MS` left.
 * `runFreshCheck` never throws.
 */
import { z } from 'zod'
import type { CheckKey, FeedEntry } from '../../../shared/types/fresh'
import type { ProviderConfig } from '../../../shared/types/llm'
import { checkKeyId } from '../../../shared/utils/fresh-keys'
import { toProviderSchema, type JsonSchema } from '../generation-schema'
import type { ProviderAdapter } from '../providers/types'
import { batchIds, detailsBatch, type DetailsBatchResult } from '../video/details'
import { filterCandidates } from '../video/filter'
import type { VideoDetails, VideoProvider } from '../video/provider'
import type { QuotaGate } from '../video/quota'
import type { FreshItemInsert, FreshStore, StoreCheckOutcome } from './check-store'
import { FEED_CONCURRENCY, fetchChannelFeed, mapLimit } from './feed-fetch'
import { parseChannelFeed } from './feed-parser'
import { chooseForJudge, keepEntries, mergeEntries } from './feed-window'
import { applyFreshVerdicts, buildFreshJudgeInput, freshJudgeOutputSchema, type JudgedFresh } from './fresh-judge'
import { STORE_RESERVE_MS } from './schedule'
import type { ChannelSourceRow } from './sources'

/** Model time limit for the Fresh Judge call; ends earlier at the Call_Deadline (Req 6.1, 6.6). */
export const FRESH_JUDGE_TIMEOUT_MS = 30_000
/** Output budget of the Fresh Judge call: up to 40 verdicts with a Why_Line each. */
export const FRESH_JUDGE_MAX_TOKENS = 8192
/** How long a failed check waits for the best-effort Lease release. */
const RELEASE_WAIT_MS = 2_000

export type FreshFailure =
  | 'feeds_failed'
  | 'details_failed'
  | 'quota_refused'
  | 'model_failed'
  | 'lease_lost'
  | 'store_failed'
  | 'deadline_exceeded'

export type FreshCheckOutcome = { kind: 'stored'; items: number } | { kind: 'failed'; type: FreshFailure }

export interface FreshCheckLogEntry {
  /** `checkKeyId(key)`. */
  checkKey: string
  type: FreshFailure
}

export interface FreshCheckDeps {
  store: FreshStore
  /** Quota_Gate over the shared PipelineStore (one Daily_Quota with the skill pipeline). */
  gate: QuotaGate
  provider: VideoProvider
  /** Judge adapter; `config` is the Default_Config. A null config is a model failure. */
  adapter: ProviderAdapter
  config: ProviderConfig | null
  feedFetcher: typeof fetch
  /** Fires at the Call_Deadline (callStart + 117 s). */
  deadline: AbortSignal
  /** Remaining ms until the Call_Deadline (app clock). */
  remainingMs: () => number
  /** The Call_Deadline in database time, passed to `storeCheck`. */
  deadlineDbMs: number
  /** Builds per-call timeout signals. Default `AbortSignal.timeout`; tests pass a fake clock timer. */
  timer?: (ms: number) => AbortSignal
  /** Overrides the server prompt asset (tests). */
  judgePrompt?: string
  /** Failure log. Default: `console.error('[fresh]', entry)`. */
  log?: (entry: FreshCheckLogEntry) => void
}

/** A stage failure; `fail` maps it to the outcome, with the deadline taking precedence. */
class StageFailure extends Error {
  constructor(readonly type: FreshFailure) {
    super(type)
    this.name = 'StageFailure'
  }
}

/** A video that passed details and the filter, with the Feed_Entry it came from. */
interface Candidate {
  entry: FeedEntry
  video: VideoDetails
}

const FRESH_JUDGE_SCHEMA: JsonSchema = toProviderSchema(z.toJSONSchema(freshJudgeOutputSchema) as JsonSchema)

let promptPromise: Promise<string> | undefined

/** Reads the Fresh Judge prompt server asset once. A failed read is not cached. */
function loadFreshJudgePrompt(): Promise<string> {
  promptPromise ??= (async () => {
    const text = await useStorage('assets:prompts').getItem('fresh-judge.md')
    if (typeof text !== 'string' || text.trim() === '') throw new Error('prompt_missing')
    return text
  })().catch((error: unknown) => {
    promptPromise = undefined
    throw error
  })
  return promptPromise
}

const defaultTimer = (ms: number): AbortSignal => AbortSignal.timeout(ms)

function defaultLog(entry: FreshCheckLogEntry): void {
  console.error('[fresh]', entry)
}

/** Settles when the signal fires (never rejects). */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
}

/**
 * Races a database call against the deadline, so a stalled call cannot hold the check past the
 * Call_Deadline. Rejects with `deadline_exceeded` when the deadline fires first.
 */
async function raceDeadline<T>(work: Promise<T>, deadline: AbortSignal): Promise<T> {
  if (deadline.aborted) {
    work.catch(() => {})
    throw new StageFailure('deadline_exceeded')
  }
  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new StageFailure('deadline_exceeded'))
    deadline.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([work, aborted])
  } finally {
    if (onAbort) deadline.removeEventListener('abort', onAbort)
    work.catch(() => {})
    aborted.catch(() => {})
  }
}

/** Runs a database read; a rejection is a `store_failed` stage failure. */
async function dbCall<T>(work: () => Promise<T>, deadline: AbortSignal): Promise<T> {
  try {
    return await raceDeadline(work(), deadline)
  } catch (error) {
    if (error instanceof StageFailure) throw error
    throw new StageFailure('store_failed')
  }
}

/** Fetches and windows every feed, 8 at a time. Returns kept entries per succeeded feed. */
async function readFeeds(
  sources: readonly ChannelSourceRow[],
  startedMs: number,
  deps: FreshCheckDeps,
  timer: (ms: number) => AbortSignal,
): Promise<{ perFeed: FeedEntry[][]; checkedChannelIds: string[] }> {
  const results = await mapLimit(sources, FEED_CONCURRENCY, (src) =>
    fetchChannelFeed(src.channelId, { fetcher: deps.feedFetcher, signal: deps.deadline, timer }),
  )
  const perFeed: FeedEntry[][] = []
  const checkedChannelIds: string[] = []
  results.forEach((result, index) => {
    const src = sources[index]
    if (!src || !result.ok) return
    const parsed = parseChannelFeed(result.xml)
    if (!Array.isArray(parsed)) return // not_xml / not_atom counts as a failed fetch (Req 4.9)
    perFeed.push(keepEntries(parsed, src, startedMs))
    checkedChannelIds.push(src.channelId)
  })
  return { perFeed, checkedChannelIds }
}

/**
 * Details for the merged entries: reserves 1 unit per batch, all before any call (Req 5.1, 5.2),
 * then runs the batches in parallel. One failed batch fails the stage and aborts the others
 * (Req 5.3). Missing ids are dropped (Req 5.6); a missing channel id comes from the entry (Req 5.7).
 */
async function readDetails(entries: readonly FeedEntry[], deps: FreshCheckDeps): Promise<Candidate[]> {
  const byEntry = new Map(entries.map((e) => [e.videoId, e]))
  const batches = batchIds([...byEntry.keys()])
  for (let i = 0; i < batches.length; i++) {
    const reserved = await dbCall(() => deps.gate.reserveDetails(), deps.deadline)
    if (!reserved) throw new StageFailure('quota_refused')
  }
  const siblings = new AbortController()
  const signal = AbortSignal.any([deps.deadline, siblings.signal])
  const results = await Promise.all(
    batches.map(async (batch): Promise<DetailsBatchResult> => {
      const result = await detailsBatch({ provider: deps.provider, gate: deps.gate, signal }, batch)
      if (!result.ok) siblings.abort()
      return result
    }),
  )
  const byId = new Map<string, VideoDetails>()
  for (const result of results) {
    if (!result.ok) throw new StageFailure('details_failed')
    for (const d of result.details) if (!byId.has(d.id)) byId.set(d.id, d)
  }
  const out: Candidate[] = []
  for (const entry of entries) {
    const d = byId.get(entry.videoId)
    if (d) out.push({ entry, video: { ...d, channelId: d.channelId ?? entry.channelId } })
  }
  return out
}

/** One `generateStructured` call, no retry (Req 6.1, 6.6). */
async function judge(
  key: CheckKey,
  sent: readonly Candidate[],
  skillTitles: readonly string[],
  deps: FreshCheckDeps,
  timer: (ms: number) => AbortSignal,
): Promise<JudgedFresh[]> {
  if (!deps.config) throw new StageFailure('model_failed')
  const videos = sent.map((c) => c.video)
  let output: unknown
  try {
    const prompt = deps.judgePrompt ?? (await loadFreshJudgePrompt())
    const result = await deps.adapter.generateStructured(deps.config, {
      systemPrompt: prompt,
      userText: buildFreshJudgeInput({ hobby: key.hobby, language: key.language, skillTitles }, videos),
      schemaName: 'fresh_verdicts',
      schema: FRESH_JUDGE_SCHEMA,
      maxTokens: FRESH_JUDGE_MAX_TOKENS,
      signal: AbortSignal.any([deps.deadline, timer(FRESH_JUDGE_TIMEOUT_MS)]),
    })
    if (!result.ok) throw new StageFailure('model_failed')
    output = result.value
  } catch {
    throw new StageFailure('model_failed')
  }
  const applied = applyFreshVerdicts(output, videos, skillTitles)
  if (!applied.ok) throw new StageFailure('model_failed')
  return applied.kept
}

function toInsert(judged: JudgedFresh, entry: FeedEntry): FreshItemInsert {
  const v = judged.video
  return {
    videoId: v.id,
    skillNorm: judged.skillTitle,
    level: judged.level,
    channelId: v.channelId ?? entry.channelId,
    video: {
      title: v.title,
      channel: v.channel,
      thumbnailUrl: v.thumbnailUrl,
      // The filter drops unknown durations; the fallback only satisfies the type.
      durationSeconds: v.durationSeconds ?? 0,
      style: judged.style,
      teachesThisSkill: judged.teachesThisSkill,
      levelFit: judged.levelFit,
    },
    why: judged.why,
    publishedMs: entry.publishedMs,
  }
}

/** Runs one Fresh_Check. Never throws. */
export async function runFreshCheck(
  key: CheckKey,
  runId: string,
  startedMs: number,
  deps: FreshCheckDeps,
): Promise<FreshCheckOutcome> {
  const { store, deadline } = deps
  const timer = deps.timer ?? defaultTimer
  const log = deps.log ?? defaultLog

  /** Throws `deadline_exceeded` once the Call_Deadline has fired. */
  const checkDeadline = (): void => {
    if (deadline.aborted) throw new StageFailure('deadline_exceeded')
  }

  /** The single store transaction; success with no item uses it too (Req 4.7, 4.13, 5.5, 6.3). */
  const storeAll = async (
    items: readonly FreshItemInsert[],
    checkedChannelIds: readonly string[],
  ): Promise<FreshCheckOutcome> => {
    checkDeadline()
    if (deps.remainingMs() < STORE_RESERVE_MS) throw new StageFailure('deadline_exceeded')
    let outcome: StoreCheckOutcome
    try {
      outcome = await raceDeadline(
        store.storeCheck({ key, runId, startedMs, deadlineMs: deps.deadlineDbMs, items, checkedChannelIds }),
        deadline,
      )
    } catch (error) {
      if (error instanceof StageFailure) throw error
      throw new StageFailure('store_failed')
    }
    if (outcome === 'lease_lost') throw new StageFailure('lease_lost')
    if (outcome === 'deadline_exceeded') throw new StageFailure('deadline_exceeded')
    return { kind: 'stored', items: items.length }
  }

  try {
    checkDeadline()

    // Sources (Req 4.13).
    const sources = await dbCall(() => store.sources(key), deadline)
    checkDeadline()
    if (sources.length === 0) return await storeAll([], [])

    // Feeds and window (Req 4.1 to 4.5, 4.9).
    const { perFeed, checkedChannelIds } = await readFeeds(sources, startedMs, deps, timer)
    checkDeadline()
    if (checkedChannelIds.length === 0) throw new StageFailure('feeds_failed')

    // Merge and drop stored ids (Req 4.6, 4.7).
    const candidateIds = mergeEntries(perFeed, new Set()).map((e) => e.videoId)
    const stored = await dbCall(() => store.storedIds(key, candidateIds), deadline)
    checkDeadline()
    const entries = mergeEntries(perFeed, stored)
    if (entries.length === 0) return await storeAll([], checkedChannelIds)

    // Details (Req 5.1 to 5.3, 5.6, 5.7).
    const detailed = await readDetails(entries, deps)
    checkDeadline()

    // Filter (Req 5.4, 5.5).
    const passed = new Set(
      filterCandidates(detailed.map((c) => c.video), { language: key.language, quickTip: false }).map((v) => v.id),
    )
    const filtered = detailed.filter((c) => passed.has(c.video.id))
    if (filtered.length === 0) return await storeAll([], checkedChannelIds)

    // Pools of the hobby (Req 6.2, 6.3).
    const skillTitles = await dbCall(() => store.skillTitles(key.hobby), deadline)
    checkDeadline()
    if (skillTitles.length === 0) return await storeAll([], checkedChannelIds)

    // Judge: newest 40, one call (Req 6.1, 6.12), then the verdict rules (Req 6.4 to 6.10).
    const sent = chooseForJudge(filtered)
    const kept = await judge(key, sent, skillTitles, deps, timer)
    checkDeadline()
    const entryOf = new Map(sent.map((c) => [c.video.id, c.entry]))
    const items: FreshItemInsert[] = []
    for (const judged of kept) {
      const entry = entryOf.get(judged.video.id)
      if (entry) items.push(toInsert(judged, entry))
    }

    // Store (Req 7.1, 7.2, 7.9, 3.15).
    return await storeAll(items, checkedChannelIds)
  } catch (error) {
    const own: FreshFailure = error instanceof StageFailure ? error.type : 'store_failed'
    const type: FreshFailure = deadline.aborted ? 'deadline_exceeded' : own
    try {
      log({ checkKey: checkKeyId(key), type })
    } catch {
      // Logging must not break the outcome.
    }
    await releaseBestEffort(store, key, runId, timer)
    return { kind: 'failed', type }
  }
}

/** Releases the Lease without waiting more than `RELEASE_WAIT_MS`. Never throws. */
async function releaseBestEffort(
  store: FreshStore,
  key: CheckKey,
  runId: string,
  timer: (ms: number) => AbortSignal,
): Promise<void> {
  let release: Promise<void>
  try {
    release = store.releaseLease(key, runId).catch(() => {})
  } catch {
    return
  }
  let wait: AbortSignal
  try {
    wait = timer(RELEASE_WAIT_MS)
  } catch {
    await release
    return
  }
  await Promise.race([release, whenAborted(wait)])
}
