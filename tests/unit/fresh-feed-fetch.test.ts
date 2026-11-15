// Channel_Feed fetch and mapLimit (spec: fresh, task 5.5, Req 4.1, 4.4, 18.3, 19.16).
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import {
  FEED_CONCURRENCY,
  FEED_MAX_BYTES,
  FEED_TIMEOUT_MS,
  channelFeedUrl,
  fetchChannelFeed,
  mapLimit,
} from '../../server/utils/fresh/feed-fetch'
import { parseChannelFeed } from '../../server/utils/fresh/feed-parser'
import { createFakeClock, createFakeFeedFetcher } from '../support/fresh-fakes'

const CHANNEL = 'UCabc_DEF-123'
const entry: FeedEntry = { videoId: 'abcdefghijk', title: 'Tom & "Jerry"', channelId: CHANNEL, publishedMs: Date.UTC(2026, 10, 7) }
const open = (): AbortSignal => new AbortController().signal

describe('fetchChannelFeed', () => {
  it('GETs the fixed feed URL with no key and returns the body', async () => {
    const feeds = createFakeFeedFetcher({ feeds: { [CHANNEL]: { entries: [entry] } } })
    const result = await fetchChannelFeed(CHANNEL, { fetcher: feeds.fetch, signal: open() })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(parseChannelFeed(result.xml)).toEqual([entry])
    expect(feeds.calls).toHaveLength(1)
    expect(feeds.calls[0]).toMatchObject({ url: `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`, channelId: CHANNEL, method: 'GET' })
    expect(feeds.keySeen).toBe(false)
    expect(feeds.unexpectedUrls).toEqual([])
    expect(feeds.inFlight).toBe(0)
  })

  it('URL-encodes the channel id so it cannot add a parameter or change the path', async () => {
    const id = 'x&key=1/../#a'
    expect(channelFeedUrl(id)).toBe('https://www.youtube.com/feeds/videos.xml?channel_id=x%26key%3D1%2F..%2F%23a')
    const feeds = createFakeFeedFetcher()
    await fetchChannelFeed(id, { fetcher: feeds.fetch, signal: open() })
    expect(feeds.calls[0]?.channelId).toBe(id)
    expect(feeds.keySeen).toBe(false)
  })

  it('rejects an invalid channel id without a request', async () => {
    const feeds = createFakeFeedFetcher()
    expect(await fetchChannelFeed('', { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
    expect(await fetchChannelFeed('a'.repeat(65), { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
    expect(feeds.calls).toHaveLength(0)
  })

  it('fails on a connection error and on non-2xx statuses', async () => {
    const feeds = createFakeFeedFetcher({ feeds: { a: { fail: 'connect' }, b: { status: 404 }, c: { status: 500, body: 'oops' } } })
    for (const id of ['a', 'b', 'c']) expect(await fetchChannelFeed(id, { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
    expect(feeds.inFlight).toBe(0)
  })

  it('fails on a declared or streamed body over 1 MB and stops reading', async () => {
    const feeds = createFakeFeedFetcher({ feeds: { a: { oversize: 'declared' }, b: { oversize: 'streamed' } } })
    expect(await fetchChannelFeed('a', { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
    expect(feeds.bytesServed).toBe(0)
    expect(await fetchChannelFeed('b', { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
    expect(feeds.bytesServed).toBeGreaterThan(FEED_MAX_BYTES)
    expect(feeds.bytesServed).toBeLessThan(FEED_MAX_BYTES + 64 * 1024)
    expect(feeds.cancelledBodies).toBe(2)
    expect(feeds.inFlight).toBe(0)
  })

  it('accepts a body of exactly 1 MB, and a lying small content-length still hits the stream cap', async () => {
    const exact = ' '.repeat(FEED_MAX_BYTES)
    const feeds = createFakeFeedFetcher({ feeds: { a: { body: exact }, b: { body: `${exact} `, contentLength: 10 } } })
    expect(await fetchChannelFeed('a', { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: true, xml: exact })
    expect(await fetchChannelFeed('b', { fetcher: feeds.fetch, signal: open() })).toEqual({ ok: false })
  })

  it('times out after 10 s on the timer, for a hung request and a stalled body', async () => {
    for (const script of [{ hang: true as const }, { stall: true as const }]) {
      const clock = createFakeClock()
      const feeds = createFakeFeedFetcher({ feeds: { a: script } })
      const pending = fetchChannelFeed('a', { fetcher: feeds.fetch, signal: open(), timer: clock.timer })
      await new Promise((resolve) => setTimeout(resolve, 5))
      clock.advance(FEED_TIMEOUT_MS - 1)
      clock.advance(1)
      expect(await pending).toEqual({ ok: false })
      expect(feeds.inFlight).toBe(0)
    }
  })

  it('ends at the deadline signal before the 10 s timeout', async () => {
    const clock = createFakeClock()
    const deadline = clock.timer(2_000)
    const feeds = createFakeFeedFetcher({ clock, feeds: { a: { entries: [entry], advanceMs: 2_000 } } })
    expect(await fetchChannelFeed('a', { fetcher: feeds.fetch, signal: deadline, timer: clock.timer })).toEqual({ ok: false })
    expect(deadline.aborted).toBe(true)
    expect(await fetchChannelFeed('a', { fetcher: feeds.fetch, signal: deadline })).toEqual({ ok: false })
    expect(feeds.calls).toHaveLength(1)
  })
})

describe('mapLimit', () => {
  it('keeps input order and at most `limit` in progress', async () => {
    let active = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)
    const out = await mapLimit(items, 3, async (i) => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, (i * 7) % 5))
      active -= 1
      return i * 2
    })
    expect(out).toEqual(items.map((i) => i * 2))
    expect(peak).toBe(3)
    expect(await mapLimit([], 8, async (i: number) => i)).toEqual([])
    expect(await mapLimit([1, 2], 0, async (i) => i)).toEqual([1, 2])
  })

  it('15 feeds through the fake fetcher never exceed 8 in flight', async () => {
    const ids = Array.from({ length: 15 }, (_, i) => `UC${i}`)
    const feeds = createFakeFeedFetcher({ defaultFeed: { entries: [], delayMs: 3 } })
    const results = await mapLimit(ids, FEED_CONCURRENCY, (id) => fetchChannelFeed(id, { fetcher: feeds.fetch, signal: open() }))
    expect(results.every((r) => r.ok)).toBe(true)
    expect(feeds.calls.map((c) => c.channelId)).toEqual(ids)
    expect(feeds.peakInFlight).toBe(FEED_CONCURRENCY)
    expect(feeds.inFlight).toBe(0)
  })
})

describe('fake feed fetcher', () => {
  it('flags keys and refuses other hosts', async () => {
    const feeds = createFakeFeedFetcher()
    await feeds.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=a&key=x')
    expect(feeds.keySeen).toBe(true)
    const other = createFakeFeedFetcher()
    await other.fetch('https://www.youtube.com/feeds/videos.xml?channel_id=a', { headers: { 'x-goog-api-key': 'k' } })
    expect(other.keySeen).toBe(true)
    await expect(other.fetch('https://www.googleapis.com/youtube/v3/search')).rejects.toThrow(TypeError)
    expect(other.unexpectedUrls).toEqual(['https://www.googleapis.com/youtube/v3/search'])
  })
})
