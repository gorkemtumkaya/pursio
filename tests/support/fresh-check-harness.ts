// A full Fresh_Check scenario on the in-memory store (spec: fresh, tasks 9.5 to 9.9).
// Every dependency of `runFreshCheck` is a fake on the fake clock and records its calls in one
// event log, so tests can assert order (all quota reservations before any details call) and
// fire the Call_Deadline inside any stage. Every fake honors its abort signal. No network.
import type { CheckKey, FeedEntry } from '../../shared/types/fresh'
import type { ProviderConfig } from '../../shared/types/llm'
import type { PoolVideo } from '../../shared/types/video'
import { poolKey } from '../../shared/utils/video-normalize'
import { runFreshCheck, type FreshCheckDeps, type FreshCheckLogEntry, type FreshCheckOutcome } from '../../server/utils/fresh/check'
import type { FreshItemRow } from '../../server/utils/fresh/check-store'
import type { MemoryCheckState } from '../../server/utils/fresh/check-store-memory'
import { CALL_DEADLINE_MS } from '../../server/utils/fresh/schedule'
import type { ChannelSourceRow } from '../../server/utils/fresh/sources'
import type { AdapterResult, ProviderAdapter, StructuredOptions } from '../../server/utils/providers/types'
import { ProviderError, type ProviderErrorKind, type VideoDetails, type VideoProvider } from '../../server/utils/video/provider'
import { createQuotaGate, type QuotaGate } from '../../server/utils/video/quota'
import {
  createFakeFeedFetcher,
  createFakeFreshJudge,
  createFreshStores,
  type FakeFeedFetcher,
  type FeedScript,
  type FreshJudgeScript,
  type FreshStores,
} from './fresh-fakes'

export const CHECK_KEY: CheckKey = { hobby: 'bouldering', language: 'en' }
export const CHECK_RUN_ID = 'run-A'
export const CHECK_CONFIG: ProviderConfig = { provider: 'openai', model: 'test-model', apiKey: 'test-key' }
export const SECOND_MS = 1_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000
export const WEEK_MS = 7 * DAY_MS

/** An 11-character video id for index `n` (distinct for distinct n). */
export function vid(n: number): string {
  return `v${String(n).padStart(10, '0')}`
}

/** A 24-character channel id for index `n` (code point order follows n). */
export function chan(n: number): string {
  return `UC${String(n).padStart(22, '0')}`
}

export function sourceRow(channelId: string, lastCheckedMs: number | null = null, qualifyingCount = 3): ChannelSourceRow {
  return { channelId, channelName: `Name ${channelId}`, qualifyingCount, latestQualifyingMs: 0, lastCheckedMs }
}

export function feedEntry(videoId: string, channelId: string, publishedMs: number): FeedEntry {
  return { videoId, title: `Title ${videoId}`, channelId, publishedMs }
}

