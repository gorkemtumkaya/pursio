import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { checkKeyId, compareCodePoints } from '../../shared/utils/fresh-keys'
import type { FreshFailure } from '../../server/utils/fresh/check'
import type { FreshItemRow } from '../../server/utils/fresh/check-store'
import { isDue } from '../../server/utils/fresh/schedule'
import type { ProviderErrorKind, VideoDetails } from '../../server/utils/video/provider'
import { FAKE_CLOCK_START_MS, fakeFreshItem, freshVerdict, type FeedScript, type FreshJudgeScript } from '../support/fresh-fakes'
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
  sourceRow,
  vid,
} from '../support/fresh-check-harness'

const START = FAKE_CLOCK_START_MS
const VIDEO_COUNT = 80
const FOREIGN_CHANNEL = chan(99)

type FeedOutcome = 'ok' | 'status' | 'malformed' | 'connect'
type DetailsKind = 'pass' | 'missing' | 'short' | 'lang' | 'nullChannel'
type JudgeKind = 'valid' | 'invalid' | 'error' | 'noConfig'
type ReadMethod = 'sources' | 'storedIds' | 'skillTitles'
type DbFail = ReadMethod | 'storeCheck'
type DeadlinePoint = 'never' | 'before' | 'read' | 'feeds' | 'details' | 'judge' | 'store' | 'late'

/** Published time offsets (s) around the window bounds and the check start. */
const arbOffsetS = fc.oneof(
  fc.integer({ min: -WEEK_MS / SECOND_MS + 1, max: 0 }),
  fc.constantFrom(-WEEK_MS / SECOND_MS, -WEEK_MS / SECOND_MS + 1, 0, 1, -8 * DAY_MS / SECOND_MS, -3600),
)

/** `undefined` most of the time, else a value: keeps the success path well covered. */
function rarely<T>(arb: fc.Arbitrary<T>): fc.Arbitrary<T | undefined> {
  return fc.oneof({ weight: 7, arbitrary: fc.constant(undefined) }, { weight: 1, arbitrary: arb })
}

const arbSource = fc.record({
  n: fc.integer({ min: 0, max: 30 }),
  lastCheckedH: fc.oneof({ weight: 2, arbitrary: fc.constant(null) }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 10 * 24 }) }),
  outcome: fc.constantFrom<FeedOutcome>('ok', 'ok', 'ok', 'status', 'malformed', 'connect'),
  entries: fc.uniqueArray(
    fc.record({ v: fc.integer({ min: 0, max: VIDEO_COUNT - 1 }), offsetS: arbOffsetS, foreign: fc.integer({ min: 0, max: 9 }).map((x) => x === 0) }),
    { maxLength: 15, selector: (e) => e.v, size: 'medium' },
  ),
})

type SourceSpec = typeof arbSource extends fc.Arbitrary<infer T> ? T : never

const arbScenario = fc.record({
  sources: fc.oneof(
    { weight: 1, arbitrary: fc.constant<SourceSpec[]>([]) },
    { weight: 6, arbitrary: fc.uniqueArray(arbSource, { minLength: 1, maxLength: 6, selector: (s) => s.n }) },
  ),
  storedIds: fc.uniqueArray(fc.integer({ min: 0, max: VIDEO_COUNT - 1 }), { maxLength: 12 }),
  details: fc.array(fc.constantFrom<DetailsKind>('pass', 'pass', 'pass', 'pass', 'missing', 'short', 'lang', 'nullChannel'), {
    minLength: VIDEO_COUNT,
    maxLength: VIDEO_COUNT,
  }),
  detailsFail: rarely(
    fc.record({ call: fc.integer({ min: 0, max: 1 }), kind: fc.constantFrom<ProviderErrorKind>('upstream', 'quota_exceeded', 'timeout') }),
  ),
  quotaRefuseAt: rarely(fc.integer({ min: 0, max: 1 })),
  pool: fc.constantFrom(true, true, true, false),
  judge: fc.constantFrom<JudgeKind>('valid', 'valid', 'valid', 'valid', 'valid', 'valid', 'invalid', 'error', 'noConfig'),
  keep: fc.array(fc.integer({ min: 0, max: 3 }).map((x) => x > 0), { minLength: VIDEO_COUNT, maxLength: VIDEO_COUNT }),
  lostLease: fc.integer({ min: 0, max: 7 }).map((x) => x === 0),
  dbFail: rarely(fc.constantFrom<DbFail>('sources', 'storedIds', 'skillTitles', 'storeCheck')),
  deadline: fc.oneof(
    { weight: 10, arbitrary: fc.constant<DeadlinePoint>('never') },
    { weight: 8, arbitrary: fc.constantFrom<DeadlinePoint>('before', 'read', 'feeds', 'details', 'judge', 'store', 'late') },
  ),
  deadlineRead: fc.constantFrom<ReadMethod>('sources', 'storedIds', 'skillTitles'),
  deadlineIndex: fc.nat({ max: 20 }),
  lastSuccessS: fc.option(fc.integer({ min: 86_400, max: 30 * 86_400 }), { nil: null }),
  lastAttemptS: fc.option(fc.integer({ min: 0, max: 30 * 86_400 }), { nil: null }),
})
type Scenario = typeof arbScenario extends fc.Arbitrary<infer T> ? T : never

