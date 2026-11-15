// Postgres FreshStore over a fake rpc client, no network (spec: fresh, task 9.2).
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { PostgresFreshStore, type FreshRpcClient } from '../../server/utils/fresh/check-store-pg'
import type { StoreCheckInput } from '../../server/utils/fresh/check-store'

// The real service-role client fits the store's client type.
const _clientFits: (c: SupabaseClient) => FreshRpcClient = (c) => c
void _clientFits

const KEY = { hobby: 'bouldering', language: 'en' }
const RUN = '00000000-0000-4000-8000-000000000001'

interface Call {
  fn: string
  args: Record<string, unknown> | undefined
}
type Reply = { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>

function fakeClient(reply: (call: Call) => Reply): { client: FreshRpcClient; calls: Call[] } {
  const calls: Call[] = []
  return {
    calls,
    client: {
      rpc(fn, args) {
        const call = { fn, args }
        calls.push(call)
        return Promise.resolve(reply(call))
      },
    },
  }
}

const ok = (data: unknown) => ({ data, error: null })

function storeInput(overrides: Partial<StoreCheckInput> = {}): StoreCheckInput {
  return {
    key: KEY,
    runId: RUN,
    startedMs: 1_000,
    deadlineMs: 118_000,
    items: [
      {
        videoId: 'abcdefghijk',
        skillNorm: 'footwork',
        level: 'beginner',
        channelId: 'UC1',
        why: 'Shows quiet feet.',
        publishedMs: 500,
        video: {
          title: 'T',
          channel: 'C',
          thumbnailUrl: 'https://i.ytimg.com/x.jpg',
          durationSeconds: 300,
          style: 'technique',
          teachesThisSkill: 0.9,
          levelFit: 0.8,
        },
      },
    ],
    checkedChannelIds: ['UC1'],
    ...overrides,
  }
}

describe('PostgresFreshStore', () => {
  it('takes the Lease with the key parts and run id and returns the db start time', async () => {
    const { client, calls } = fakeClient(() => ok('1700000000000'))
    expect(await new PostgresFreshStore(client).takeLease(KEY, RUN)).toBe(1_700_000_000_000)
    expect(calls).toEqual([{ fn: 'fresh_lease_take', args: { p_hobby: 'bouldering', p_language: 'en', p_run: RUN } }])
  })

  it('returns null when the Lease is held', async () => {
    const { client } = fakeClient(() => ok(null))
    expect(await new PostgresFreshStore(client).takeLease(KEY, RUN)).toBeNull()
  })

  it('releases the Lease through video_lease_release with the fresh lease key', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    await new PostgresFreshStore(client).releaseLease(KEY, RUN)
    expect(calls).toEqual([{ fn: 'video_lease_release', args: { p_key: 'fresh:["bouldering","en"]', p_run: RUN } }])
  })

  it('maps check states in request order and rejects a mismatched result', async () => {
    const keys = [KEY, { hobby: 'bouldering', language: 'de' }]
    const { client } = fakeClient(() =>
      ok({
        nowMs: 9_000,
        states: [
          { hobby: 'bouldering', language: 'en', lastSuccessMs: 1_000, lastAttemptMs: 2_000 },
          { hobby: 'bouldering', language: 'de', lastSuccessMs: null, lastAttemptMs: null },
        ],
      }),
    )
    expect(await new PostgresFreshStore(client).checkStates(keys)).toEqual({
      nowMs: 9_000,
      states: [
        { key: KEY, lastSuccessMs: 1_000, lastAttemptMs: 2_000 },
        { key: keys[1], lastSuccessMs: null, lastAttemptMs: null },
      ],
    })
    await expect(new PostgresFreshStore(client).checkStates([KEY])).rejects.toThrow('fresh_store_failed:check_states')
  })

  it('maps source rows to ChannelSourceRow', async () => {
    const { client } = fakeClient(() =>
      ok([{ channel_id: 'UC1', channel_name: 'One', qualifying_count: 3, latest_qualifying_ms: 50, last_checked_ms: null }]),
    )
    expect(await new PostgresFreshStore(client).sources(KEY)).toEqual([
      { channelId: 'UC1', channelName: 'One', qualifyingCount: 3, latestQualifyingMs: 50, lastCheckedMs: null },
    ])
  })

  it('makes no call for stored ids of an empty list', async () => {
    const { client, calls } = fakeClient(() => ok(['abcdefghijk']))
    const store = new PostgresFreshStore(client)
    expect(await store.storedIds(KEY, [])).toEqual(new Set())
    expect(calls).toHaveLength(0)
    expect(await store.storedIds(KEY, ['abcdefghijk', 'bbbbbbbbbbb'])).toEqual(new Set(['abcdefghijk']))
  })

  it('sends the store arguments and returns the outcome', async () => {
    const { client, calls } = fakeClient(() => ok('stored'))
    const input = storeInput()
    expect(await new PostgresFreshStore(client).storeCheck(input)).toBe('stored')
    expect(calls[0]?.fn).toBe('fresh_check_store')
    expect(calls[0]?.args).toEqual({
      p_hobby: 'bouldering',
      p_language: 'en',
      p_run: RUN,
      p_started_ms: 1_000,
      p_deadline_ms: 118_000,
      p_items: [...input.items],
      p_channels: ['UC1'],
    })
  })

  it('maps lease_lost and a returned deadline_exceeded', async () => {
    for (const outcome of ['lease_lost', 'deadline_exceeded'] as const) {
      const { client } = fakeClient(() => ok(outcome))
      expect(await new PostgresFreshStore(client).storeCheck(storeInput())).toBe(outcome)
    }
  })

  it('maps a raised deadline_exceeded to the same outcome', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'deadline_exceeded', code: 'P0001' } }))
    expect(await new PostgresFreshStore(client).storeCheck(storeInput())).toBe('deadline_exceeded')
  })

  it('throws a fixed label for any other db error, never the db message', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { message: 'new row violates check constraint', code: '23514' } }))
    const store = new PostgresFreshStore(client)
    await expect(store.storeCheck(storeInput())).rejects.toThrow(/^fresh_store_failed:store$/)
    await expect(store.cleanup()).rejects.toThrow(/^fresh_store_failed:cleanup$/)
  })

  it('rejects a malformed result', async () => {
    const { client } = fakeClient(() => ok('maybe'))
    await expect(new PostgresFreshStore(client).storeCheck(storeInput())).rejects.toThrow('fresh_store_failed:store')
  })

  it('returns deadline_exceeded without a call when the deadline already fired', async () => {
    const { client, calls } = fakeClient(() => ok('stored'))
    const deadline = AbortSignal.abort()
    const store = new PostgresFreshStore(client).withDeadline(deadline)
    expect(await store.storeCheck(storeInput())).toBe('deadline_exceeded')
    await expect(store.sources(KEY)).rejects.toThrow('fresh_store_failed:sources:deadline')
    expect(calls).toHaveLength(0)
  })

  it('races a pending call against the deadline signal', async () => {
    const { client } = fakeClient(() => new Promise(() => {}))
    const controller = new AbortController()
    const store = new PostgresFreshStore(client, { deadline: controller.signal })
    const pendingStore = store.storeCheck(storeInput())
    const pendingTitles = store.skillTitles('bouldering')
    controller.abort()
    expect(await pendingStore).toBe('deadline_exceeded')
    await expect(pendingTitles).rejects.toThrow('fresh_store_failed:skill_titles:deadline')
  })

  it('rejects page reads over the key limits without a call', async () => {
    const { client, calls } = fakeClient(() => ok(null))
    const store = new PostgresFreshStore(client)
    const keys = Array.from({ length: 21 }, (_, i) => ({ hobby: `h${i}`, language: 'en' }))
    await expect(store.readPage({ checkKeys: keys, poolKeys: [] })).rejects.toThrow('fresh_store_failed:page_read')
    const pools = Array.from({ length: 61 }, (_, i) => `p${i}`)
    await expect(store.readPage({ checkKeys: [KEY], poolKeys: pools })).rejects.toThrow('fresh_store_failed:page_read')
    expect(calls).toHaveLength(0)
  })

  it('maps a page read and fills missing old pool fields with null', async () => {
    const item = { ...storeInput().items[0], hobby: 'bouldering', language: 'en', foundMs: 700 }
    const oldVideo = {
      id: 'abcdefghijk',
      title: 'T',
      channel: 'C',
      thumbnailUrl: '',
      durationSeconds: 300,
      viewCount: null,
      likeCount: null,
      publishedAt: null,
      defaultAudioLanguage: null,
      hasCaptions: null,
      teachesThisSkill: 0.9,
      levelFit: 0.8,
      style: 'drill',
      matchedQuestText: null,
    }
    const { client } = fakeClient(() =>
      ok({
        nowMs: 9_000,
        items: [item],
        pools: [{ poolKey: 'k', videos: [oldVideo, { id: 1 }], storedAtMs: 800 }],
        sources: [{ hobby: 'bouldering', language: 'en', channelId: 'UC1', channelName: 'One' }],
        checkTimes: [{ hobby: 'bouldering', language: 'en', lastSuccessMs: 600 }],
      }),
    )
    const read = await new PostgresFreshStore(client).readPage({ checkKeys: [KEY], poolKeys: ['k'] })
    expect(read).toEqual({
      nowMs: 9_000,
      items: [item],
      pools: [{ poolKey: 'k', videos: [{ ...oldVideo, channelId: null }], storedAt: 800 }],
      sources: [{ hobby: 'bouldering', language: 'en', channelId: 'UC1', channelName: 'One' }],
      checkTimes: [{ hobby: 'bouldering', language: 'en', lastSuccessMs: 600 }],
    })
  })
})
