// Fresh_Check examples (spec: fresh, task 9.9; Req 19.1, 19.3, 19.5, 19.7).
// Cases already in fresh-check.test.ts and fresh-check-store-memory.test.ts are not repeated.
import { describe, expect, it } from 'vitest'
import { checkKeyId, freshLeaseKey } from '../../shared/utils/fresh-keys'
import { runFreshCheck, type FreshCheckDeps } from '../../server/utils/fresh/check'
import { FRESH_RETENTION_S } from '../../server/utils/fresh/check-store'
import { CALL_DEADLINE_MS, isDue } from '../../server/utils/fresh/schedule'
import { DEFAULT_DAILY_QUOTA } from '../../server/utils/video/quota'
import { createFreshStores, fakeFreshItem, freshVerdict, type FreshJudgeScript } from '../support/fresh-fakes'
import {
  CHECK_KEY,
  DAY_MS,
  HOUR_MS,
  SECOND_MS,
  WEEK_MS,
  chan,
  createCheckHarness,
  feedEntry,
  passingDetails,
  poolVideo,
  sourceRow,
  storeHobbyPool,
  vid,
  type CheckEvent,
  type CheckHarness,
  type CheckScenario,
} from '../support/fresh-check-harness'

function detailsIds(h: CheckHarness): string[] {
  return h.events.flatMap((e) => (e.kind === 'details' ? e.ids : []))
}

function judgedIds(h: CheckHarness): string[][] {
  return h.events.filter((e): e is Extract<CheckEvent, { kind: 'judge' }> => e.kind === 'judge').map((e) => e.ids)
}

function keepAll(count: number): FreshJudgeScript[] {
  return [{ verdicts: Array.from({ length: count }, (_, n) => freshVerdict(vid(n), 'footwork')) }]
}

describe('Channel_Sources on pool stores (in-memory, Req 19.1)', () => {
  it('adds a channel at exactly 0.7, none at 0.69, and skips a video with no channel id', async () => {
    const stores = createFreshStores()
    const pk = await storeHobbyPool(stores, 'footwork', [
      poolVideo('aaaaaaaaaaa', chan(1), 0.7),
      poolVideo('bbbbbbbbbbb', chan(2), 0.69),
      poolVideo('ccccccccccc', null, 0.95),
    ])
    expect((await stores.fresh.sources(CHECK_KEY)).map((s) => [s.channelId, s.qualifyingCount])).toEqual([[chan(1), 1]])
    expect(stores.pipeline.sharedState().pools.get(pk)?.videos.map((v) => v.id)).toEqual([
      'aaaaaaaaaaa',
      'bbbbbbbbbbb',
      'ccccccccccc',
    ])
  })

  it('16 qualifying channels leave 15, ordered by count, latest qualifying time, then channel id', async () => {
    const stores = createFreshStores()
    // First pool: channels 0 to 9, channel 0 with two videos.
    await storeHobbyPool(stores, 'footwork', [
      ...Array.from({ length: 10 }, (_, i) => poolVideo(`p1${String(i).padStart(9, '0')}`, chan(i))),
      poolVideo('p1extra0000', chan(0)),
    ])
    stores.clock.advance(HOUR_MS)
    // Second pool, later: channels 5 to 15.
    await storeHobbyPool(stores, 'balance', Array.from({ length: 11 }, (_, j) => poolVideo(`p2${String(j + 5).padStart(9, '0')}`, chan(j + 5))))
    const rows = await stores.fresh.sources(CHECK_KEY)
    // Count 2: channels 5 to 9 (later), then 0. Count 1: channels 10 to 15 (later), then 1 to 3; channel 4 is cut.
    expect(rows.map((r) => r.channelId)).toEqual([5, 6, 7, 8, 9, 0, 10, 11, 12, 13, 14, 15, 1, 2, 3].map(chan))
    expect(rows.map((r) => r.qualifyingCount)).toEqual([2, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1])
  })
})

