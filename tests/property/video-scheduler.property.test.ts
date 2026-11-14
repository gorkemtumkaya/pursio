import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../../shared/types/llm'
import type { Level, SkillTree } from '../../shared/types/skill-tree'
import type { PoolVideo } from '../../shared/types/video'
import { nextPacificMidnight, pacificDay } from '../../shared/utils/pacific-time'
import { poolKey } from '../../shared/utils/video-normalize'
import type { PipelineOutcome } from '../../server/utils/video/pipeline'
import { LEASE_TIMEOUT_S } from '../../server/utils/video/pipeline-store'
import { InMemoryPipelineStore } from '../../server/utils/video/pipeline-store-memory'
import type { ProviderErrorKind } from '../../server/utils/video/provider'
import {
  RETRY_DELAYS_S,
  WINDOW_SIZE,
  createScheduler,
  currentWindow,
  fillJobFor,
  nextRetry,
  type FillJob,
  type Scheduler,
  type SchedulerDeps,
} from '../../server/utils/video/scheduler'
import {
  createFakeBackground,
  createFakeJudge,
  createFakeVideoProvider,
  fakeDetails,
  type FakeBackground,
  type FakeJudge,
  type FakeVideoProvider,
  type FakeVideoProviderOptions,
  type JudgeScript,
} from '../support/video-fakes'

const RUNS = { numRuns: 100 }
/** 2026-11-12 12:00 in Pacific time (PST). */
const NOON = Date.UTC(2026, 10, 12, 20, 0, 0)
const CONFIG: ProviderConfig = { provider: 'openai', model: 'test-model', apiKey: 'test-key' }
const QUERIES = ['query one', 'query two']

const OLD_VIDEO: PoolVideo = {
  id: 'old1',
  title: 'Old',
  channel: 'Channel',
  thumbnailUrl: 'https://i.ytimg.com/vi/old1/hqdefault.jpg',
  durationSeconds: 300,
  viewCount: 1,
  likeCount: 1,
  publishedAt: null,
  defaultAudioLanguage: 'en',
  hasCaptions: true,
  teachesThisSkill: 0.9,
  levelFit: 0.8,
  style: 'technique',
  matchedQuestText: null,
}

const GOOD_VERDICT: JudgeScript = {
  verdicts: [
    {
      video_id: 'v1',
      teaches_this_skill: 0.9,
      level_fit: 0.9,
      is_instruction: true,
      style: 'technique',
      best_matching_quest_text: null,
    },
  ],
}

function makeJob(i: number, level: Level = 'beginner'): FillJob {
  const skillTitle = `Skill ${i}`
  return {
    poolKey: poolKey({ hobby: 'bouldering', skillTitle, level, language: 'en' }),
    hobby: 'bouldering',
    skillTitle,
    skillDescription: 'description',
    quests: ['quest a', 'quest b', 'quest c'],
    level,
    language: 'en',
    searchQueries: [...QUERIES],
    quickTip: false,
  }
}

interface Env {
  clock: { t: number }
  store: InMemoryPipelineStore
  provider: FakeVideoProvider
  judge: FakeJudge
  bg: FakeBackground
  scheduler: Scheduler
  /** A scheduler over a restarted store (another server instance) sharing provider and judge. */
  instance(overrides?: Partial<SchedulerDeps>): { scheduler: Scheduler; bg: FakeBackground; store: InMemoryPipelineStore }
}

interface EnvOptions {
  provider?: FakeVideoProviderOptions
  judge?: JudgeScript[]
  runner?: SchedulerDeps['runner']
  background?: 'run' | 'unavailable'
}

function makeEnv(options: EnvOptions = {}): Env {
  const clock = { t: NOON }
  const store = new InMemoryPipelineStore(() => clock.t)
  const provider = createFakeVideoProvider({
    defaultSearch: { ok: [{ id: 'v1', title: 'V1', channel: 'C', thumbnailUrl: 'https://i.ytimg.com/vi/v1/hqdefault.jpg' }] },
    catalog: [fakeDetails('v1')],
    ...options.provider,
  })
  const judge = createFakeJudge(options.judge ?? [GOOD_VERDICT])
  const build = (s: InMemoryPipelineStore, bg: FakeBackground, overrides: Partial<SchedulerDeps> = {}): Scheduler =>
    createScheduler({
      pipeline: { store: s, provider, adapter: judge, config: CONFIG, judgePrompt: 'prompt', dailyQuota: 1_000_000 },
      background: bg.background,
      now: () => clock.t,
      ...(options.runner ? { runner: options.runner } : {}),
      ...overrides,
    })
  const bg = createFakeBackground(options.background ?? 'run')
  return {
    clock,
    store,
    provider,
    judge,
    bg,
    scheduler: build(store, bg),
    instance(overrides) {
      const s = store.restart()
      const b = createFakeBackground(options.background ?? 'run')
      return { scheduler: build(s, b, overrides), bg: b, store: s }
    },
  }
}