type Expected =
  | { kind: 'failed'; type: FreshFailure }
  | { kind: 'stored'; items: { entry: FeedEntry; channelId: string }[]; succeeded: Set<string> }

function newestFirst(a: FeedEntry, b: FeedEntry): number {
  return b.publishedMs - a.publishedMs || compareCodePoints(a.videoId, b.videoId)
}

function entriesOf(source: Scenario['sources'][number]): FeedEntry[] {
  const channelId = chan(source.n)
  return source.entries.map((e) => feedEntry(vid(e.v), e.foreign ? FOREIGN_CHANNEL : channelId, START + e.offsetS * SECOND_MS))
}

function lastCheckedOf(source: Scenario['sources'][number]): number | null {
  return source.lastCheckedH === null ? null : START - source.lastCheckedH * HOUR_MS
}

function detailsOf(n: number, kind: DetailsKind): VideoDetails | null {
  const id = vid(n)
  switch (kind) {
    case 'missing':
      return null
    case 'short':
      return passingDetails(id, chan(100 + n), { durationSeconds: 30 })
    case 'lang':
      return passingDetails(id, chan(100 + n), { defaultAudioLanguage: 'de' })
    case 'nullChannel':
      return passingDetails(id, null)
    case 'pass':
      return passingDetails(id, chan(100 + n))
  }
}