describe('Feed window, stored ids and the Judge_Limit (Req 19.3)', () => {
  it('drops an entry exactly at the lower bound and keeps one 1 s later, for both bounds', async () => {
    const lastChecked = (start: number): number => start - 2 * DAY_MS
    const start = createFreshStores().clock.now()
    const a = chan(1) // last check time 2 days ago
    const b = chan(2) // no last check time: 7-day bound
    const feeds = {
      [a]: {
        entries: [
          feedEntry(vid(0), a, lastChecked(start)),
          feedEntry(vid(1), a, lastChecked(start) + SECOND_MS),
          feedEntry(vid(2), a, start),
          feedEntry(vid(3), a, start + SECOND_MS),
        ],
      },
      [b]: {
        entries: [
          feedEntry(vid(4), b, start - WEEK_MS),
          feedEntry(vid(5), b, start - WEEK_MS + SECOND_MS),
          feedEntry(vid(6), chan(9), start - HOUR_MS), // another channel id in this feed
        ],
      },
    }
    const h = await createCheckHarness({
      sources: [sourceRow(a, lastChecked(start)), sourceRow(b, null)],
      feeds,
      catalog: Array.from({ length: 7 }, (_, n) => passingDetails(vid(n), null)),
      judge: keepAll(7),
    })
    expect(h.startedMs).toBe(start)
    expect(await h.run()).toEqual({ kind: 'stored', items: 3 })
    expect(detailsIds(h)).toEqual([vid(2), vid(1), vid(5)])
  })

  it('does not send a stored video id again and keeps the stored item unchanged', async () => {
    const start = createFreshStores().clock.now()
    const old = fakeFreshItem(vid(0), { channelId: chan(1), foundMs: start - DAY_MS, why: 'Stored before.' })
    const h = await createCheckHarness({
      sources: [sourceRow(chan(1))],
      feeds: { [chan(1)]: { entries: [feedEntry(vid(0), chan(1), start - HOUR_MS), feedEntry(vid(1), chan(1), start - 2 * HOUR_MS)] } },
      catalog: [passingDetails(vid(0), chan(1)), passingDetails(vid(1), chan(1))],
      judge: keepAll(2),
      items: [old],
    })
    expect(await h.run()).toEqual({ kind: 'stored', items: 1 })
    expect(detailsIds(h)).toEqual([vid(1)])
    expect(judgedIds(h)).toEqual([[vid(1)]])
    const items = h.stores.fresh.storedItems(CHECK_KEY)
    expect(items.map((i) => i.videoId)).toEqual([vid(0), vid(1)])
    expect(items[0]).toEqual(old)
  })

  it('41 videos send the newest 40, store none of the rest, and a following check does not read it again', async () => {
    const start = createFreshStores().clock.now()
    const sources = [chan(1), chan(2), chan(3)]
    // Video n is published n minutes before the start; video 40 is the oldest.
    const entries = Array.from({ length: 41 }, (_, n) => feedEntry(vid(n), sources[n % 3] ?? chan(1), start - n * 60 * SECOND_MS))
    const feeds = Object.fromEntries(sources.map((c) => [c, { entries: entries.filter((e) => e.channelId === c) }]))
    const h = await createCheckHarness({
      sources: sources.map((c) => sourceRow(c)),
      feeds,
      catalog: [...entries.map((e) => passingDetails(e.videoId, null)), passingDetails(vid(41), null)],
      judge: keepAll(42),
    })
    expect(await h.run()).toEqual({ kind: 'stored', items: 40 })
    expect(judgedIds(h)).toEqual([entries.slice(0, 40).map((e) => e.videoId)])
    expect(h.stores.fresh.storedItems(CHECK_KEY).map((i) => i.videoId)).not.toContain(vid(40))

    // Next day: the same feeds plus one new video. The dropped video 40 is before the new lower bound.
    const { clock, fresh } = h.stores
    clock.advance(DAY_MS)
    const newer = feedEntry(vid(41), chan(1), clock.now() - HOUR_MS)
    h.feeds.script(chan(1), { entries: [newer, ...entries.filter((e) => e.channelId === chan(1))] })
    const started2 = await fresh.takeLease(CHECK_KEY, 'run-2')
    if (started2 === null) throw new Error('lease not taken')
    const deadline2 = clock.now() + CALL_DEADLINE_MS
    const before = h.events.length
    const deps2: FreshCheckDeps = {
      ...h.deps,
      deadline: clock.signalAt(deadline2),
      remainingMs: () => deadline2 - clock.now(),
      deadlineDbMs: deadline2,
    }
    expect(await runFreshCheck(CHECK_KEY, 'run-2', started2, deps2)).toEqual({ kind: 'stored', items: 1 })
    const later = h.events.slice(before).flatMap((e) => (e.kind === 'details' ? e.ids : []))
    expect(later).toEqual([vid(41)])
  })
})

