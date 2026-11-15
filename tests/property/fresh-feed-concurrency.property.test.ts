import { readFileSync } from 'node:fs'
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { FEED_CONCURRENCY, fetchChannelFeed, mapLimit } from '../../server/utils/fresh/feed-fetch'
import { createFakeClock, createFakeFeedFetcher, type FeedScript } from '../support/fresh-fakes'
import { setSentinelApiKey } from '../support/video-fakes'

const RUNS = { numRuns: 100 }
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const arbIdChar = fc.constantFrom(...ID_CHARS.split(''))
/** A YouTube-like channel id: "UC" and 22 id characters. */
const arbChannelId = fc.string({ unit: arbIdChar, minLength: 22, maxLength: 22 }).map(s => `UC${s}`)
const arbVideoId = fc.string({ unit: arbIdChar, minLength: 11, maxLength: 11 })

type Outcome = 'entries' | 'malformed' | 'status' | 'connect' | 'oversize'
const arbOutcome = fc.constantFrom<Outcome>('entries', 'entries', 'malformed', 'status', 'connect', 'oversize')

/** One Channel_Source with its random fetch delay (small, real ms) and outcome. */
const arbSource = fc.record({
  channelId: arbChannelId,
  delayMs: fc.integer({ min: 0, max: 4 }),
  outcome: arbOutcome,
  status: fc.constantFrom(404, 429, 500, 503),
  videoIds: fc.array(arbVideoId, { maxLength: 3 }),
})
type Source = typeof arbSource extends fc.Arbitrary<infer T> ? T : never

/** 0 to 15 Channel_Sources with distinct channel ids. */
const arbSources = fc.uniqueArray(arbSource, { maxLength: 15, selector: s => s.channelId })

function scriptFor(source: Source): FeedScript {
  const delayMs = source.delayMs
  switch (source.outcome) {
    case 'entries': {
      const entries: FeedEntry[] = source.videoIds.map((videoId, i) => ({
        videoId,
        title: `Video ${i}`,
        channelId: source.channelId,
        publishedMs: Date.UTC(2026, 10, 1, 12, 0, i),
      }))
      return { entries, delayMs }
    }
    case 'malformed':
      return { body: '<not-a-feed', delayMs }
    case 'status':
      return { status: source.status, delayMs }
    case 'connect':
      return { fail: 'connect', delayMs }
    case 'oversize':
      return { oversize: 'declared', delayMs }
  }
}

describe('fresh feed fetch concurrency', () => {
  let restoreKey: () => void
  beforeEach(() => {
    restoreKey = setSentinelApiKey()
  })
  afterEach(() => {
    restoreKey()
  })

  // Feature: fresh, Property 11: Feed fetch concurrency
  // **Validates: Requirements 4.1**
  it('fetches each Channel_Feed once, with at most 8 in progress, no API key and no quota units', async () => {
    expect(FEED_CONCURRENCY).toBe(8)
    await fc.assert(
      fc.asyncProperty(arbSources, async (sources) => {
        const clock = createFakeClock()
        const feeds: Record<string, FeedScript> = {}
        for (const s of sources) feeds[s.channelId] = scriptFor(s)
        const fake = createFakeFeedFetcher({ feeds, clock })
        const signal = new AbortController().signal

        const results = await mapLimit(sources, FEED_CONCURRENCY, s =>
          fetchChannelFeed(s.channelId, { fetcher: fake.fetch, signal, timer: clock.timer }))

        // Each Channel_Feed fetched exactly once, with a GET to the fixed feed URL.
        const fetched = fake.calls.map(c => c.channelId).sort()
        expect(fetched).toEqual(sources.map(s => s.channelId).sort())
        expect(fake.unexpectedUrls).toEqual([])
        for (const call of fake.calls) expect(call.method).toBe('GET')

        // Never more than 8 at once, and in parallel: as many as allowed start together.
        expect(fake.peakInFlight).toBeLessThanOrEqual(FEED_CONCURRENCY)
        expect(fake.peakInFlight).toBe(Math.min(sources.length, FEED_CONCURRENCY))
        expect(fake.inFlight).toBe(0)

        // No API key in any URL, query or header, although the key is set in the environment.
        expect(fake.keySeen).toBe(false)

        // One result per source, in source order; ok only for a 2xx body within the limit.
        expect(results).toHaveLength(sources.length)
        sources.forEach((s, i) => {
          expect(results[i]?.ok).toBe(s.outcome === 'entries' || s.outcome === 'malformed')
        })
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 11: Feed fetch concurrency
  // **Validates: Requirements 4.1**
  it('the feed stage has no quota or key dependency, so it cannot reserve Daily_Quota units', () => {
    const source = readFileSync(new URL('../../server/utils/fresh/feed-fetch.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1])
    for (const path of imports) expect(path).not.toMatch(/quota|pipeline-store|video\//i)
    expect(source).not.toMatch(/reserveQuota|reserveDetails|reserveSearch|saturateQuota|useRuntimeConfig/)
  })
})