/** Independent model of one Fresh_Check over the scenario (Req 3.15, 4 to 7). */
function model(s: Scenario): Expected {
  const fail = (type: FreshFailure): Expected => ({ kind: 'failed', type })
  const read = (method: ReadMethod): FreshFailure | null => {
    if (s.deadline === 'read' && s.deadlineRead === method) return 'deadline_exceeded'
    if (s.dbFail === method) return 'store_failed'
    return null
  }
  const store = (items: { entry: FeedEntry; channelId: string }[], succeeded: Set<string>): Expected => {
    if (s.deadline === 'late') return fail('deadline_exceeded')
    if (s.dbFail === 'storeCheck') return fail('store_failed')
    if (s.lostLease) return fail('lease_lost')
    if (s.deadline === 'store') return fail('deadline_exceeded')
    return { kind: 'stored', items, succeeded }
  }

  if (s.deadline === 'before') return fail('deadline_exceeded')
  const r1 = read('sources')
  if (r1) return fail(r1)
  if (s.sources.length === 0) return store([], new Set())

  if (s.deadline === 'feeds') return fail('deadline_exceeded')
  const ok = s.sources.filter((src) => src.outcome === 'ok')
  if (ok.length === 0) return fail('feeds_failed')
  const succeeded = new Set(ok.map((src) => chan(src.n)))

  // Window (Req 4.2, 4.3).
  const perFeed = ok.map((src) => {
    const lower = Math.max(lastCheckedOf(src) ?? Number.NEGATIVE_INFINITY, START - WEEK_MS)
    return entriesOf(src)
      .filter((e) => e.channelId === chan(src.n) && e.publishedMs > lower && e.publishedMs <= START)
      .sort(newestFirst)
      .slice(0, 15)
  })
  const r2 = read('storedIds')
  if (r2) return fail(r2)

  // Merge (Req 4.6).
  const stored = new Set(s.storedIds.map(vid))
  const byId = new Map<string, FeedEntry>()
  for (const e of perFeed.flat()) {
    if (stored.has(e.videoId)) continue
    const seen = byId.get(e.videoId)
    if (!seen || compareCodePoints(e.channelId, seen.channelId) < 0) byId.set(e.videoId, e)
  }
  const merged = [...byId.values()].sort(newestFirst)
  if (merged.length === 0) return store([], succeeded)

  // Details (Req 5.1 to 5.3).
  const batches = Math.ceil(merged.length / 50)
  if (s.quotaRefuseAt !== undefined && s.quotaRefuseAt < batches) return fail('quota_refused')
  if (s.deadline === 'details') return fail('deadline_exceeded')
  if (s.detailsFail && s.detailsFail.call < batches) return fail('details_failed')

  // Filter (Req 5.4 to 5.7).
  const passed = merged.filter((e) => {
    const kind = s.details[Number(e.videoId.slice(1))]
    return kind === 'pass' || kind === 'nullChannel'
  })
  if (passed.length === 0) return store([], succeeded)

  const r3 = read('skillTitles')
  if (r3) return fail(r3)
  if (!s.pool) return store([], succeeded)

  // Judge (Req 6.1, 6.5 to 6.7, 6.12).
  if (s.judge === 'noConfig') return fail('model_failed')
  if (s.deadline === 'judge') return fail('deadline_exceeded')
  if (s.judge !== 'valid') return fail('model_failed')
  const sent = passed.slice(0, 40)
  const items = sent
    .filter((e) => s.keep[Number(e.videoId.slice(1))])
    .map((entry) => {
      const d = detailsOf(Number(entry.videoId.slice(1)), s.details[Number(entry.videoId.slice(1))] ?? 'pass')
      return { entry, channelId: d?.channelId ?? entry.channelId }
    })
  return store(items, succeeded)
}

function feedScript(source: Scenario['sources'][number]): FeedScript {
  switch (source.outcome) {
    case 'ok':
      return { entries: entriesOf(source) }
    case 'status':
      return { status: 500 }
    case 'malformed':
      return { body: '<not-a-feed' }
    case 'connect':
      return { fail: 'connect' }
  }
}

function judgeScript(s: Scenario): FreshJudgeScript[] {
  switch (s.judge) {
    case 'valid':
      // A verdict for every video of the scenario: ids that were not sent are ignored (Req 6.10).
      return [{
        verdicts: Array.from({ length: VIDEO_COUNT }, (_, n) =>
          freshVerdict(vid(n), 'footwork', s.keep[n] ? {} : { is_instruction: false })),
      }]
    case 'invalid':
      return [{ raw: { verdicts: [{ video_id: vid(0) }] } }]
    case 'error':
    case 'noConfig':
      return [{ error: 'provider_error' }]
  }
}

function oldItem(n: number): FreshItemRow {
  return fakeFreshItem(vid(n), { foundMs: START - 2 * DAY_MS, publishedMs: START - 3 * DAY_MS, why: `Kept item ${n}.` })
}

