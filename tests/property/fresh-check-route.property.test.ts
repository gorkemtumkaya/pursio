// Feature: fresh, Property 7: Check_Route call bounds
// For any Active_Check_Keys with random check states, held Leases, check durations on a fake
// clock and check failures, a call with the right secret starts checks only for due keys with
// a free Lease, in due order, at most 3, none after 10 s, skips held Leases without counting or
// recording an attempt, goes on after a failure, never stops a started check before the
// Call_Deadline, aborts in-flight feed, details and Judge calls at 117 s with
// `deadline_exceeded`, answers before 120 s, and its body holds no secret, Lease or item.
// Validates: Requirements 3.3, 3.7, 3.8, 3.12, 3.13, 3.14, 3.15
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CheckKey, FeedEntry } from '../../shared/types/fresh'
import type { PoolVideo } from '../../shared/types/video'
import { checkKeyId, compareCodePoints, freshLeaseKey } from '../../shared/utils/fresh-keys'
import { poolKey } from '../../shared/utils/video-normalize'
import type { FreshCheckOutcome } from '../../server/utils/fresh/check'
import { handleCheckRequest, type RunFreshCheck } from '../../server/utils/fresh/handlers'
import { CALL_DEADLINE_MS, CHECK_INTERVAL_S, START_WINDOW_MS, activeCheckKeys } from '../../server/utils/fresh/schedule'
import { ProviderError, type VideoProvider } from '../../server/utils/video/provider'
import { createFakeClock, createFakeFeedFetcher, createFakeFreshJudge, keepAllVerdicts } from '../support/fresh-fakes'
import { ROUTE_SECRET, activePath, createCheckRouteHarness } from '../support/fresh-route-fakes'
import { createFakeVideoProvider, fakeDetails, type FakeJudge } from '../support/video-fakes'

const HOBBIES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'] as const
const LANGUAGES = [null, 'en', 'de', 'fr'] as const
const DAY_MS = CHECK_INTERVAL_S * 1000
const FUNCTION_LIMIT_MS = 120_000

type LeaseKind = { kind: 'none' } | { kind: 'held'; ageMs: number } | { kind: 'expired'; ageMs: number }

interface Trait {
  successAgoMs: number | null
  attemptAgoMs: number | null
  lease: LeaseKind
  durationMs: number
  fail: boolean
  stall: boolean
}

const traitArb: fc.Arbitrary<Trait> = fc.record({
  successAgoMs: fc.option(fc.constantFrom(0, 1000, DAY_MS - 1, DAY_MS, DAY_MS + 1, 2 * DAY_MS), { nil: null }),
  attemptAgoMs: fc.option(fc.constantFrom(1000, 5000, 60_000, 3_600_000), { nil: null }),
  lease: fc.oneof(
    fc.constant<LeaseKind>({ kind: 'none' }),
    fc.integer({ min: 0, max: 299_999 }).map((ageMs): LeaseKind => ({ kind: 'held', ageMs })),
    fc.integer({ min: 300_000, max: 400_000 }).map((ageMs): LeaseKind => ({ kind: 'expired', ageMs })),
  ),
  durationMs: fc.constantFrom(0, 1, 2_500, 5_000, 9_999, 10_000, 10_001, 15_000),
  fail: fc.boolean(),
  stall: fc.constantFrom(false, false, false, true),
})

const rowsArb = fc.array(
  fc.record({ hobby: fc.constantFrom(...HOBBIES), language: fc.constantFrom(...LANGUAGES) }),
  { minLength: 0, maxLength: 6 },
)

/** Independent model of the due order (Req 3.6). */
function modelOrder(keys: CheckKey[], traits: Map<string, Trait>, nowMs: number): CheckKey[] {
  const attempt = (k: CheckKey): number | null => {
    const t = traits.get(checkKeyId(k))
    return t?.attemptAgoMs == null ? null : nowMs - t.attemptAgoMs
  }
  return [...keys].sort((a, b) => {
    const ta = attempt(a)
    const tb = attempt(b)
    if (ta !== tb) {
      if (ta === null) return -1
      if (tb === null) return 1
      return ta - tb
    }
    return compareCodePoints(a.hobby, b.hobby) || compareCodePoints(a.language, b.language)
  })
}

