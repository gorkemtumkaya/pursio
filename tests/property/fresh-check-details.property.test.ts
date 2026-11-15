import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import { FAKE_CLOCK_START_MS, freshVerdict } from '../support/fresh-fakes'
import {
  CHECK_KEY,
  SECOND_MS,
  chan,
  createCheckHarness,
  feedEntry,
  passingDetails,
  sourceRow,
  vid,
  type CheckEvent,
} from '../support/fresh-check-harness'

const START = FAKE_CLOCK_START_MS
const SOURCES = 15
const MAX_IDS = 225

/** Per new video: published offset (s before the start, with ties), missing from details, details channel id null. */
const arbVideo = fc.record({
  agoS: fc.integer({ min: 0, max: 400 }),
  missing: fc.integer({ min: 0, max: 5 }).map((x) => x === 0),
  nullChannel: fc.boolean(),
})

/** 0 to 225 new videos, with the batch bounds weighted in. */
const arbVideos = fc
  .oneof(fc.constantFrom(0, 1, 49, 50, 51, 100, 101, 150, 151, MAX_IDS), fc.integer({ min: 0, max: MAX_IDS }))
  .chain((n) => fc.array(arbVideo, { minLength: n, maxLength: n }))

function newestFirst(a: FeedEntry, b: FeedEntry): number {
  return b.publishedMs - a.publishedMs || compareCodePoints(a.videoId, b.videoId)
}

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

describe('runFreshCheck details stage', () => {
  // Feature: fresh, Property 17: Details batching
  // **Validates: Requirements 5.1, 5.6, 5.7**
  it('reserves ceil(n / 50) units first, calls getDetails in merged order and fills channel ids', async () => {
    await fc.assert(
      fc.asyncProperty(arbVideos, async (videos) => {
        // Video k is in the feed of source k % 15, so each feed has at most 15 entries.
        const entries = videos.map((v, k) => feedEntry(vid(k), chan(k % SOURCES), START - v.agoS * SECOND_MS))
        const feeds = Object.fromEntries(
          Array.from({ length: SOURCES }, (_, i) => [chan(i), { entries: entries.filter((_e, k) => k % SOURCES === i) }]),
        )
        const catalog = videos.flatMap((v, k) =>
          v.missing ? [] : [passingDetails(vid(k), v.nullChannel ? null : chan(100 + k))],
        )
        const h = await createCheckHarness({
          sources: Array.from({ length: SOURCES }, (_, i) => sourceRow(chan(i))),
          feeds,
          catalog,
          judge: [{ verdicts: videos.map((_v, k) => freshVerdict(vid(k), 'footwork')) }],
        })
        const usedBefore = h.stores.pipeline.quotaUsed()

        const outcome = await h.run()

        const merged = [...entries].sort(newestFirst)
        const batches = chunks(merged.map((e) => e.videoId), 50)
        const reserves = h.events.filter((e): e is Extract<CheckEvent, { kind: 'reserve' }> => e.kind === 'reserve')
        const calls = h.events.filter((e): e is Extract<CheckEvent, { kind: 'details' }> => e.kind === 'details')

        // ceil(n / 50) units, all reserved (and granted) before the first details call.
        expect(reserves).toHaveLength(batches.length)
        expect(reserves.every((r) => r.granted)).toBe(true)
        expect(h.stores.pipeline.quotaUsed() - usedBefore).toBe(batches.length)
        const firstCall = h.events.findIndex((e) => e.kind === 'details')
        const lastReserve = h.events.map((e) => e.kind).lastIndexOf('reserve')
        if (calls.length > 0) expect(lastReserve).toBeLessThan(firstCall)

        // ceil(n / 50) calls of 1 to 50 ids, together the merged order (0 calls for n = 0).
        expect(calls.map((c) => c.ids)).toEqual(batches)
        for (const c of calls) {
          expect(c.ids.length).toBeGreaterThanOrEqual(1)
          expect(c.ids.length).toBeLessThanOrEqual(50)
        }

        // Missing ids are dropped; the rest go on, newest 40 to the Judge (Req 5.6, 6.1).
        const present = merged.filter((e) => !videos[Number(e.videoId.slice(1))]?.missing)
        const judged = h.events.filter((e): e is Extract<CheckEvent, { kind: 'judge' }> => e.kind === 'judge')
        if (present.length === 0) {
          expect(judged).toEqual([])
          expect(outcome).toEqual({ kind: 'stored', items: 0 })
          return
        }
        const sent = present.slice(0, 40)
        expect(judged).toEqual([{ kind: 'judge', ids: sent.map((e) => e.videoId) }])
        expect(outcome).toEqual({ kind: 'stored', items: sent.length })

        // Details channel id, or the Feed_Entry channel id when the details have none (Req 5.7).
        const stored = new Map(h.stores.fresh.storedItems(CHECK_KEY).map((i) => [i.videoId, i]))
        expect([...stored.keys()].sort()).toEqual(sent.map((e) => e.videoId).sort())
        for (const e of sent) {
          const k = Number(e.videoId.slice(1))
          expect(stored.get(e.videoId)?.channelId).toBe(videos[k]?.nullChannel ? e.channelId : chan(100 + k))
        }
      }),
      { numRuns: 100 },
    )
  })
})
