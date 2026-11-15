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
const SOURCES = 6

/** One new video: published offset with many ties, and whether the filter drops it. */
const arbVideo = fc.record({
  agoS: fc.oneof(fc.integer({ min: 0, max: 4 }), fc.integer({ min: 0, max: 100_000 })),
  dropped: fc.integer({ min: 0, max: 4 }).map((x) => x === 0),
})

/** 0 to 60 filtered videos plus up to 20 the filter drops (at most 15 per feed). */
const arbVideos = fc
  .oneof(fc.constantFrom(0, 1, 39, 40, 41, 60), fc.integer({ min: 0, max: 60 }))
  .chain((filtered) =>
    fc.array(arbVideo, { minLength: filtered, maxLength: filtered + 20 }).filter(
      (videos) => videos.filter((v) => !v.dropped).length <= 60,
    ),
  )

function newestFirst(a: FeedEntry, b: FeedEntry): number {
  return b.publishedMs - a.publishedMs || compareCodePoints(a.videoId, b.videoId)
}

describe('runFreshCheck Judge selection', () => {
  // Feature: fresh, Property 18: Judge selection
  // **Validates: Requirements 6.1, 6.12**
  it('sends the newest 40 filtered videos in one call and stores no other video', async () => {
    await fc.assert(
      fc.asyncProperty(arbVideos, async (videos) => {
        const entries = videos.map((v, k) => feedEntry(vid(k), chan(k % SOURCES), START - v.agoS * SECOND_MS))
        const feeds = Object.fromEntries(
          Array.from({ length: SOURCES }, (_, i) => [chan(i), { entries: entries.filter((_e, k) => k % SOURCES === i) }]),
        )
        const catalog = videos.map((v, k) =>
          passingDetails(vid(k), chan(k % SOURCES), v.dropped ? { durationSeconds: 1501 } : {}),
        )
        const h = await createCheckHarness({
          sources: Array.from({ length: SOURCES }, (_, i) => sourceRow(chan(i))),
          feeds,
          catalog,
          // A kept verdict for every video, sent or not: only sent ones may be stored (Req 6.10, 6.12).
          judge: [{ verdicts: videos.map((_v, k) => freshVerdict(vid(k), 'footwork')) }],
        })

        const outcome = await h.run()

        const filtered = entries.filter((_e, k) => !videos[k]?.dropped).sort(newestFirst)
        const sent = filtered.slice(0, 40).map((e) => e.videoId)
        const judged = h.events.filter((e): e is Extract<CheckEvent, { kind: 'judge' }> => e.kind === 'judge')
        if (filtered.length === 0) {
          expect(judged).toEqual([])
        } else {
          expect(judged).toEqual([{ kind: 'judge', ids: sent }])
        }
        expect(outcome).toEqual({ kind: 'stored', items: sent.length })
        expect(h.stores.fresh.storedItems(CHECK_KEY).map((i) => i.videoId)).toEqual([...sent].sort(compareCodePoints))
      }),
      { numRuns: 150 },
    )
  })
})