/** Details that pass the filter for `en`, with the given channel id. */
export function passingDetails(id: string, channelId: string | null, overrides: Partial<VideoDetails> = {}): VideoDetails {
  return {
    id,
    title: `Title ${id}`,
    channel: 'Channel',
    channelId,
    description: `Description ${id}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    durationSeconds: 300,
    viewCount: 1000,
    likeCount: 100,
    publishedAt: null,
    defaultAudioLanguage: 'en',
    hasCaptions: true,
    embeddable: true,
    ...overrides,
  }
}

export function poolVideo(id: string, channelId: string | null, teaches = 0.9): PoolVideo {
  return {
    id,
    title: `T ${id}`,
    channel: `Name ${channelId}`,
    channelId,
    thumbnailUrl: '',
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    teachesThisSkill: teaches,
    levelFit: 0.8,
    style: 'technique',
    matchedQuestText: null,
  }
}

/** Stores one pool of the hobby through the pipeline store (runs the Channel_Source upkeep). */
export async function storeHobbyPool(
  stores: FreshStores,
  skill: string,
  videos: readonly PoolVideo[] = [poolVideo('poolvideo01', null)],
  key: CheckKey = CHECK_KEY,
): Promise<string> {
  const pk = poolKey({ hobby: key.hobby, skillTitle: skill, level: 'beginner', language: key.language })
  if (!(await stores.pipeline.takeLease(pk, 'pool-run'))) throw new Error('pool lease not taken')
  if (!(await stores.pipeline.storePool(pk, 'pool-run', videos))) throw new Error('pool not stored')
  return pk
}

/** One entry of the call log, in call order. */
export type CheckEvent =
  | { kind: 'feed'; channelId: string | null }
  | { kind: 'reserve'; granted: boolean }
  | { kind: 'details'; ids: string[] }
  | { kind: 'judge'; ids: string[] }

export interface CheckScenario {
  sources?: readonly ChannelSourceRow[]
  feeds?: Record<string, FeedScript | FeedScript[]>
  /** Details the provider knows; ids not in the catalog are absent from the answer. */
  catalog?: readonly VideoDetails[]
  /** The details call with this index (0-based, call order) fails with this kind. */
  detailsFail?: { call: number; kind: ProviderErrorKind }
  /** The quota reservation with this index (0-based) is refused. */
  quotaRefuseAt?: number
  /** Judge answers in call order. Default: no verdicts. */
  judge?: readonly FreshJudgeScript[]
  /** A null Default_Config (model failure with no call). */
  noConfig?: boolean
  /** Store a pool of the hobby so the Skill title list is `['footwork']`. Default true. */
  pool?: boolean
  /** Stored Fresh_Items seeded before the check. */
  items?: readonly FreshItemRow[]
  /** Check state before the Lease is taken. Default: never checked. */
  state?: MemoryCheckState
  /** The Lease taken before the check starts; default `CHECK_RUN_ID`. */
  runId?: string
}

/** Hooks a test sets to act inside a stage (for example to fire the Call_Deadline). */
export interface CheckHooks {
  onFeed?: (index: number) => void
  onDetails?: (index: number) => void
  onJudge?: () => void
  /** Before every FreshStore read (`sources`, `storedIds`, `skillTitles`). */
  onRead?: (method: 'sources' | 'storedIds' | 'skillTitles') => void
}

export interface CheckHarness {
  stores: FreshStores
  feeds: FakeFeedFetcher
  events: CheckEvent[]
  logs: FreshCheckLogEntry[]
  hooks: CheckHooks
  deps: FreshCheckDeps
  /** Db start time of the check (from `takeLease`). */
  startedMs: number
  /** The Call_Deadline (fake clock ms). */
  deadlineMs: number
  /** Moves the fake clock 1 ms past the Call_Deadline, so the deadline signal fires. */
  fireDeadline(): void
  run(): Promise<FreshCheckOutcome>
}

/** Video ids sent in a Fresh Judge user text, in order. */
export function judgeIds(userText: string): string[] {
  const parsed: unknown = JSON.parse(userText)
  if (typeof parsed !== 'object' || parsed === null || !('videos' in parsed) || !Array.isArray(parsed.videos)) return []
  return parsed.videos.map((v: unknown) =>
    typeof v === 'object' && v !== null && 'video_id' in v && typeof v.video_id === 'string' ? v.video_id : '',
  )
}

function createProvider(
  scenario: CheckScenario,
  events: CheckEvent[],
  hooks: CheckHooks,
): VideoProvider {
  const catalog = new Map((scenario.catalog ?? []).map((d) => [d.id, d]))
  let calls = 0
  return {
    async search() {
      throw new ProviderError('upstream')
    },
    async getDetails(ids, opts) {
      const index = calls++
      events.push({ kind: 'details', ids: [...ids] })
      hooks.onDetails?.(index)
      if (opts.signal?.aborted) throw new ProviderError('timeout')
      // Yield once so parallel batches really overlap; honor an abort meanwhile.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (opts.signal?.aborted) throw new ProviderError('timeout')
      if (scenario.detailsFail && scenario.detailsFail.call === index) throw new ProviderError(scenario.detailsFail.kind)
      return ids.flatMap((id) => {
        const d = catalog.get(id)
        return d ? [{ ...d }] : []
      })
    },
  }
}

function createGate(inner: QuotaGate, scenario: CheckScenario, events: CheckEvent[]): QuotaGate {
  let reservations = 0
  return {
    reserveSearch: () => inner.reserveSearch(),
    async reserveDetails() {
      const index = reservations++
      const granted = index === scenario.quotaRefuseAt ? false : await inner.reserveDetails()
      events.push({ kind: 'reserve', granted })
      return granted
    },
    markExceeded: () => inner.markExceeded(),
  }
}

function createAdapter(scenario: CheckScenario, events: CheckEvent[], hooks: CheckHooks): ProviderAdapter {
  const inner = createFakeFreshJudge(scenario.judge ?? [])
  return {
    ...inner,
    async generateStructured(config: ProviderConfig, options: StructuredOptions): Promise<AdapterResult> {
      events.push({ kind: 'judge', ids: judgeIds(options.userText) })
      hooks.onJudge?.()
      if (options.signal?.aborted) return { ok: false, error: 'provider_error' }
      return inner.generateStructured(config, options)
    },
  }
}

/** Builds the stores, seeds the scenario and takes the Lease. Call `run()` to run the check. */
export async function createCheckHarness(scenario: CheckScenario = {}): Promise<CheckHarness> {
  const stores = createFreshStores()
  const { clock, fresh, pipeline } = stores
  const events: CheckEvent[] = []
  const logs: FreshCheckLogEntry[] = []
  const hooks: CheckHooks = {}

  if (scenario.pool !== false) await storeHobbyPool(stores, 'footwork')
  // The pool store may have refreshed sources; the scenario's sources replace them.
  fresh.setSources(CHECK_KEY, scenario.sources ?? [])
  for (const item of scenario.items ?? []) fresh.putItem(item)
  if (scenario.state) fresh.setCheckState(CHECK_KEY, scenario.state)

  const runId = scenario.runId ?? CHECK_RUN_ID
  const startedMs = await fresh.takeLease(CHECK_KEY, runId)
  if (startedMs === null) throw new Error('lease not taken')
  const deadlineMs = clock.now() + CALL_DEADLINE_MS

  const feeds = createFakeFeedFetcher({ feeds: scenario.feeds ?? {}, clock })
  let feedCalls = 0
  const feedFetcher = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    events.push({ kind: 'feed', channelId: new URL(url).searchParams.get('channel_id') })
    hooks.onFeed?.(feedCalls++)
    return feeds.fetch(input, init)
  }) as typeof fetch

  const readSources = fresh.sources.bind(fresh)
  const readStoredIds = fresh.storedIds.bind(fresh)
  const readSkillTitles = fresh.skillTitles.bind(fresh)
  fresh.sources = async (key) => {
    hooks.onRead?.('sources')
    return readSources(key)
  }
  fresh.storedIds = async (key, ids) => {
    hooks.onRead?.('storedIds')
    return readStoredIds(key, ids)
  }
  fresh.skillTitles = async (hobby) => {
    hooks.onRead?.('skillTitles')
    return readSkillTitles(hobby)
  }

  const deps: FreshCheckDeps = {
    store: fresh,
    gate: createGate(createQuotaGate(pipeline), scenario, events),
    provider: createProvider(scenario, events, hooks),
    adapter: createAdapter(scenario, events, hooks),
    config: scenario.noConfig ? null : CHECK_CONFIG,
    feedFetcher,
    deadline: clock.signalAt(deadlineMs),
    remainingMs: () => deadlineMs - clock.now(),
    deadlineDbMs: deadlineMs,
    timer: clock.timer,
    judgePrompt: 'Fresh judge prompt',
    log: (entry) => logs.push(entry),
  }

  return {
    stores,
    feeds,
    events,
    logs,
    hooks,
    deps,
    startedMs,
    deadlineMs,
    fireDeadline() {
      const now = clock.now()
      if (now <= deadlineMs) clock.advance(deadlineMs + 1 - now)
    },
    run: () => runFreshCheck(CHECK_KEY, runId, startedMs, deps),
  }
}