describe('Failure types leave data unchanged (Req 19.5)', () => {
  const start = createFreshStores().clock.now()
  const a = chan(1)
  const b = chan(2)
  const lastA = start - 3 * DAY_MS
  const base: CheckScenario = {
    sources: [sourceRow(a, lastA), sourceRow(b, null)],
    feeds: {
      [a]: { entries: [feedEntry(vid(1), a, start - HOUR_MS)] },
      [b]: { entries: [feedEntry(vid(2), b, start - 2 * HOUR_MS)] },
    },
    catalog: [passingDetails(vid(1), a), passingDetails(vid(2), b)],
    judge: keepAll(3),
    items: [fakeFreshItem(vid(0), { channelId: a, foundMs: start - 2 * DAY_MS })],
    state: { lastSuccessMs: start - 2 * DAY_MS, lastAttemptMs: start - 2 * DAY_MS },
  }

  const cases: { name: string; type: string; scenario: CheckScenario; before?: (h: CheckHarness) => Promise<void> }[] = [
    { name: 'a failed details call', type: 'details_failed', scenario: { ...base, detailsFail: { call: 0, kind: 'upstream' } } },
    { name: 'a quota-exceeded details response', type: 'details_failed', scenario: { ...base, detailsFail: { call: 0, kind: 'quota_exceeded' } } },
    { name: 'a Quota_Gate refusal', type: 'quota_refused', scenario: { ...base, quotaRefuseAt: 0 } },
    { name: 'an invalid Judge response', type: 'model_failed', scenario: { ...base, judge: [{ raw: { verdicts: [{ video_id: vid(1), why: '' }] } }] } },
    { name: 'a Judge timeout at 30 s', type: 'model_failed', scenario: { ...base, judge: [{ hang: true }] } },
    { name: 'no Default_Config', type: 'model_failed', scenario: { ...base, noConfig: true } },
    {
      name: 'all feeds failed',
      type: 'feeds_failed',
      scenario: { ...base, feeds: { [a]: { status: 503 }, [b]: { hang: true } } },
    },
    {
      name: 'a store error',
      type: 'store_failed',
      scenario: base,
      before: async (h) => h.stores.fresh.failNext('storeCheck'),
    },
    {
      name: 'a Lease taken by another run',
      type: 'lease_lost',
      scenario: base,
      before: async (h) => {
        // Another instance holds the Lease now (taken over the shared lease table).
        h.stores.pipeline.sharedState().leases.set(freshLeaseKey(CHECK_KEY), { runId: 'run-B', takenAt: h.stores.clock.now() })
      },
    },
  ]

  for (const c of cases) {
    it(`${c.name}: ${c.type}, items and check times unchanged, Lease released, key due`, async () => {
      const h = await createCheckHarness(c.scenario)
      const { fresh, pipeline, clock } = h.stores
      await c.before?.(h)
      const itemsBefore = fresh.storedItems()
      const sourcesBefore = await fresh.sources(CHECK_KEY)
      const leaseB = c.type === 'lease_lost' ? fresh.leaseOf(CHECK_KEY) : null

      // A hanging call ends at its own timeout on the fake clock (10 s feed, 30 s Judge).
      const running = h.run()
      for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0))
      if (c.name.includes('timeout') || c.type === 'feeds_failed') clock.advance(30 * SECOND_MS)
      const outcome = await running

      expect(outcome).toEqual({ kind: 'failed', type: c.type })
      expect(h.logs).toEqual([{ checkKey: checkKeyId(CHECK_KEY), type: c.type }])
      expect(fresh.storedItems()).toEqual(itemsBefore)
      expect(await fresh.sources(CHECK_KEY)).toEqual(sourcesBefore)
      const state = fresh.checkStateOf(CHECK_KEY)
      expect(state.lastSuccessMs).toBe(start - 2 * DAY_MS)
      expect(state.lastAttemptMs).toBe(h.startedMs)
      expect(isDue({ key: CHECK_KEY, ...state }, clock.now())).toBe(true)
      // Our Lease is released; another run's Lease is left alone.
      expect(fresh.leaseOf(CHECK_KEY)).toEqual(leaseB)
      if (c.name.includes('quota-exceeded')) expect(pipeline.quotaUsed()).toBe(DEFAULT_DAILY_QUOTA)
      if (c.type === 'quota_refused') expect(detailsIds(h)).toEqual([])
      if (c.type === 'model_failed' && !c.scenario.noConfig) expect(judgedIds(h)).toHaveLength(1)
    })
  }

  it('one failed feed among good ones keeps only that source\'s last check time', async () => {
    const h = await createCheckHarness({ ...base, feeds: { [a]: { fail: 'connect' }, [b]: base.feeds?.[b] ?? { entries: [] } } })
    expect(await h.run()).toEqual({ kind: 'stored', items: 1 })
    const rows = new Map((await h.stores.fresh.sources(CHECK_KEY)).map((r) => [r.channelId, r.lastCheckedMs]))
    expect(rows.get(a)).toBe(lastA)
    expect(rows.get(b)).toBe(h.startedMs)
    expect(h.stores.fresh.storedItems(CHECK_KEY).map((i) => i.videoId)).toEqual([vid(0), vid(2)])
  })
})