async function seedPool(store: InMemoryPipelineStore, key: string): Promise<void> {
  expect(await store.takeLease(key, 'seed')).toBe(true)
  expect(await store.storePool(key, 'seed', [OLD_VIDEO])).toBe(true)
}

/** A runner that records the job and settles like runPipeline does (store or release). */
function recordingRunner(
  ran: string[],
  failing: ReadonlySet<string> = new Set(),
  kind: PipelineOutcome['kind'] = 'provider_failure',
): NonNullable<SchedulerDeps['runner']> {
  return async (job, runId, deps) => {
    ran.push(job.poolKey)
    if (failing.has(job.poolKey)) {
      await deps.store.releaseLease(job.poolKey, runId)
      return { kind } as PipelineOutcome
    }
    await deps.store.storePool(job.poolKey, runId, [])
    return { kind: 'stored', videoCount: 0 }
  }
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('Property 17: Single run per Pool_Key', () => {
  /**
   * **Validates: Requirements 7.6, 7.8, 7.14, 8.9**
   */
  it('runs the pipeline once for any number of concurrent requests over any number of instances', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 20 }), async (picks) => {
        const env = makeEnv()
        const instances = [0, 1, 2, 3].map(() => env.instance())
        const job = makeJob(1)
        await Promise.all(picks.map((i) => instances[i]!.scheduler.requestFill(job)))
        await Promise.all(instances.map((x) => x.bg.settled()))

        expect(env.provider.searchCalls.map((c) => c.query).sort()).toEqual([...QUERIES].sort())
        expect(env.provider.detailsCalls).toHaveLength(1)
        expect(env.judge.calls).toHaveLength(1)
        for (const x of instances) {
          const [read] = await x.store.readPools([job.poolKey])
          expect(read!.pool?.videos.map((v) => v.id)).toEqual(['v1'])
          expect(read!.leaseActive).toBe(false)
        }
      }),
      RUNS,
    )
  })

  it('runs different Pool_Keys separately, once each', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 0, max: 1 }), { minLength: 2, maxLength: 20 }),
        async (keys) => {
          const env = makeEnv()
          const jobs = [makeJob(1), makeJob(2)]
          await Promise.all(keys.map((k) => env.scheduler.requestFill(jobs[k]!)))
          await env.bg.settled()
          const distinct = new Set(keys).size
          expect(env.provider.searchCalls).toHaveLength(QUERIES.length * distinct)
          expect(env.judge.calls).toHaveLength(distinct)
        },
      ),
      RUNS,
    )
  })

  it('reports busy for a second run while the lease is active and does not call the provider', async () => {
    const env = makeEnv()
    const job = makeJob(1)
    expect(await env.store.takeLease(job.poolKey, 'other')).toBe(true)
    expect(await env.scheduler.runFill(job)).toEqual({ kind: 'busy' })
    expect(env.provider.searchCalls).toHaveLength(0)
    expect(await env.scheduler.requestFill(job)).toEqual({ inProgress: true })
    await env.bg.settled()
    expect(env.provider.searchCalls).toHaveLength(0)
  })
})