describe('runFreshCheck atomicity', () => {
  // Feature: fresh, Property 16: Fresh_Check is all or nothing
  // **Validates: Requirements 3.15, 4.4, 4.5, 4.7, 5.2, 5.3, 5.5, 7.1, 7.2, 7.5, 7.6**
  it('either stores old items plus the kept new videos with all check times, or changes nothing', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (s) => {
        const catalog = s.details.flatMap((kind, n) => {
          const d = detailsOf(n, kind)
          return d ? [d] : []
        })
        const otherKeyItem = fakeFreshItem(vid(0), { hobby: 'guitar', foundMs: START - DAY_MS })
        const sources = s.sources.map((src) => sourceRow(chan(src.n), lastCheckedOf(src)))
        const h = await createCheckHarness({
          sources,
          feeds: Object.fromEntries(s.sources.map((src) => [chan(src.n), feedScript(src)])),
          catalog,
          detailsFail: s.detailsFail,
          quotaRefuseAt: s.quotaRefuseAt,
          judge: judgeScript(s),
          noConfig: s.judge === 'noConfig',
          pool: s.pool,
          items: [...s.storedIds.map(oldItem), otherKeyItem],
          state: {
            lastSuccessMs: s.lastSuccessS === null ? null : START - s.lastSuccessS * SECOND_MS,
            lastAttemptMs: s.lastAttemptS === null ? null : START - s.lastAttemptS * SECOND_MS,
          },
        })
        const { fresh, clock } = h.stores
        const inspect = () => fresh.restart()

        const itemsBefore = fresh.storedItems()
        const sourcesBefore = await inspect().sources(CHECK_KEY)
        const successBefore = fresh.checkStateOf(CHECK_KEY).lastSuccessMs
        expect(isDue({ key: CHECK_KEY, ...fresh.checkStateOf(CHECK_KEY) }, clock.now())).toBe(true)

        // Faults and the deadline point.
        if (s.dbFail) fresh.failNext(s.dbFail)
        if (s.lostLease) await fresh.releaseLease(CHECK_KEY, 'run-A')
        if (s.deadline === 'before') h.fireDeadline()
        if (s.deadline === 'late') clock.advance(h.deadlineMs - 2_000 - clock.now())
        if (s.deadline === 'read') h.hooks.onRead = (method) => { if (method === s.deadlineRead) h.fireDeadline() }
        if (s.deadline === 'feeds') h.hooks.onFeed = (i) => { if (i === s.deadlineIndex % s.sources.length) h.fireDeadline() }
        if (s.deadline === 'details') h.hooks.onDetails = (i) => { if (i === 0) h.fireDeadline() }
        if (s.deadline === 'judge') h.hooks.onJudge = () => h.fireDeadline()
        let storeTime: number | null = null
        fresh.duringStore = () => {
          storeTime = clock.now()
          if (s.deadline === 'store') h.fireDeadline()
        }

        const expected = model(s)
        const outcome = await h.run()
        h.hooks.onRead = undefined

        const state = fresh.checkStateOf(CHECK_KEY)
        const sourcesAfter = await inspect().sources(CHECK_KEY)
        // The Lease is free and the Last_Attempt_Time is the check start in both cases.
        expect(fresh.leaseOf(CHECK_KEY)).toBeNull()
        expect(state.lastAttemptMs).toBe(h.startedMs)

        if (expected.kind === 'failed') {
          expect(outcome).toEqual({ kind: 'failed', type: expected.type })
          expect(h.logs).toEqual([{ checkKey: checkKeyId(CHECK_KEY), type: expected.type }])
          expect(fresh.storedItems()).toEqual(itemsBefore)
          expect(sourcesAfter).toEqual(sourcesBefore)
          expect(state.lastSuccessMs).toBe(successBefore)
          expect(isDue({ key: CHECK_KEY, ...state }, clock.now())).toBe(true)
          if (h.deps.deadline.aborted) expect(expected.type).toBe('deadline_exceeded')
          return
        }

        expect(outcome).toEqual({ kind: 'stored', items: expected.items.length })
        expect(h.logs).toEqual([])
        expect(h.deps.deadline.aborted).toBe(false)
        expect(storeTime).not.toBeNull()
        const found = storeTime ?? Number.NaN
        const added: FreshItemRow[] = expected.items.map(({ entry, channelId }) => ({
          ...fakeFreshItem(entry.videoId),
          channelId,
          publishedMs: entry.publishedMs,
          foundMs: found,
        }))
        const want = [...itemsBefore, ...added].sort(
          (a, b) => compareCodePoints(a.hobby, b.hobby) || compareCodePoints(a.language, b.language) || compareCodePoints(a.videoId, b.videoId),
        )
        expect(fresh.storedItems()).toEqual(want)
        expect(sourcesAfter).toEqual(
          sourcesBefore.map((row) => (expected.succeeded.has(row.channelId) ? { ...row, lastCheckedMs: h.startedMs } : row)),
        )
        expect(state.lastSuccessMs).toBe(found)
      }),
      { numRuns: 400 },
    )
  })
})
