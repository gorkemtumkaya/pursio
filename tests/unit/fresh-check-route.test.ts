// Check_Route examples (spec: fresh, task 10.5, Req 19.4, 19.17, 19.18, 3.16, 7.4).
import { describe, expect, it } from 'vitest'
import type { CheckKey, FeedEntry } from '../../shared/types/fresh'
import type { PoolVideo } from '../../shared/types/video'
import { checkKeyId, freshLeaseKey } from '../../shared/utils/fresh-keys'
import { poolKey } from '../../shared/utils/video-normalize'
import type { FreshCheckOutcome } from '../../server/utils/fresh/check'
import { handleCheckRequest, type RunFreshCheck } from '../../server/utils/fresh/handlers'
import { ACTIVE_PATH_S, CALL_DEADLINE_MS, STORE_RESERVE_MS } from '../../server/utils/fresh/schedule'
import { ProviderError, type VideoProvider } from '../../server/utils/video/provider'
import { createFakeClock, createFakeFeedFetcher, createFakeFreshJudge, keepAllVerdicts, type FakeClock } from '../support/fresh-fakes'
import { ROUTE_SECRET, activePath, createCheckRouteHarness, type CheckRouteHarness } from '../support/fresh-route-fakes'
import { createFakeVideoProvider, fakeDetails, type FakeJudge } from '../support/video-fakes'

const HOUR_MS = 3_600_000

/** A fake check that takes `durationMs` on the fake clock and succeeds. */
function timedCheck(clock: FakeClock, durationMs: (key: CheckKey) => number, finished: string[] = []): RunFreshCheck {
  return async (key, runId, _startedMs, deps): Promise<FreshCheckOutcome> => {
    clock.advance(durationMs(key))
    finished.push(key.hobby)
    await deps.store.releaseLease(key, runId)
    return { kind: 'stored', items: 0 }
  }
}

function call(h: CheckRouteHarness) {
  return handleCheckRequest({ secretHeader: ROUTE_SECRET }, h.deps)
}

