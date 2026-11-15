// runFreshCheck sanity checks (spec: fresh, task 9.4). Full properties live in tasks 9.5 to 9.9.
import { describe, expect, it } from 'vitest'
import type { CheckKey, FeedEntry } from '../../shared/types/fresh'
import type { PoolVideo } from '../../shared/types/video'
import { checkKeyId } from '../../shared/utils/fresh-keys'
import { poolKey } from '../../shared/utils/video-normalize'
import {
  runFreshCheck,
  type FreshCheckDeps,
  type FreshCheckLogEntry,
} from '../../server/utils/fresh/check'
import type { ChannelSourceRow } from '../../server/utils/fresh/sources'
import { CALL_DEADLINE_MS } from '../../server/utils/fresh/schedule'
import { createQuotaGate, type QuotaGate } from '../../server/utils/video/quota'
import type { ProviderConfig } from '../../shared/types/llm'
import {
  createFakeFeedFetcher,
  createFakeFreshJudge,
  createFreshStores,
  keepAllVerdicts,
  type FakeFeedFetcher,
  type FreshStores,
} from '../support/fresh-fakes'
import { createFakeVideoProvider, fakeDetails, type FakeVideoProvider } from '../support/video-fakes'

const KEY: CheckKey = { hobby: 'bouldering', language: 'en' }
const CHANNEL_A = 'UCchannelA000000000000a'
const CHANNEL_B = 'UCchannelB000000000000b'
const CONFIG: ProviderConfig = { provider: 'openai', model: 'test-model', apiKey: 'test-key' }
const HOUR_MS = 3_600_000

function source(channelId: string): ChannelSourceRow {
  return { channelId, channelName: `Name ${channelId}`, qualifyingCount: 3, latestQualifyingMs: 0, lastCheckedMs: null }
}

function entry(videoId: string, channelId: string, publishedMs: number): FeedEntry {
  return { videoId, title: `Title ${videoId}`, channelId, publishedMs }
}

function poolVideo(id: string): PoolVideo {
  return {
    id,
    title: `T ${id}`,
    channel: 'Pool channel',
    channelId: null,
    thumbnailUrl: '',
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    teachesThisSkill: 0.9,
    levelFit: 0.8,
    style: 'technique',
    matchedQuestText: null,
  }
}

async function seedPool(stores: FreshStores, skill: string): Promise<void> {
  const key = poolKey({ hobby: KEY.hobby, skillTitle: skill, level: 'beginner', language: 'en' })
  expect(await stores.pipeline.takeLease(key, 'pool-run')).toBe(true)
  expect(await stores.pipeline.storePool(key, 'pool-run', [poolVideo('poolvideo01')])).toBe(true)
}

interface Harness {
  stores: FreshStores
  feeds: FakeFeedFetcher
  provider: FakeVideoProvider
  judge: ReturnType<typeof createFakeFreshJudge>
  logs: FreshCheckLogEntry[]
  deps: FreshCheckDeps
  startedMs: number
  deadlineMs: number
}

async function harness(options: {
  sources?: string[]
  feeds?: FakeFeedFetcher
  provider?: FakeVideoProvider
  judge?: ReturnType<typeof createFakeFreshJudge>
  gate?: QuotaGate
  pool?: boolean
} = {}): Promise<Harness> {
  const stores = createFreshStores()
  const { clock, fresh, pipeline } = stores
  if (options.pool !== false) await seedPool(stores, 'footwork')
  fresh.setSources(KEY, (options.sources ?? [CHANNEL_A]).map(source))
  const startedMs = await fresh.takeLease(KEY, 'run-1')
  if (startedMs === null) throw new Error('lease not taken')
  const deadlineMs = clock.now() + CALL_DEADLINE_MS
  const feeds = options.feeds ?? createFakeFeedFetcher({ clock })
  const provider = options.provider ?? createFakeVideoProvider()
  const judge = options.judge ?? createFakeFreshJudge()
  const logs: FreshCheckLogEntry[] = []
  const deps: FreshCheckDeps = {
    store: fresh,
    gate: options.gate ?? createQuotaGate(pipeline),
    provider,
    adapter: judge,
    config: CONFIG,
    feedFetcher: feeds.fetch,
    deadline: clock.signalAt(deadlineMs),
    remainingMs: () => deadlineMs - clock.now(),
    deadlineDbMs: deadlineMs,
    timer: clock.timer,
    judgePrompt: 'Fresh judge prompt',
    log: (e) => logs.push(e),
  }
  return { stores, feeds, provider, judge, logs, deps, startedMs, deadlineMs }
}

function expectUnchangedFailure(h: Harness, type: string): void {
  expect(h.logs).toEqual([{ checkKey: checkKeyId(KEY), type }])
  expect(h.stores.fresh.storedItems(KEY)).toEqual([])
  expect(h.stores.fresh.leaseOf(KEY)).toBeNull()
  expect(h.stores.fresh.checkStateOf(KEY).lastSuccessMs).toBeNull()
}