describe('Property 18: Lease expiry and takeover', () => {
  /**
   * **Validates: Requirements 7.8, 7.12**
   */
  it('a second run can take the lease iff its age is at least 300 seconds', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 1000 }), async (ageS) => {
        const clock = { t: NOON }
        const store = new InMemoryPipelineStore(() => clock.t)
        expect(await store.takeLease('k', 'A')).toBe(true)
        clock.t += ageS * 1000
        expect(await store.takeLease('k', 'B')).toBe(ageS >= LEASE_TIMEOUT_S)
      }),
      RUNS,
    )
  })

  it('after takeover the old run cannot store and the pool stays unchanged', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: LEASE_TIMEOUT_S, max: 5000 }),
        fc.boolean(),
        async (ageS, bStores) => {
          const clock = { t: NOON }
          const store = new InMemoryPipelineStore(() => clock.t)
          await seedPool(store, 'k')
          expect(await store.takeLease('k', 'A')).toBe(true)
          clock.t += ageS * 1000
          expect(await store.takeLease('k', 'B')).toBe(true)
          const bVideo = { ...OLD_VIDEO, id: 'fromB' }
          if (bStores) expect(await store.storePool('k', 'B', [bVideo])).toBe(true)
          const before = (await store.readPools(['k']))[0]!.pool
          expect(await store.storePool('k', 'A', [{ ...OLD_VIDEO, id: 'fromA' }])).toBe(false)
          const after = (await store.readPools(['k']))[0]!.pool
          expect(after).toEqual(before)
          expect(after!.videos.map((v) => v.id)).toEqual([bStores ? 'fromB' : 'old1'])
        },
      ),
      RUNS,
    )
  })

  it('runFill reports lease_lost and keeps the new owner pool when its lease was taken over mid-run', async () => {
    const runner: NonNullable<SchedulerDeps['runner']> = async (job, runId, deps) => {
      env.clock.t += (LEASE_TIMEOUT_S + 1) * 1000
      expect(await deps.store.takeLease(job.poolKey, 'B')).toBe(true)
      return (await deps.store.storePool(job.poolKey, runId, [{ ...OLD_VIDEO, id: 'fromA' }]))
        ? { kind: 'stored', videoCount: 1 }
        : { kind: 'lease_lost' }
    }
    const env = makeEnv({ runner })
    const job = makeJob(1)
    await seedPool(env.store, job.poolKey)
    expect(await env.scheduler.runFill(job)).toEqual({ kind: 'lease_lost' })
    const [read] = await env.store.readPools([job.poolKey])
    expect(read!.pool!.videos.map((v) => v.id)).toEqual(['old1'])
  })
})

describe('Property 19: Failed runs keep the existing pool', () => {
  type Failure =
    | { at: 'search'; kind: ProviderErrorKind }
    | { at: 'details'; kind: ProviderErrorKind }
    | { at: 'judge'; script: JudgeScript }

  const arbKind = fc.constantFrom<ProviderErrorKind>('upstream', 'timeout', 'quota_exceeded')
  const arbFailure: fc.Arbitrary<Failure> = fc.oneof(
    arbKind.map((kind): Failure => ({ at: 'search', kind })),
    arbKind.map((kind): Failure => ({ at: 'details', kind })),
    fc.constantFrom<JudgeScript>(
      { error: 'provider_error' },
      { error: 'bad_output' },
      { raw: { verdicts: 'nope' } },
    ).map((script): Failure => ({ at: 'judge', script })),
  )

  function envFor(failure: Failure): Env {
    if (failure.at === 'search') return makeEnv({ provider: { defaultSearch: { fail: failure.kind } } })
    if (failure.at === 'details') return makeEnv({ provider: { details: [{ fail: failure.kind }] } })
    return makeEnv({ judge: [failure.script] })
  }

  /**
   * **Validates: Requirements 7.10, 9.8, 9.9, 9.10, 9.11, 9.15**
   */
  it('keeps the stored pool, releases the lease and schedules a retry on any failure', async () => {
    await fc.assert(
      fc.asyncProperty(arbFailure, fc.boolean(), async (failure, stale) => {
        const env = envFor(failure)
        const job = makeJob(1)
        await seedPool(env.store, job.poolKey)
        const seeded = (await env.store.readPools([job.poolKey]))[0]!.pool
        if (stale) env.clock.t += 604_801 * 1000

        const outcome = await env.scheduler.runFill(job)
        expect(['provider_failure', 'model_failure']).toContain(outcome.kind)

        const [read] = await env.store.readPools([job.poolKey])
        expect(read!.pool).toEqual(seeded)
        expect(read!.leaseActive).toBe(false)
        expect(read!.fillNextRunMs).toBe(env.clock.t + RETRY_DELAYS_S[0]! * 1000)

        env.clock.t += RETRY_DELAYS_S[0]! * 1000
        const due = await env.store.dueFills(5)
        expect(due).toHaveLength(1)
        expect(due[0]).toMatchObject({ poolKey: job.poolKey, reason: 'retry', attempts: 1 })
        expect((await env.store.readPools([job.poolKey]))[0]!.pool).toEqual(seeded)
      }),
      RUNS,
    )
  })

  it('a failed first run leaves no pool and the key can be taken again', async () => {
    const env = makeEnv({ provider: { defaultSearch: { fail: 'upstream' } } })
    const job = makeJob(1)
    expect((await env.scheduler.runFill(job)).kind).toBe('provider_failure')
    const [read] = await env.store.readPools([job.poolKey])
    expect(read!.pool).toBeNull()
    expect(await env.store.takeLease(job.poolKey, 'next')).toBe(true)
  })

  /**
   * Scenario: a run killed after taking the lease (no release, no store).
   * **Validates: Requirements 9.15, 14.22**
   */
  it('a killed run: lease and running row expire together at 300 s, then a drain runs the key', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 900 }), async (ageS) => {
        const hang: NonNullable<SchedulerDeps['runner']> = () => new Promise<PipelineOutcome>(() => {})
        const env = makeEnv({ runner: hang })
        const job = makeJob(1)
        void env.scheduler.runFill(job)
        await tick()

        // The killed run left a lease and a running row.
        const [mid] = await env.store.readPools([job.poolKey])
        expect(mid!.leaseActive).toBe(true)
        expect(mid!.fillNextRunMs).toBe(NOON + LEASE_TIMEOUT_S * 1000)

        env.clock.t += ageS * 1000
        const other = env.instance({ runner: undefined })
        const [read] = await other.store.readPools([job.poolKey])
        if (ageS < LEASE_TIMEOUT_S) {
          expect(read!.leaseActive).toBe(true)
          expect(await other.store.dueFills(5)).toEqual([])
          expect(await other.scheduler.drainDue(5)).toBe(0)
          expect(env.provider.searchCalls).toHaveLength(0)
        }
        else {
          expect(read!.leaseActive).toBe(false)
          const due = await other.store.dueFills(5)
          expect(due.map((r) => [r.poolKey, r.reason])).toEqual([[job.poolKey, 'running']])
          expect(await other.scheduler.drainDue(5)).toBe(1)
          await other.bg.settled()
          const [after] = await other.store.readPools([job.poolKey])
          expect(after!.pool?.videos.map((v) => v.id)).toEqual(['v1'])
          expect(await other.store.dueFills(5)).toEqual([])
          expect(env.provider.searchCalls).toHaveLength(QUERIES.length)
        }
      }),
      RUNS,
    )
  })
})

