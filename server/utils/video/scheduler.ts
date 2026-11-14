/**
 * Scheduler: single run per Pool_Key (Run_Lease), queued fills (`video_fills` rows), retry
 * schedule and the Current_Window. Every background task goes through the injected
 * `background` dependency. When it returns false (always on Vercel) the work is written as
 * a due row and the drain runs it later. There is no fire-and-forget fallback.
 */
import type { Level, SkillNode, SkillTree } from '../../../shared/types/skill-tree'
import { nextPacificMidnight, pacificDay } from '../../../shared/utils/pacific-time'
import { languageCode, poolKey } from '../../../shared/utils/video-normalize'
import { runPipeline, type PipelineDeps, type PipelineJob, type PipelineOutcome } from './pipeline'
import {
  LEASE_TIMEOUT_S,
  type FillReason,
  type FillRow,
  type PoolRead,
  type StoredFillJob,
} from './pipeline-store'
import { isStale } from './pool'

/** A fill job is a PipelineJob; `persist` is set only inside a Signed_In_User request and never stored. */
export type FillJob = PipelineJob

export const INLINE_FILLS_PER_REQUEST = 2
export const DRAIN_AFTER_REQUEST = 2
export const DRAIN_ROUTE_MAX = 5
/** The current Skill and the next 2. */
export const WINDOW_SIZE = 3
/** Waits before retry 1 to 5 of one Pool_Key on one Pacific_Day (seconds). */
export const RETRY_DELAYS_S: readonly number[] = [60, 120, 240, 480, 960]

/**
 * Accepts a task and returns true, or returns false when no background execution is
 * available, in which case the caller writes a due row. The task is lazy: it starts only
 * when the implementation awaits it, so a refused task never runs.
 */
export type BackgroundFn = (task: Promise<unknown>) => boolean

export type RunOutcome = PipelineOutcome | { kind: 'busy' }

export interface SchedulerDeps {
  /** Store, provider, adapter and quota used by every run. */
  pipeline: PipelineDeps
  background: BackgroundFn
  /** Epoch ms. Defaults to Date.now. */
  now?: () => number
  newRunId?: () => string
  /** Replaces runPipeline (tests). */
  runner?: typeof runPipeline
}

export interface FillPrior {
  attempts: number
  attemptsDay: string | null
}

export interface Scheduler {
  /** Starts at most one background run for the key. Returns the state to report. */
  requestFill(job: FillJob): Promise<{ inProgress: boolean }>
  /** Takes the lease and runs the pipeline once. Never throws. */
  runFill(job: FillJob, prior?: FillPrior): Promise<RunOutcome>
  /** At most 2 jobs go to background() (current Skill first); the rest are queued. */
  fillWindow(jobs: readonly FillJob[]): Promise<void>
  /** Runs due queued fills, at most `max`. Returns how many ran. */
  drainDue(max: number): Promise<number>
}

export interface RetryPlan {
  nextRunAt: number
  /** Failure count to store with the row. 0 when the wait is for the next Pacific midnight. */
  attempts: number
}

/**
 * Plan after a failed run. `attempts` is the failure count of this Pool_Key on the current
 * Pacific_Day, including the failure that just happened. Failures 1 to 5 wait 60, 120, 240,
 * 480 and 960 s, so at most 5 retries start per day. After failure 6 the fill waits for the
 * next Pacific midnight, where the count restarts (Req 9.12).
 */
export function nextRetry(attempts: number, now: number): RetryPlan {
  const delay = RETRY_DELAYS_S[attempts - 1]
  if (attempts >= 1 && delay !== undefined) {
    return { nextRunAt: now + delay * 1000, attempts }
  }
  return { nextRunAt: nextPacificMidnight(now), attempts: 0 }
}

export interface WindowSkill {
  node: SkillNode
  /** Level of the section that contains the Skill. */
  level: Level
}

/** The current Skill and the next 2 in path order; fewer near the end; empty for an unknown id. */
export function currentWindow(tree: SkillTree, currentSkillId: string): WindowSkill[] {
  const all: WindowSkill[] = tree.sections.flatMap((section) =>
    section.nodes.map((node) => ({ node, level: section.level })),
  )
  const start = all.findIndex((entry) => entry.node.id === currentSkillId)
  if (start < 0) return []
  return all.slice(start, start + WINDOW_SIZE)
}