describe('runFreshCheck', () => {
  it('stores judged new videos, updates the check times and releases the Lease', async () => {
    const stores0 = createFreshStores()
    const now = stores0.clock.now()
    const entries = [entry('vidAAAAAAA1', CHANNEL_A, now - HOUR_MS), entry('vidAAAAAAA2', CHANNEL_A, now - 2 * HOUR_MS)]
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL_A]: { entries } } })
    const provider = createFakeVideoProvider({ catalog: entries.map((e) => fakeDetails(e.videoId, { channelId: null })) })
    const judge = createFakeFreshJudge([{ verdicts: keepAllVerdicts(entries.map((e) => ({ id: e.videoId })), 'footwork') }])
    const h = await harness({ feeds, provider, judge })

    const outcome = await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)

    expect(outcome).toEqual({ kind: 'stored', items: 2 })
    expect(h.provider.detailsCalls).toHaveLength(1)
    expect(h.judge.calls).toHaveLength(1)
    const items = h.stores.fresh.storedItems(KEY)
    expect(items.map((i) => [i.videoId, i.skillNorm, i.channelId])).toEqual([
      ['vidAAAAAAA1', 'footwork', CHANNEL_A],
      ['vidAAAAAAA2', 'footwork', CHANNEL_A],
    ])
    expect(items[0]?.publishedMs).toBe(entries[0]?.publishedMs)
    expect(h.stores.fresh.leaseOf(KEY)).toBeNull()
    expect(h.stores.fresh.checkStateOf(KEY).lastSuccessMs).not.toBeNull()
    expect((await h.stores.fresh.sources(KEY))[0]?.lastCheckedMs).toBe(h.startedMs)
    expect(h.logs).toEqual([])
  })

  it('succeeds with no feed fetch when the key has no Channel_Source', async () => {
    const h = await harness({ sources: [] })
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'stored', items: 0 })
    expect(h.feeds.calls).toHaveLength(0)
    expect(h.stores.fresh.checkStateOf(KEY).lastSuccessMs).not.toBeNull()
  })

  it('fails with feeds_failed when every feed fails', async () => {
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL_A]: { status: 500 }, [CHANNEL_B]: { body: 'not xml' } } })
    const h = await harness({ sources: [CHANNEL_A, CHANNEL_B], feeds })
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'failed', type: 'feeds_failed' })
    expectUnchangedFailure(h, 'feeds_failed')
  })

  it('fails with quota_refused and makes no details call', async () => {
    const now = createFreshStores().clock.now()
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL_A]: { entries: [entry('vidAAAAAAA1', CHANNEL_A, now - HOUR_MS)] } } })
    const gate: QuotaGate = {
      reserveSearch: async () => false,
      reserveDetails: async () => false,
      markExceeded: async () => {},
    }
    const h = await harness({ feeds, gate })
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'failed', type: 'quota_refused' })
    expect(h.provider.detailsCalls).toHaveLength(0)
    expectUnchangedFailure(h, 'quota_refused')
  })

  it('fails with model_failed on a model error, with one call and no retry', async () => {
    const now = createFreshStores().clock.now()
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL_A]: { entries: [entry('vidAAAAAAA1', CHANNEL_A, now - HOUR_MS)] } } })
    const provider = createFakeVideoProvider({ catalog: [fakeDetails('vidAAAAAAA1')] })
    const judge = createFakeFreshJudge([{ error: 'provider_error' }])
    const h = await harness({ feeds, provider, judge })
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'failed', type: 'model_failed' })
    expect(h.judge.calls).toHaveLength(1)
    expectUnchangedFailure(h, 'model_failed')
  })

  it('succeeds with no model call when the hobby has no stored pool', async () => {
    const now = createFreshStores().clock.now()
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL_A]: { entries: [entry('vidAAAAAAA1', CHANNEL_A, now - HOUR_MS)] } } })
    const provider = createFakeVideoProvider({ catalog: [fakeDetails('vidAAAAAAA1')] })
    const h = await harness({ feeds, provider, pool: false })
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'stored', items: 0 })
    expect(h.judge.calls).toHaveLength(0)
  })

  it('fails with deadline_exceeded when a feed is still in flight at the Call_Deadline', async () => {
    const stores0 = createFreshStores()
    const now = stores0.clock.now()
    const h0 = await harness({ sources: [CHANNEL_A, CHANNEL_B] })
    // One feed succeeds, the other hangs until the deadline fires.
    h0.feeds.script(CHANNEL_A, { entries: [entry('vidAAAAAAA1', CHANNEL_A, now - HOUR_MS)] })
    h0.feeds.script(CHANNEL_B, { hang: true })
    const running = runFreshCheck(KEY, 'run-1', h0.startedMs, h0.deps)
    await new Promise((resolve) => setTimeout(resolve, 20))
    h0.stores.clock.advance(CALL_DEADLINE_MS)
    expect(await running).toEqual({ kind: 'failed', type: 'deadline_exceeded' })
    expect(h0.logs).toEqual([{ checkKey: checkKeyId(KEY), type: 'deadline_exceeded' }])
    expect(h0.stores.fresh.storedItems(KEY)).toEqual([])
    expect(h0.stores.fresh.checkStateOf(KEY).lastSuccessMs).toBeNull()
  })

  it('does not start the store with less than 3 s left', async () => {
    const h = await harness({ sources: [] })
    h.stores.clock.advance(CALL_DEADLINE_MS - 2_900)
    expect(await runFreshCheck(KEY, 'run-1', h.startedMs, h.deps)).toEqual({ kind: 'failed', type: 'deadline_exceeded' })
    expectUnchangedFailure(h, 'deadline_exceeded')
  })
})