describe('Property 20: Current window and inline fill bound', () => {
  const arbTree = fc
    .tuple(fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 3 }), fc.nat())
    .map(([sizes, pick]) => {
      let n = 0
      const levels: Level[] = ['beginner', 'intermediate', 'advanced']
      const tree: SkillTree = {
        hobby: 'bouldering',
        mascot: { set: 'explorer' },
        sections: sizes.map((size, s) => ({
          title: `Section ${s}`,
          level: levels[s]!,
          nodes: Array.from({ length: size }, () => {
            n += 1
            return {
              id: `n${n}`,
              title: `Skill ${n}`,
              description: 'd',
              prerequisites: [],
              optional: false,
              milestone: false,
              quests: ['a', 'b', 'c'] as [string, string, string],
            }
          }),
        })),
      }
      return { tree, current: `n${(pick % n) + 1}`, total: n }
    })

  /**
   * **Validates: Requirements 8.4, 8.5, 14.3**
   */
  it('the window is the current skill and up to 2 next skills, all inside the tree', () => {
    fc.assert(
      fc.property(arbTree, ({ tree, current, total }) => {
        const index = Number(current.slice(1)) - 1
        const window = currentWindow(tree, current)
        expect(window.map((w) => w.node.id)).toEqual(
          Array.from({ length: Math.min(WINDOW_SIZE, total - index) }, (_, i) => `n${index + i + 1}`),
        )
        const levelOf = new Map(tree.sections.flatMap((s) => s.nodes.map((n) => [n.id, s.level] as const)))
        for (const w of window) expect(w.level).toBe(levelOf.get(w.node.id))
      }),
      RUNS,
    )
    expect(currentWindow({ hobby: 'x', mascot: { set: 'explorer' }, sections: [] }, 'n1')).toEqual([])
  })

  /**
   * **Validates: Requirements 8.6, 8.7, 14.4**
   */
  it('starts at most 2 runs (current first), queues the rest, and skips fresh pools', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTree,
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        async ({ tree, current }, freshFlags, failFlags) => {
          const ran: string[] = []
          const env = makeEnv({ runner: undefined })
          const jobs = currentWindow(tree, current).map((w) => fillJobFor(tree.hobby, w, 'en'))
          const failing = new Set(jobs.filter((_, i) => failFlags[i]).map((j) => j.poolKey))
          const instance = env.instance({ runner: recordingRunner(ran, failing) })
          for (const [i, job] of jobs.entries()) if (freshFlags[i]) await seedPool(env.store, job.poolKey)

          await instance.scheduler.fillWindow(jobs)
          await instance.bg.settled()

          const needing = jobs.filter((_, i) => !freshFlags[i])
          const inline = needing.slice(0, 2)
          const rest = needing.slice(2)
          expect(instance.bg.accepted).toBeLessThanOrEqual(2)
          expect(ran).toEqual(inline.map((j) => j.poolKey))

          env.clock.t += 1000
          const rows = new Map((await env.store.dueFills(50)).map((r) => [r.poolKey, r]))
          for (const job of rest) expect(rows.get(job.poolKey)).toMatchObject({ reason: 'new', attempts: 0 })
          // A failed run does not stop the next one, and leaves a retry row.
          for (const job of inline) {
            if (failing.has(job.poolKey)) {
              const [read] = await env.store.readPools([job.poolKey])
              expect(read!.fillNextRunMs).not.toBeNull()
            }
          }
          for (const [i, job] of jobs.entries()) {
            if (freshFlags[i]) {
              expect(rows.has(job.poolKey)).toBe(false)
              expect(ran).not.toContain(job.poolKey)
            }
          }
          const windowKeys = new Set(jobs.map((j) => j.poolKey))
          for (const key of rows.keys()) expect(windowKeys.has(key)).toBe(true)
        },
      ),
      RUNS,
    )
  })

  /**
   * Scenario: the `unavailable` background mode (Vercel). Nothing runs inline; every key gets a due row.
   * **Validates: Requirements 8.9, 14.23**
   */
  it('queues every key without running anything when no background is available, then a drain fills them', async () => {
    const env = makeEnv({ background: 'unavailable' })
    const jobs = [makeJob(1), makeJob(2), makeJob(3)]
    await env.scheduler.fillWindow(jobs)
    expect(env.provider.searchCalls).toHaveLength(0)
    expect(env.bg.accepted).toBe(0)
    expect((await env.store.dueFills(10)).map((r) => [r.poolKey, r.reason])).toEqual(
      jobs.map((j) => [j.poolKey, 'new']),
    )
    expect(await env.scheduler.requestFill(makeJob(4))).toEqual({ inProgress: true })
    expect(env.provider.searchCalls).toHaveLength(0)

    // Restart: a new instance over the same store drains the rows.
    const restarted = env.instance()
    expect(await restarted.scheduler.drainDue(5)).toBe(4)
    for (const job of [...jobs, makeJob(4)]) {
      expect((await env.store.readPools([job.poolKey]))[0]!.pool?.videos.map((v) => v.id)).toEqual(['v1'])
    }
    expect(await env.store.dueFills(10)).toEqual([])
  })

  it('a stale pool is queued with reason stale when no background is available', async () => {
    const env = makeEnv({ background: 'unavailable' })
    const job = makeJob(1)
    await seedPool(env.store, job.poolKey)
    env.clock.t += 604_801 * 1000
    await env.scheduler.requestFill(job)
    expect((await env.store.dueFills(5)).map((r) => r.reason)).toEqual(['stale'])
  })

  it('drainDue runs at most max due rows and skips keys that became fresh', async () => {
    const env = makeEnv({ background: 'unavailable' })
    const jobs = [makeJob(1), makeJob(2), makeJob(3)]
    await env.scheduler.fillWindow(jobs)
    await seedPool(env.store, jobs[0]!.poolKey)
    expect(await env.scheduler.drainDue(1)).toBe(1)
    expect(await env.scheduler.drainDue(5)).toBe(1)
    expect(await env.store.dueFills(10)).toEqual([])
    expect(env.provider.searchCalls).toHaveLength(QUERIES.length * 2)
  })
})

