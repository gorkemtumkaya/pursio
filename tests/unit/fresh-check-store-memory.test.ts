// In-memory FreshStore mirrors the SQL of 20261112000000_fresh_tables.sql (spec: fresh, task 9.1).
import { describe, expect, it } from 'vitest'
import type { PoolVideo } from '../../shared/types/video'
import { freshLeaseKey } from '../../shared/utils/fresh-keys'
import { poolKey } from '../../shared/utils/video-normalize'
import type { FreshItemInsert } from '../../server/utils/fresh/check-store'
import { createFreshStores, fakeFreshItem } from '../support/fresh-fakes'

const KEY = { hobby: 'bouldering', language: 'en' }
const DAY_MS = 86_400_000

function poolVideo(id: string, channelId: string | null, teaches = 0.9): PoolVideo {
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

function insert(videoId: string, overrides: Partial<FreshItemInsert> = {}): FreshItemInsert {
  const { hobby: _h, language: _l, foundMs: _f, ...rest } = fakeFreshItem(videoId)
  return { ...rest, ...overrides }
}

async function storePool(stores: ReturnType<typeof createFreshStores>, skill: string, videos: PoolVideo[]): Promise<string> {
  const key = poolKey({ hobby: 'bouldering', skillTitle: skill, level: 'beginner', language: 'en' })
  expect(await stores.pipeline.takeLease(key, 'pool-run')).toBe(true)
  expect(await stores.pipeline.storePool(key, 'pool-run', videos)).toBe(true)
  return key
}

describe('InMemoryFreshStore lease and check state', () => {
  it('uses the shared lease table, records Last_Attempt_Time and expires after 300 s', async () => {
    const { clock, pipeline, fresh } = createFreshStores()
    const start = clock.now()
    expect(await fresh.takeLease(KEY, 'a')).toBe(start)
    expect(pipeline.sharedState().leases.get(freshLeaseKey(KEY))?.runId).toBe('a')
    clock.advance(299_999)
    expect(await fresh.takeLease(KEY, 'b')).toBeNull()
    expect(fresh.checkStateOf(KEY).lastAttemptMs).toBe(start)
    clock.advance(1)
    expect(await fresh.takeLease(KEY, 'b')).toBe(start + 300_000)
    await fresh.releaseLease(KEY, 'a')
    expect(fresh.leaseOf(KEY)?.runId).toBe('b')
    const { states } = await fresh.checkStates([KEY, { hobby: 'chess', language: 'en' }])
    expect(states.map((s) => s.lastAttemptMs)).toEqual([start + 300_000, null])
  })
})

describe('InMemoryFreshStore.storeCheck', () => {
  it('stores items with on conflict do nothing, sets check times and deletes the Lease', async () => {
    const { clock, fresh } = createFreshStores()
    fresh.setSources(KEY, [
      { channelId: 'UCa', channelName: 'A', qualifyingCount: 2, latestQualifyingMs: 1, lastCheckedMs: null },
      { channelId: 'UCb', channelName: 'B', qualifyingCount: 1, latestQualifyingMs: 1, lastCheckedMs: 5 },
    ])
    fresh.putItem(fakeFreshItem('aaaaaaaaaaa', { why: 'Old why.', foundMs: clock.now() - DAY_MS }))
    const started = (await fresh.takeLease(KEY, 'run')) as number
    clock.advance(1000)
    const outcome = await fresh.storeCheck({
      key: KEY,
      runId: 'run',
      startedMs: started,
      deadlineMs: clock.now() + 10_000,
      items: [insert('aaaaaaaaaaa', { why: 'New why.' }), insert('bbbbbbbbbbb'), insert('bbbbbbbbbbb', { why: 'Dup.' })],
      checkedChannelIds: ['UCa'],
    })
    expect(outcome).toBe('stored')
    const items = fresh.storedItems(KEY)
    expect(items.map((i) => [i.videoId, i.why])).toEqual([
      ['aaaaaaaaaaa', 'Old why.'],
      ['bbbbbbbbbbb', 'Clear first steps for this skill.'],
    ])
    expect(items[1]?.foundMs).toBe(clock.now())
    expect((await fresh.sources(KEY)).map((s) => s.lastCheckedMs)).toEqual([started, 5])
    expect(fresh.checkStateOf(KEY)).toEqual({ lastSuccessMs: clock.now(), lastAttemptMs: started })
    expect(fresh.leaseOf(KEY)).toBeNull()
  })

  it('gives lease_lost for another run or a 300 s old Lease, and writes nothing', async () => {
    const { clock, fresh } = createFreshStores()
    const started = (await fresh.takeLease(KEY, 'run')) as number
    const input = { key: KEY, startedMs: started, deadlineMs: started + 999_999, items: [insert('ccccccccccc')], checkedChannelIds: [] }
    expect(await fresh.storeCheck({ ...input, runId: 'other' })).toBe('lease_lost')
    clock.advance(300_000)
    expect(await fresh.storeCheck({ ...input, runId: 'run' })).toBe('lease_lost')
    expect(fresh.storedItems()).toEqual([])
    expect(fresh.checkStateOf(KEY).lastSuccessMs).toBeNull()
  })

  it('gives deadline_exceeded before or during the writes, and writes nothing', async () => {
    const { clock, fresh } = createFreshStores()
    const started = (await fresh.takeLease(KEY, 'run')) as number
    const input = { key: KEY, runId: 'run', startedMs: started, deadlineMs: started + 1000, items: [insert('ddddddddddd')], checkedChannelIds: [] }
    fresh.duringStore = () => clock.advance(1001)
    expect(await fresh.storeCheck(input)).toBe('deadline_exceeded')
    fresh.duringStore = null
    expect(await fresh.storeCheck(input)).toBe('deadline_exceeded')
    expect(fresh.storedItems()).toEqual([])
    expect(fresh.leaseOf(KEY)?.runId).toBe('run')
  })

  it('throws for an item that breaks a check constraint, writing nothing', async () => {
    const { fresh } = createFreshStores()
    const started = (await fresh.takeLease(KEY, 'run')) as number
    await expect(fresh.storeCheck({
      key: KEY, runId: 'run', startedMs: started, deadlineMs: started + 1000,
      items: [insert('eeeeeeeeeee'), insert('short')], checkedChannelIds: [],
    })).rejects.toThrow()
    expect(fresh.storedItems()).toEqual([])
  })
})

describe('InMemoryFreshStore cleanup and readPage', () => {
  it('deletes items found exactly 30 days ago and keeps 1 ms younger ones', async () => {
    const { clock, fresh } = createFreshStores()
    fresh.putItem(fakeFreshItem('fffffffffff', { foundMs: clock.now() - 2_592_000_000 }))
    fresh.putItem(fakeFreshItem('ggggggggggg', { foundMs: clock.now() - 2_591_999_999 }))
    expect(await fresh.cleanup()).toBe(1)
    expect(fresh.storedItems().map((i) => i.videoId)).toEqual(['ggggggggggg'])
  })

  it('filters by 7-day published and 30-day found time and rejects too many keys', async () => {
    const { clock, fresh } = createFreshStores()
    const now = clock.now()
    fresh.putItem(fakeFreshItem('hhhhhhhhhhh', { publishedMs: now - 7 * DAY_MS }))
    fresh.putItem(fakeFreshItem('iiiiiiiiiii', { publishedMs: now - 7 * DAY_MS + 1 }))
    fresh.putItem(fakeFreshItem('jjjjjjjjjjj', { foundMs: now - 30 * DAY_MS }))
    fresh.setCheckState(KEY, { lastSuccessMs: now - 5, lastAttemptMs: now - 10 })
    const page = await fresh.readPage({ checkKeys: [KEY, KEY], poolKeys: [] })
    expect(page.items.map((i) => i.videoId)).toEqual(['iiiiiiiiiii'])
    expect(page.checkTimes).toEqual([{ ...KEY, lastSuccessMs: now - 5 }])
    const many = Array.from({ length: 21 }, (_, i) => ({ hobby: `h${i}`, language: 'en' }))
    await expect(fresh.readPage({ checkKeys: many, poolKeys: [] })).rejects.toThrow('bad_arguments')
    await expect(fresh.readPage({ checkKeys: [], poolKeys: Array.from({ length: 61 }, (_, i) => `k${i}`) })).rejects.toThrow('bad_arguments')
  })
})

describe('Channel_Source upkeep on pool stores', () => {
  it('refreshes sources from the shared pools and returns them without counts on the page', async () => {
    const stores = createFreshStores()
    const key = await storePool(stores, 'Footwork', [poolVideo('v1', 'UCa'), poolVideo('v2', 'UCb', 0.69), poolVideo('v3', null)])
    expect((await stores.fresh.sources(KEY)).map((s) => [s.channelId, s.qualifyingCount])).toEqual([['UCa', 1]])
    expect(await stores.fresh.skillTitles('bouldering')).toEqual(['footwork'])
    const page = await stores.fresh.readPage({ checkKeys: [KEY], poolKeys: [key] })
    expect(page.sources).toEqual([{ ...KEY, channelId: 'UCa', channelName: 'Name UCa' }])
    expect(page.pools.map((p) => p.poolKey)).toEqual([key])
  })

  it('a failed pool store adds no Channel_Source and keeps the old pool', async () => {
    const stores = createFreshStores()
    const key = poolKey({ hobby: 'bouldering', skillTitle: 'Footwork', level: 'beginner', language: 'en' })
    await stores.pipeline.takeLease(key, 'run')
    stores.fresh.failSourcesRefresh()
    await expect(stores.pipeline.storePool(key, 'run', [poolVideo('v1', 'UCa')])).rejects.toThrow()
    expect(await stores.fresh.sources(KEY)).toEqual([])
    expect(stores.pipeline.sharedState().pools.has(key)).toBe(false)
    expect(stores.pipeline.sharedState().leases.get(key)?.runId).toBe('run')
  })
})