function poolVideo(id: string): PoolVideo {
  return {
    id,
    title: `Pool ${id}`,
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

const KEY: CheckKey = { hobby: 'bouldering', language: 'en' }
const VIDEO = 'vidAAAAAAA1'

function channel(i: number): string {
  return `UCchan${String(i).padStart(17, '0')}`
}

/** One active key with a pool, `sources` Channel_Sources and one new video on the first feed. */
async function realCheckHarness(options: {
  clock: FakeClock
  sources?: number
  feeds?: ReturnType<typeof createFakeFeedFetcher>
  provider?: VideoProvider
  judge?: FakeJudge
}): Promise<CheckRouteHarness> {
  const { clock } = options
  const now = clock.now()
  const entry: FeedEntry = { videoId: VIDEO, title: 'New video', channelId: channel(0), publishedMs: now - HOUR_MS }
  const feeds = options.feeds ?? createFakeFeedFetcher({ clock, feeds: { [channel(0)]: { entries: [entry] } } })
  const provider = options.provider ?? createFakeVideoProvider({ catalog: [fakeDetails(VIDEO, { channelId: channel(0) })] })
  const judge = options.judge ?? createFakeFreshJudge([{ verdicts: keepAllVerdicts([{ id: VIDEO }], 'footwork') }])
  const h = createCheckRouteHarness({ clock, feeds, provider, judge })
  h.stores.fresh.setPaths([activePath(KEY.hobby, 'en', now)])
  const pk = poolKey({ hobby: KEY.hobby, skillTitle: 'footwork', level: 'beginner', language: 'en' })
  await h.stores.pipeline.takeLease(pk, 'pool-run')
  await h.stores.pipeline.storePool(pk, 'pool-run', [poolVideo('poolvideo01')])
  h.stores.fresh.setSources(
    KEY,
    Array.from({ length: options.sources ?? 1 }, (_v, i) => ({
      channelId: channel(i),
      channelName: `Channel ${i}`,
      qualifyingCount: 3,
      latestQualifyingMs: now - i,
      lastCheckedMs: null,
    })),
  )
  return h
}

function expectDeadlineFailure(h: CheckRouteHarness): void {
  expect(h.logs).toContainEqual({ checkKey: checkKeyId(KEY), type: 'deadline_exceeded' })
  expect(h.stores.fresh.storedItems(KEY)).toEqual([])
  expect(h.stores.fresh.checkStateOf(KEY).lastSuccessMs).toBeNull()
  expect(h.stores.fresh.leaseOf(KEY)).toBeNull()
  expect(h.storeCalls).not.toContain('storeCheck')
}

describe('Check_Route limits', () => {
  it('runs at most 3 Fresh_Checks for 4 due keys', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 1_000) })
    h.stores.fresh.setPaths(['a', 'b', 'c', 'd'].map((hobby) => activePath(hobby, 'en', clock.now())))
    expect(await call(h)).toEqual({ status: 202, body: { accepted: true } })
    expect(h.checks.map((c) => c.key.hobby)).toEqual(['a', 'b', 'c'])
    expect(h.stores.fresh.checkStateOf({ hobby: 'd', language: 'en' }).lastAttemptMs).toBeNull()
  })

  it('starts a check at exactly 10 s and lets it finish, but starts none after 10 s', async () => {
    const clock = createFakeClock()
    const finished: string[] = []
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, (k) => (k.hobby === 'a' ? 10_000 : 5_000), finished) })
    h.stores.fresh.setPaths(['a', 'b', 'c'].map((hobby) => activePath(hobby, 'en', clock.now())))
    const start = clock.now()
    await call(h)
    expect(h.checks.map((c) => [c.key.hobby, c.atMs - start])).toEqual([
      ['a', 0],
      ['b', 10_000],
    ])
    expect(finished).toEqual(['a', 'b'])
  })

  it('skips a held Lease without counting it or recording an attempt; 300 s frees it', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 0) })
    const now = clock.now()
    h.stores.fresh.setPaths(['a', 'b', 'c', 'd'].map((hobby) => activePath(hobby, 'en', now)))
    const leases = h.stores.pipeline.sharedState().leases
    leases.set(freshLeaseKey({ hobby: 'a', language: 'en' }), { runId: 'other', takenAt: now - 299_999 })
    leases.set(freshLeaseKey({ hobby: 'b', language: 'en' }), { runId: 'other', takenAt: now - 300_000 })
    await call(h)
    expect(h.checks.map((c) => c.key.hobby)).toEqual(['b', 'c', 'd'])
    expect(h.stores.fresh.checkStateOf({ hobby: 'a', language: 'en' }).lastAttemptMs).toBeNull()
  })

  it('runs never-attempted keys first, then by Last_Attempt_Time', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 0) })
    const now = clock.now()
    h.stores.fresh.setPaths(['a', 'b', 'c', 'd'].map((hobby) => activePath(hobby, 'en', now)))
    h.stores.fresh.setCheckState({ hobby: 'a', language: 'en' }, { lastSuccessMs: null, lastAttemptMs: now - 1_000 })
    h.stores.fresh.setCheckState({ hobby: 'b', language: 'en' }, { lastSuccessMs: null, lastAttemptMs: now - 5_000 })
    h.stores.fresh.setCheckState({ hobby: 'c', language: 'en' }, { lastSuccessMs: now - 86_399_000, lastAttemptMs: null })
    await call(h)
    // c is not due (success under 86400 s ago); d was never attempted.
    expect(h.checks.map((c) => c.key.hobby)).toEqual(['d', 'b', 'a'])
  })

  it('goes on after a failed check', async () => {
    const clock = createFakeClock()
    const runCheck: RunFreshCheck = async (key, runId, _s, deps) => {
      await deps.store.releaseLease(key, runId)
      return key.hobby === 'a' ? { kind: 'failed', type: 'feeds_failed' } : { kind: 'stored', items: 0 }
    }
    const h = createCheckRouteHarness({ clock, runCheck })
    h.stores.fresh.setPaths(['a', 'b'].map((hobby) => activePath(hobby, 'en', clock.now())))
    await call(h)
    expect(h.checks.map((c) => c.key.hobby)).toEqual(['a', 'b'])
  })

  it('makes no check and no feed, provider or model call when no key is due', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock })
    h.stores.fresh.setPaths([activePath('a', 'en', clock.now())])
    h.stores.fresh.setCheckState({ hobby: 'a', language: 'en' }, { lastSuccessMs: clock.now() - 1_000, lastAttemptMs: clock.now() - 1_000 })
    expect(await call(h)).toEqual({ status: 202, body: { accepted: true } })
    expect(h.checks).toEqual([])
    expect(h.feeds.calls).toEqual([])
    expect(h.provider.detailsCalls).toEqual([])
    expect(h.judge.calls).toEqual([])
  })
})

describe('Check_Route active keys', () => {
  it('gives no check to a hobby whose path is inactive for more than 14 days', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 0) })
    const now = clock.now()
    h.stores.fresh.setPaths([
      activePath('stale', 'en', now, ACTIVE_PATH_S * 1000 + 1),
      { hobby: 'saved', language: 'en', archived: false, lastOpenedMs: null, progressUpdatedMs: now - ACTIVE_PATH_S * 1000 + 1_000 },
    ])
    await call(h)
    expect(h.checks.map((c) => c.key.hobby)).toEqual(['saved'])
  })

  it('forms only en keys for a null or empty profile language', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 0) })
    h.stores.fresh.setPaths([activePath('a', null, clock.now()), activePath('b', '', clock.now()), activePath('c', '  ', clock.now())])
    await call(h)
    expect(h.checks.map((c) => c.key)).toEqual([
      { hobby: 'a', language: 'en' },
      { hobby: 'b', language: 'en' },
      { hobby: 'c', language: 'en' },
    ])
  })
})