describe('Property 7: Check_Route call bounds', () => {
  it('starts due free keys in order, at most 3, within 10 s, and answers before 120 s', async () => {
    await fc.assert(
      fc.asyncProperty(rowsArb, fc.array(traitArb, { minLength: 8, maxLength: 8 }), async (rows, traitList) => {
        const clock = createFakeClock()
        const startMs = clock.now()
        const keys = activeCheckKeys(rows)
        const traits = new Map(keys.map((k, i) => [checkKeyId(k), traitList[i % traitList.length]!]))
        const traitOf = (k: CheckKey): Trait => traits.get(checkKeyId(k))!

        const finished: string[] = []
        const abortedAtDeadline: string[] = []
        const violations: string[] = []
        const runCheck: RunFreshCheck = async (key, runId, _startedMs, d): Promise<FreshCheckOutcome> => {
          const t = traitOf(key)
          if (d.deadline.aborted) violations.push('deadline fired before the start')
          if (d.remainingMs() !== startMs + CALL_DEADLINE_MS - clock.now()) violations.push('remainingMs')
          if (t.stall) {
            // In flight at the Call_Deadline: the signal fires and the check fails.
            clock.advance(startMs + CALL_DEADLINE_MS - clock.now())
            if (d.deadline.aborted) abortedAtDeadline.push(checkKeyId(key))
            d.log?.({ checkKey: checkKeyId(key), type: 'deadline_exceeded' })
            await d.store.releaseLease(key, runId)
            return { kind: 'failed', type: 'deadline_exceeded' }
          }
          clock.advance(t.durationMs)
          // A started check is never stopped before the Call_Deadline.
          if (d.deadline.aborted) violations.push('deadline fired during a short check')
          finished.push(checkKeyId(key))
          await d.store.releaseLease(key, runId)
          return t.fail ? { kind: 'failed', type: 'model_failed' } : { kind: 'stored', items: 0 }
        }
        const h = createCheckRouteHarness({ clock, runCheck })
        h.stores.fresh.setPaths(rows.map((r) => activePath(r.hobby, r.language, startMs)))
        const leases = h.stores.pipeline.sharedState().leases
        for (const key of keys) {
          const t = traitOf(key)
          h.stores.fresh.setCheckState(key, {
            lastSuccessMs: t.successAgoMs === null ? null : startMs - t.successAgoMs,
            lastAttemptMs: t.attemptAgoMs === null ? null : startMs - t.attemptAgoMs,
          })
          if (t.lease.kind !== 'none') leases.set(freshLeaseKey(key), { runId: 'other-run', takenAt: startMs - t.lease.ageMs })
        }
        const before = new Map(keys.map((k) => [checkKeyId(k), h.stores.fresh.checkStateOf(k)]))

        const result = await handleCheckRequest({ secretHeader: ROUTE_SECRET }, h.deps)

        // Model of the loop.
        const due = keys.filter((k) => {
          const t = traitOf(k)
          return t.successAgoMs === null || t.successAgoMs >= DAY_MS
        })
        const expected: CheckKey[] = []
        let t = startMs
        for (const key of modelOrder(due, traits, startMs)) {
          if (expected.length >= 3 || t - startMs > START_WINDOW_MS) break
          const trait = traitOf(key)
          // The Lease is judged when it is taken: a held one may expire while earlier checks run.
          if (trait.lease.kind !== 'none' && trait.lease.ageMs + (t - startMs) < 300_000) continue
          expected.push(key)
          t = trait.stall ? startMs + CALL_DEADLINE_MS : t + trait.durationMs
        }

        expect(violations).toEqual([])
        expect(h.checks.map((c) => c.key)).toEqual(expected)
        expect(h.checks.length).toBeLessThanOrEqual(3)
        for (const c of h.checks) expect(c.atMs - startMs).toBeLessThanOrEqual(START_WINDOW_MS)
        // Keys not started (held Leases included): no attempt recorded.
        for (const key of keys) {
          if (h.checks.some((c) => checkKeyId(c.key) === checkKeyId(key))) continue
          expect(h.stores.fresh.checkStateOf(key)).toEqual(before.get(checkKeyId(key)))
        }
        // Every stalled started check saw the deadline signal fire.
        const stalled = h.checks.filter((c) => traitOf(c.key).stall).map((c) => checkKeyId(c.key))
        expect(abortedAtDeadline).toEqual(stalled)
        for (const id of stalled) expect(h.logs).toContainEqual({ checkKey: id, type: 'deadline_exceeded' })
        expect(finished.length + stalled.length).toBe(h.checks.length)
        // Response: 202, only `accepted`, before the 120 s function limit.
        expect(result).toEqual({ status: 202, body: { accepted: true } })
        expect(clock.now() - startMs).toBeLessThan(FUNCTION_LIMIT_MS)
        if (due.length === 0) {
          expect(h.checks).toEqual([])
          expect(h.storeCalls).not.toContain('takeLease')
        }
        expect(h.feeds.calls).toEqual([])
        expect(h.provider.detailsCalls).toEqual([])
        expect(h.judge.calls).toEqual([])
      }),
      { numRuns: 150 },
    )
  })

  type Stage = 'none' | 'feed' | 'details' | 'judge'

  it('with runFreshCheck, aborts the feed, details or Judge call in flight at 117 s', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.constantFrom(...HOBBIES), { minLength: 1, maxLength: 4 }),
        fc.array(fc.constantFrom<Stage>('none', 'feed', 'details', 'judge'), { minLength: 4, maxLength: 4 }),
        async (hobbies, stages) => {
          const clock = createFakeClock()
          const startMs = clock.now()
          const stageOf = new Map<string, Stage>(hobbies.map((h, i) => [h, stages[i]!]))
          const channelOf = (i: number): string => `UCchan${String(i).padStart(17, '0')}`
          const videoOf = (i: number): string => `vid${String(i).padStart(8, '0')}`
          const indexOfHobby = new Map<string, number>(hobbies.map((h, i) => [h, i]))
          const toDeadline = (): number => startMs + CALL_DEADLINE_MS - clock.now()

          // Feeds: one entry per hobby; a 'feed' stage moves the clock to the deadline and hangs.
          const feeds = createFakeFeedFetcher({
            clock,
            feeds: Object.fromEntries(
              hobbies.map((hobby, i) => {
                const entry: FeedEntry = { videoId: videoOf(i), title: `Video ${i}`, channelId: channelOf(i), publishedMs: startMs - 3_600_000 }
                return [channelOf(i), stageOf.get(hobby) === 'feed' ? { hang: true as const, advanceMs: CALL_DEADLINE_MS } : { entries: [entry] }]
              }),
            ),
          })
          const catalog = hobbies.map((_h, i) => fakeDetails(videoOf(i), { channelId: channelOf(i) }))
          const baseProvider = createFakeVideoProvider({ catalog })
          let detailsAborted = 0
          const provider: VideoProvider = {
            search: (q, n, o) => baseProvider.search(q, n, o),
            getDetails: (ids, opts) => {
              const hobby = hobbies.find((_h, i) => ids.includes(videoOf(i)))
              if (hobby && stageOf.get(hobby) === 'details') {
                clock.advance(toDeadline())
                return new Promise((_resolve, reject) => {
                  const fail = (): void => {
                    detailsAborted += 1
                    reject(new ProviderError('timeout'))
                  }
                  if (opts.signal?.aborted) fail()
                  else opts.signal?.addEventListener('abort', fail, { once: true })
                })
              }
              return baseProvider.getDetails(ids, opts)
            },
          }
          const baseJudge = createFakeFreshJudge([{ verdicts: keepAllVerdicts(catalog, 'footwork') }])
          let judgeAborted = 0
          const judge: FakeJudge = {
            ...baseJudge,
            generateStructured: (config, options) => {
              const hobby = hobbies.find((h) => options.userText.includes(h))
              if (hobby && stageOf.get(hobby) === 'judge') {
                clock.advance(toDeadline())
                return new Promise((resolve) => {
                  const done = (): void => {
                    judgeAborted += 1
                    resolve({ ok: false, error: 'provider_error' })
                  }
                  if (options.signal?.aborted) done()
                  else options.signal?.addEventListener('abort', done, { once: true })
                })
              }
              return baseJudge.generateStructured(config, options)
            },
          }
          const h = createCheckRouteHarness({ clock, feeds, provider, judge })
          h.stores.fresh.setPaths(hobbies.map((hobby) => activePath(hobby, 'en', startMs)))
          for (const hobby of hobbies) {
            const i = indexOfHobby.get(hobby)!
            const key: CheckKey = { hobby, language: 'en' }
            const pk = poolKey({ hobby, skillTitle: 'footwork', level: 'beginner', language: 'en' })
            await h.stores.pipeline.takeLease(pk, 'pool-run')
            const video: PoolVideo = {
              id: `pool${String(i).padStart(7, '0')}`,
              title: `Pool ${i}`,
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
            await h.stores.pipeline.storePool(pk, 'pool-run', [video])
            // After the pool store: its Channel_Source upkeep would replace seeded sources.
            h.stores.fresh.setSources(key, [
              { channelId: channelOf(i), channelName: `Channel ${i}`, qualifyingCount: 3, latestQualifyingMs: startMs - 1, lastCheckedMs: null },
            ])
          }

          const result = await handleCheckRequest({ secretHeader: ROUTE_SECRET }, h.deps)

          // Due order: all never attempted, so by hobby. Stop after the first stall (past 10 s).
          const order: string[] = [...hobbies].sort(compareCodePoints)
          const expected: string[] = []
          for (const hobby of order) {
            if (expected.length >= 3) break
            expected.push(hobby)
            if (stageOf.get(hobby) !== 'none') break
          }
          expect(h.checks.map((c) => c.key.hobby)).toEqual(expected)
          for (const hobby of expected) {
            const key: CheckKey = { hobby, language: 'en' }
            const stalled = stageOf.get(hobby) !== 'none'
            expect(h.stores.fresh.leaseOf(key)).toBeNull()
            if (stalled) {
              expect(h.logs).toContainEqual({ checkKey: checkKeyId(key), type: 'deadline_exceeded' })
              expect(h.stores.fresh.storedItems(key)).toEqual([])
              expect(h.stores.fresh.checkStateOf(key).lastSuccessMs).toBeNull()
              expect((await h.stores.fresh.sources(key))[0]?.lastCheckedMs).toBeNull()
            } else {
              expect(h.stores.fresh.storedItems(key).map((i) => i.videoId)).toEqual([videoOf(indexOfHobby.get(hobby)!)])
            }
          }
          const stalledStage = expected.map((hobby) => stageOf.get(hobby)).find((s) => s !== 'none')
          expect(detailsAborted).toBe(stalledStage === 'details' ? 1 : 0)
          expect(judgeAborted).toBe(stalledStage === 'judge' ? 1 : 0)
          expect(feeds.inFlight).toBe(0)
          expect(result).toEqual({ status: 202, body: { accepted: true } })
          expect(clock.now() - startMs).toBeLessThan(FUNCTION_LIMIT_MS)
        },
      ),
      { numRuns: 100 },
    )
  }, 60_000)
})