/** Builds the fill job of a stored Skill. The language is reduced to its Language_Code. */
export function fillJobFor(
  hobby: string,
  entry: WindowSkill,
  language: string | null | undefined,
  persist?: (queries: string[]) => Promise<void>,
): FillJob {
  const code = languageCode(language)
  return {
    poolKey: poolKey({ hobby, skillTitle: entry.node.title, level: entry.level, language: code }),
    hobby,
    skillTitle: entry.node.title,
    skillDescription: entry.node.description,
    quests: [...entry.node.quests],
    level: entry.level,
    language: code,
    searchQueries: entry.node.searchQueries ? [...entry.node.searchQueries] : null,
    quickTip: entry.node.quickTip ?? false,
    ...(persist ? { persist } : {}),
  }
}

/** A Promise-shaped task that starts `run` on first use, so a refused task never runs. */
export function lazyTask(run: () => Promise<unknown>): Promise<void> {
  let started: Promise<void> | undefined
  const start = (): Promise<void> => (started ??= run().then(() => undefined))
  return {
    then: (onFulfilled, onRejected) => start().then(onFulfilled, onRejected),
    catch: (onRejected) => start().catch(onRejected),
    finally: (onFinally) => start().finally(onFinally),
    [Symbol.toStringTag]: 'Promise',
  }
}

function stored(job: FillJob): StoredFillJob {
  return {
    poolKey: job.poolKey,
    hobby: job.hobby,
    skillTitle: job.skillTitle,
    skillDescription: job.skillDescription,
    quests: [...job.quests],
    level: job.level,
    language: job.language,
    searchQueries: job.searchQueries ? [...job.searchQueries] : null,
    quickTip: job.quickTip,
  }
}

/** Fixed labels only: no keys, bodies or messages (Req 9.13). */
function logFailure(poolKeyValue: string, type: string): void {
  console.error('[video]', { poolKey: poolKeyValue, type })
}

type Assessment = 'fresh' | 'in_progress' | 'backoff' | 'needs_fill'