describe('Property 24: Retry schedule', () => {
  /**
   * **Validates: Requirements 9.12, 14.11**
   */
  it('delays grow for attempts 1 to 5 and attempt 6 waits for the next Pacific midnight', () => {
    fc.assert(
      fc.property(fc.integer({ min: NOON - 400 * 86_400_000, max: NOON + 400 * 86_400_000 }), (now) => {
        let previous = 0
        for (let n = 1; n <= 5; n++) {
          const plan = nextRetry(n, now)
          const delay = plan.nextRunAt - now
          expect(delay).toBe(RETRY_DELAYS_S[n - 1]! * 1000)
          expect(delay).toBeGreaterThan(previous)
          expect(plan.attempts).toBe(n)
          previous = delay
        }
        for (const n of [6, 7, 20]) {
          expect(nextRetry(n, now)).toEqual({ nextRunAt: nextPacificMidnight(now), attempts: 0 })
        }
      }),
      RUNS,
    )
  })

  /**
   * **Validates: Requirements 9.12, 14.12**
   */
  it('runs the initial attempt plus 5 retries per Pacific day, then waits for midnight and restarts', async () => {
    const ran: string[] = []
    const failing = new Set([makeJob(1).poolKey])
    const env = makeEnv({ runner: recordingRunner(ran, failing) })
    const job = makeJob(1)
    const midnight = nextPacificMidnight(NOON)

    const runTimes: number[] = []
    await env.scheduler.runFill(job)
    runTimes.push(env.clock.t)
    for (let guard = 0; guard < 20; guard++) {
      const next = (await env.store.readPools([job.poolKey]))[0]!.fillNextRunMs!
      if (next >= midnight) {
        expect(next).toBe(midnight)
        break
      }
      env.clock.t = next
      expect(await env.scheduler.drainDue(1)).toBe(1)
      runTimes.push(env.clock.t)
    }
    expect(ran).toHaveLength(6)
    expect(runTimes.slice(1).map((t, i) => t - runTimes[i]!)).toEqual(RETRY_DELAYS_S.map((s) => s * 1000))
    expect(pacificDay(runTimes[5]!)).toBe(pacificDay(NOON))

    // Nothing is due before midnight.
    env.clock.t = midnight - 1
    expect(await env.scheduler.drainDue(5)).toBe(0)

    // New Pacific day: the counter restarts, so the next failure waits 60 s again.
    env.clock.t = midnight
    expect(await env.scheduler.drainDue(5)).toBe(1)
    expect(ran).toHaveLength(7)
    expect((await env.store.readPools([job.poolKey]))[0]!.fillNextRunMs).toBe(midnight + 60_000)
  })

  it('the failure counter of an earlier Pacific day does not carry over', async () => {
    const env = makeEnv({ runner: recordingRunner([], new Set([makeJob(1).poolKey])) })
    const job = makeJob(1)
    await env.scheduler.runFill(job, { attempts: 5, attemptsDay: '2026-11-11' })
    expect((await env.store.readPools([job.poolKey]))[0]!.fillNextRunMs).toBe(NOON + 60_000)
  })

  it('the 6th failure of one day schedules the next Pacific midnight', async () => {
    const env = makeEnv({ runner: recordingRunner([], new Set([makeJob(1).poolKey])) })
    const job = makeJob(1)
    await env.scheduler.runFill(job, { attempts: 5, attemptsDay: pacificDay(NOON) })
    expect((await env.store.readPools([job.poolKey]))[0]!.fillNextRunMs).toBe(nextPacificMidnight(NOON))
  })

  /**
   * **Validates: Requirements 9.6, 14.12**
   */
  it('a quota-blocked fill waits for the next Pacific midnight without counting an attempt', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 5 }), async (priorAttempts) => {
        const blocked: NonNullable<SchedulerDeps['runner']> = async (j, runId, deps) => {
          await deps.store.releaseLease(j.poolKey, runId)
          return { kind: 'blocked' }
        }
        const env = makeEnv({ runner: blocked })
        const job = makeJob(1)
        const prior = { attempts: priorAttempts, attemptsDay: priorAttempts > 0 ? pacificDay(NOON) : null }
        await env.scheduler.runFill(job, prior)
        expect((await env.store.readPools([job.poolKey]))[0]!.fillNextRunMs).toBe(nextPacificMidnight(NOON))
        env.clock.t = nextPacificMidnight(NOON)
        const [row] = await env.store.dueFills(5)
        expect(row).toMatchObject({ reason: 'quota', attempts: priorAttempts })
      }),
      RUNS,
    )
  })
})