describe('Check_Route failures', () => {
  it('logs cleanup_failed and still runs the checks', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock, runCheck: timedCheck(clock, () => 0) })
    h.stores.fresh.setPaths([activePath('a', 'en', clock.now())])
    h.stores.fresh.failNext('cleanup')
    await call(h)
    expect(h.logs).toContainEqual({ type: 'cleanup_failed' })
    expect(h.checks).toHaveLength(1)
  })

  it('answers 202 with store_failed and no check when the active-hobby read fails', async () => {
    const clock = createFakeClock()
    const h = createCheckRouteHarness({ clock })
    h.stores.fresh.setPaths([activePath('a', 'en', clock.now())])
    h.stores.fresh.failNext('activeHobbies')
    expect(await call(h)).toEqual({ status: 202, body: { accepted: true } })
    expect(h.logs).toEqual([{ type: 'store_failed' }])
    expect(h.checks).toEqual([])
  })

  it('answers 202 and runs nothing when the pipeline is not configured', async () => {
    const h = createCheckRouteHarness()
    expect(await handleCheckRequest({ secretHeader: ROUTE_SECRET }, { ...h.deps, run: null })).toEqual({
      status: 202,
      body: { accepted: true },
    })
    expect(h.storeCalls).toEqual([])
  })

  it('logs check_rejected with no header value on a wrong secret', async () => {
    const h = createCheckRouteHarness()
    const result = await handleCheckRequest({ secretHeader: 'wrong-secret-value' }, h.deps)
    expect(result).toEqual({ status: 401, body: { error: 'unauthorized' } })
    expect(h.logs).toEqual([{ type: 'check_rejected' }])
  })
})

describe('Check_Route with runFreshCheck', () => {
  it('stores a new video end to end', async () => {
    const clock = createFakeClock()
    const h = await realCheckHarness({ clock })
    await call(h)
    expect(h.stores.fresh.storedItems(KEY).map((i) => i.videoId)).toEqual([VIDEO])
    expect(h.stores.fresh.checkStateOf(KEY).lastSuccessMs).toBe(clock.now())
    expect(h.logs).toEqual([])
  })

  it('aborts a feed fetch in flight at 117 s with deadline_exceeded and keeps the key due', async () => {
    const clock = createFakeClock()
    const feeds = createFakeFeedFetcher({ clock, feeds: { [channel(0)]: { hang: true, advanceMs: CALL_DEADLINE_MS } } })
    const h = await realCheckHarness({ clock, feeds })
    await call(h)
    expectDeadlineFailure(h)
    expect(feeds.inFlight).toBe(0)
    expect((await h.stores.fresh.sources(KEY))[0]?.lastCheckedMs).toBeNull()
  })

  it('aborts a details call in flight at 117 s with deadline_exceeded', async () => {
    const clock = createFakeClock()
    const start = clock.now()
    let aborted = false
    const provider: VideoProvider = {
      search: async () => [],
      getDetails: (_ids, opts) => {
        clock.advance(start + CALL_DEADLINE_MS - clock.now())
        return new Promise((_resolve, reject) => {
          const fail = (): void => {
            aborted = true
            reject(new ProviderError('timeout'))
          }
          if (opts.signal?.aborted) fail()
          else opts.signal?.addEventListener('abort', fail, { once: true })
        })
      },
    }
    const h = await realCheckHarness({ clock, provider })
    await call(h)
    expect(aborted).toBe(true)
    expectDeadlineFailure(h)
  })

  it('aborts a Judge call in flight at 117 s with deadline_exceeded', async () => {
    const clock = createFakeClock()
    const start = clock.now()
    const base = createFakeFreshJudge()
    let aborted = false
    const judge: FakeJudge = {
      ...base,
      generateStructured: (_config, options) => {
        clock.advance(start + CALL_DEADLINE_MS - clock.now())
        return new Promise((resolve) => {
          const done = (): void => {
            aborted = true
            resolve({ ok: false, error: 'provider_error' })
          }
          if (options.signal?.aborted) done()
          else options.signal?.addEventListener('abort', done, { once: true })
        })
      },
    }
    const h = await realCheckHarness({ clock, judge })
    await call(h)
    expect(aborted).toBe(true)
    expectDeadlineFailure(h)
  })

  it('does not start the store with 2.9 s left before the Call_Deadline', async () => {
    const clock = createFakeClock()
    const start = clock.now()
    const base = createFakeFreshJudge([{ verdicts: keepAllVerdicts([{ id: VIDEO }], 'footwork') }])
    const judge: FakeJudge = {
      ...base,
      generateStructured: async (config, options) => {
        clock.advance(start + CALL_DEADLINE_MS - (STORE_RESERVE_MS - 100) - clock.now())
        return base.generateStructured(config, options)
      },
    }
    const h = await realCheckHarness({ clock, judge })
    await call(h)
    expect(start + CALL_DEADLINE_MS - clock.now()).toBe(2_900)
    expectDeadlineFailure(h)
  })

  it('keeps at most 8 feed fetches in flight for 15 Channel_Sources', async () => {
    const clock = createFakeClock()
    const feeds = createFakeFeedFetcher({ clock, defaultFeed: { entries: [], delayMs: 5 } })
    const h = await realCheckHarness({ clock, sources: 15, feeds })
    await call(h)
    expect(feeds.calls).toHaveLength(15)
    expect(feeds.peakInFlight).toBeLessThanOrEqual(8)
    expect(feeds.peakInFlight).toBeGreaterThan(1)
  })
})