/** What a request must do for one key, decided on the store clock. */
function assess(read: PoolRead): Assessment {
  if (read.pool && !isStale((read.nowMs - read.pool.storedAt) / 1000, read.pool.videos.length)) return 'fresh'
  if (read.leaseActive) return 'in_progress'
  if (read.fillNextRunMs !== null && read.fillNextRunMs > read.nowMs) return 'backoff'
  return 'needs_fill'
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { store } = deps.pipeline
  const now = deps.now ?? Date.now
  const newRunId = deps.newRunId ?? (() => crypto.randomUUID())
  const runner = deps.runner ?? runPipeline

  async function queue(job: FillJob, reason: FillReason): Promise<void> {
    await store.upsertFill({
      poolKey: job.poolKey,
      job: stored(job),
      reason,
      attempts: 0,
      attemptsDay: null,
      nextRunAt: now(),
    })
  }

  async function queueSafely(job: FillJob, reason: FillReason): Promise<void> {
    try {
      await queue(job, reason)
    }
    catch {
      logFailure(job.poolKey, 'queue_failed')
    }
  }

  async function runFill(job: FillJob, prior?: FillPrior): Promise<RunOutcome> {
    const runId = newRunId()
    try {
      if (!(await store.takeLease(job.poolKey, runId))) return { kind: 'busy' }
    }
    catch {
      logFailure(job.poolKey, 'lease_failed')
      return { kind: 'error' }
    }

    // A run killed by the platform leaves this row; it becomes due when the lease expires.
    const startedAt = now()
    try {
      await store.upsertFill({
        poolKey: job.poolKey,
        job: stored(job),
        reason: 'running',
        attempts: prior?.attempts ?? 0,
        attemptsDay: prior?.attemptsDay ?? null,
        nextRunAt: startedAt + LEASE_TIMEOUT_S * 1000,
      })
    }
    catch {
      logFailure(job.poolKey, 'running_row_failed')
      try {
        await store.releaseLease(job.poolKey, runId)
      }
      catch {
        // The lease expires by itself.
      }
      return { kind: 'error' }
    }

    const outcome = await runner(job, runId, deps.pipeline)
    try {
      await settle(job, outcome, prior)
    }
    catch {
      // The running row stays and becomes due when the lease expires.
      logFailure(job.poolKey, 'settle_failed')
    }
    return outcome
  }

  /** Writes the row that follows a finished run. A stored pool already deleted its rows. */
  async function settle(job: FillJob, outcome: PipelineOutcome, prior?: FillPrior): Promise<void> {
    const at = now()
    const today = pacificDay(at)
    const attemptsToday = prior && prior.attemptsDay === today ? prior.attempts : 0
    switch (outcome.kind) {
      case 'stored':
      case 'lease_lost':
        return
      case 'blocked':
        // Waiting for the quota is not an attempt (Req 9.6).
        await store.upsertFill({
          poolKey: job.poolKey,
          job: stored(job),
          reason: 'quota',
          attempts: attemptsToday,
          attemptsDay: attemptsToday > 0 ? today : null,
          nextRunAt: nextPacificMidnight(at),
        })
        return
      case 'provider_failure':
      case 'model_failure':
      case 'error': {
        logFailure(job.poolKey, outcome.kind)
        const plan = nextRetry(attemptsToday + 1, at)
        await store.upsertFill({
          poolKey: job.poolKey,
          job: stored(job),
          reason: 'retry',
          attempts: plan.attempts,
          attemptsDay: plan.attempts > 0 ? today : null,
          nextRunAt: plan.nextRunAt,
        })
      }
    }
  }

  async function requestFill(job: FillJob): Promise<{ inProgress: boolean }> {
    try {
      const [read] = await store.readPools([job.poolKey])
      if (!read) return { inProgress: false }
      const state = assess(read)
      if (state === 'fresh' || state === 'backoff') return { inProgress: false }
      if (state === 'in_progress') return { inProgress: true }
      if (!deps.background(lazyTask(() => runFill(job)))) {
        await queue(job, read.pool ? 'stale' : 'new')
      }
      return { inProgress: true }
    }
    catch {
      logFailure(job.poolKey, 'request_failed')
      return { inProgress: false }
    }
  }

  async function fillWindow(jobs: readonly FillJob[]): Promise<void> {
    // Keys without a Fresh_Pool, no active run and no wait, in the order given (current Skill first).
    const wanted: Array<{ job: FillJob; reason: FillReason }> = []
    for (let i = 0; i < jobs.length; i += 2) {
      const chunk = jobs.slice(i, i + 2)
      let reads: PoolRead[]
      try {
        reads = await store.readPools(chunk.map((j) => j.poolKey))
      }
      catch {
        for (const job of chunk) logFailure(job.poolKey, 'request_failed')
        continue
      }
      for (const job of chunk) {
        const read = reads.find((r) => r.poolKey === job.poolKey)
        if (read && assess(read) === 'needs_fill') {
          wanted.push({ job, reason: read.pool ? 'stale' : 'new' })
        }
      }
    }

    const inline = wanted.slice(0, INLINE_FILLS_PER_REQUEST)
    const rest = wanted.slice(INLINE_FILLS_PER_REQUEST)

    if (inline.length > 0) {
      const task = lazyTask(async () => {
        for (const { job } of inline) await runFill(job)
      })
      if (!deps.background(task)) rest.unshift(...inline)
    }
    for (const { job, reason } of rest) await queueSafely(job, reason)
  }

  async function drainDue(max: number): Promise<number> {
    let rows: FillRow[]
    try {
      rows = await store.dueFills(max)
    }
    catch {
      logFailure('drain', 'due_failed')
      return 0
    }
    let ran = 0
    for (const row of rows.slice(0, Math.max(max, 0))) {
      try {
        const [read] = await store.readPools([row.poolKey])
        if (read && assess(read) === 'fresh') {
          await store.deleteFill(row.poolKey)
          continue
        }
      }
      catch {
        logFailure(row.poolKey, 'drain_read_failed')
        continue
      }
      const outcome = await runFill(row.job, { attempts: row.attempts, attemptsDay: row.attemptsDay })
      if (outcome.kind !== 'busy') ran += 1
    }
    return ran
  }

  return { requestFill, runFill, fillWindow, drainDue }
}