describe('Duplicates and cleanup (Req 19.7)', () => {
  it('a video id found in two feeds is stored once, from the lowest channel id', async () => {
    const start = createFreshStores().clock.now()
    const h = await createCheckHarness({
      sources: [sourceRow(chan(2)), sourceRow(chan(1))],
      feeds: {
        [chan(1)]: { entries: [feedEntry(vid(0), chan(1), start - 2 * HOUR_MS)] },
        [chan(2)]: { entries: [feedEntry(vid(0), chan(2), start - HOUR_MS)] },
      },
      catalog: [passingDetails(vid(0), null)],
      judge: keepAll(1),
    })
    expect(await h.run()).toEqual({ kind: 'stored', items: 1 })
    expect(detailsIds(h)).toEqual([vid(0)])
    const items = h.stores.fresh.storedItems(CHECK_KEY)
    expect(items.map((i) => [i.videoId, i.channelId, i.publishedMs])).toEqual([[vid(0), chan(1), start - 2 * HOUR_MS]])
  })

  it('a video id stored by an earlier transaction keeps its first Fresh_Item and found time', async () => {
    const { clock, fresh } = createFreshStores()
    const first = fakeFreshItem(vid(0), { foundMs: clock.now() - DAY_MS, why: 'First why.' })
    fresh.putItem(first)
    const started = await fresh.takeLease(CHECK_KEY, 'run-1')
    const { hobby: _h, language: _l, foundMs: _f, ...insert } = fakeFreshItem(vid(0), { why: 'Second why.' })
    expect(await fresh.storeCheck({
      key: CHECK_KEY,
      runId: 'run-1',
      startedMs: started ?? 0,
      deadlineMs: clock.now() + CALL_DEADLINE_MS,
      items: [insert, { ...insert, videoId: vid(1) }],
      checkedChannelIds: [],
    })).toBe('stored')
    const items = fresh.storedItems(CHECK_KEY)
    expect(items[0]).toEqual(first)
    expect(items.map((i) => i.videoId)).toEqual([vid(0), vid(1)])
  })

  it('cleanup deletes an item found exactly 2592000 s ago and keeps one found 2591999 s ago', async () => {
    const { clock, fresh } = createFreshStores()
    expect(FRESH_RETENTION_S).toBe(2_592_000)
    fresh.putItem(fakeFreshItem(vid(0), { foundMs: clock.now() - 2_592_000 * SECOND_MS }))
    fresh.putItem(fakeFreshItem(vid(1), { foundMs: clock.now() - 2_591_999 * SECOND_MS }))
    expect(await fresh.cleanup()).toBe(1)
    expect(fresh.storedItems().map((i) => i.videoId)).toEqual([vid(1)])
  })
})
