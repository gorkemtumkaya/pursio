// Harnesses for the Check_Route and Fresh_Endpoint tests (spec: fresh, tasks 10.3 to 10.5,
// 12.4 to 12.8). Everything runs on the in-memory stores and the fake clock; no network.
import type { CheckKey, ChannelMute, FreshPath, FreshPathSkill } from '../../shared/types/fresh'
import type { ProviderConfig } from '../../shared/types/llm'
import type { GoalClass, VideoEvent } from '../../shared/types/video'
import { runFreshCheck } from '../../server/utils/fresh/check'
import type { FreshStore, PageRead } from '../../server/utils/fresh/check-store'
import type { MemoryPathRow } from '../../server/utils/fresh/check-store-memory'
import { windowSkillIds } from '../../server/utils/fresh/compose'
import type {
  CheckRouteDeps,
  FreshEndpointDeps,
  FreshScopePath,
  FreshUserData,
  RunFreshCheck,
} from '../../server/utils/fresh/handlers'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import type { VideoProvider } from '../../server/utils/video/provider'
import { createQuotaGate } from '../../server/utils/video/quota'
import {
  createFakeClock,
  createFakeFeedFetcher,
  createFakeFreshJudge,
  createFreshStores,
  type FakeClock,
  type FakeFeedFetcher,
  type FreshStores,
} from './fresh-fakes'
import { createFakeVideoProvider, type FakeJudge, type FakeVideoProvider } from './video-fakes'

export const ROUTE_CONFIG: ProviderConfig = { provider: 'openai', model: 'test-model', apiKey: 'test-model-key' }
export const ROUTE_SECRET = 'check-secret-for-tests-0123456789'
const JUDGE_PROMPT = 'Fresh judge test prompt'

/** Every FreshStore method name, for counting calls. */
export const STORE_WRITES: readonly string[] = ['cleanup', 'takeLease', 'releaseLease', 'storeCheck']

/** A FreshStore that records every method call by name and delegates to `inner`. */
export function countingStore(inner: FreshStore): { store: FreshStore; calls: string[] } {
  const calls: string[] = []
  const store: FreshStore = {
    cleanup: () => (calls.push('cleanup'), inner.cleanup()),
    activeHobbies: () => (calls.push('activeHobbies'), inner.activeHobbies()),
    checkStates: (keys) => (calls.push('checkStates'), inner.checkStates(keys)),
    takeLease: (key, runId) => (calls.push('takeLease'), inner.takeLease(key, runId)),
    releaseLease: (key, runId) => (calls.push('releaseLease'), inner.releaseLease(key, runId)),
    sources: (key) => (calls.push('sources'), inner.sources(key)),
    storedIds: (key, ids) => (calls.push('storedIds'), inner.storedIds(key, ids)),
    skillTitles: (hobby) => (calls.push('skillTitles'), inner.skillTitles(hobby)),
    storeCheck: (input) => (calls.push('storeCheck'), inner.storeCheck(input)),
    readPage: (input) => (calls.push('readPage'), inner.readPage(input)),
  }
  return { store, calls }
}

// ---------------------------------------------------------------------------
// Check_Route
// ---------------------------------------------------------------------------

export interface CheckStart {
  key: CheckKey
  runId: string
  startedMs: number
  /** Fake clock when the check started. */
  atMs: number
}

export interface CheckRouteHarness {
  stores: FreshStores
  clock: FakeClock
  feeds: FakeFeedFetcher
  /** The default fake provider; unused when `options.provider` replaces it. */
  provider: FakeVideoProvider
  judge: FakeJudge
  /** Every FreshStore call made through the route's store. */
  storeCalls: string[]
  logs: { type: string; checkKey?: string }[]
  /** Every Fresh_Check started, in order. */
  checks: CheckStart[]
  deps: CheckRouteDeps
}

export interface CheckRouteHarnessOptions {
  secret?: string
  clock?: FakeClock
  feeds?: FakeFeedFetcher
  provider?: VideoProvider
  judge?: FakeJudge
  /** Replaces `runFreshCheck`; it still gets recorded in `checks`. */
  runCheck?: RunFreshCheck
}

export function createCheckRouteHarness(options: CheckRouteHarnessOptions = {}): CheckRouteHarness {
  const clock = options.clock ?? createFakeClock()
  const stores = createFreshStores(clock)
  const feeds = options.feeds ?? createFakeFeedFetcher({ clock })
  const provider = createFakeVideoProvider()
  const judge = options.judge ?? createFakeFreshJudge()
  const counted = countingStore(stores.fresh)
  const logs: { type: string; checkKey?: string }[] = []
  const checks: CheckStart[] = []
  const inner: RunFreshCheck = options.runCheck ?? runFreshCheck
  let runs = 0
  const deps: CheckRouteDeps = {
    secret: options.secret ?? ROUTE_SECRET,
    now: () => clock.now(),
    timer: clock.timer,
    log: (entry) => logs.push({ ...entry }),
    run: {
      store: counted.store,
      runCheck: (key, runId, startedMs, checkDeps) => {
        checks.push({ key: { ...key }, runId, startedMs, atMs: clock.now() })
        return inner(key, runId, startedMs, checkDeps)
      },
      check: {
        gate: createQuotaGate(stores.pipeline),
        provider: options.provider ?? provider,
        adapter: judge,
        config: ROUTE_CONFIG,
        feedFetcher: feeds.fetch,
        judgePrompt: JUDGE_PROMPT,
      },
      newRunId: () => `00000000-0000-4000-8000-${String((runs += 1)).padStart(12, '0')}`,
    },
  }
  return { stores, clock, feeds, provider, judge, storeCalls: counted.calls, logs, checks, deps }
}

/** An active path row for `InMemoryFreshStore.setPaths`, opened `agoMs` before `nowMs`. */
export function activePath(hobby: string, language: string | null, nowMs: number, agoMs = 60_000): MemoryPathRow {
  return { hobby, language, archived: false, lastOpenedMs: nowMs - agoMs, progressUpdatedMs: null }
}

// ---------------------------------------------------------------------------
// Fresh_Endpoint
// ---------------------------------------------------------------------------

export interface FreshEndpointHarness {
  stores: FreshStores
  clock: FakeClock
  deps: FreshEndpointDeps
  /** Every FreshStore call made through the endpoint's store. */
  storeCalls: string[]
  /** Arguments of every `readPage` call. */
  reads: { checkKeys: CheckKey[]; poolKeys: string[] }[]
  /** Tokens passed to `loadUserData`. */
  userLoads: string[]
  /** Keys passed to the limiter. */
  limiterKeys: string[]
  logs: { type: string; durationMs?: number }[]
}

export interface FreshEndpointHarnessOptions {
  clock?: FakeClock
  /** Valid tokens with their user id and data ('fail' makes the user read throw). */
  users?: Record<string, { userId: string; data: FreshUserData | 'fail' }>
  /** Requests per window; default 60. */
  limit?: number
  /** Makes `readPage` throw. */
  failRead?: boolean
}

export function createFreshEndpointHarness(options: FreshEndpointHarnessOptions = {}): FreshEndpointHarness {
  const clock = options.clock ?? createFakeClock()
  const stores = createFreshStores(clock)
  const counted = countingStore(stores.fresh)
  const reads: { checkKeys: CheckKey[]; poolKeys: string[] }[] = []
  const userLoads: string[] = []
  const limiterKeys: string[] = []
  const logs: { type: string; durationMs?: number }[] = []
  const users = options.users ?? {}
  const limiter = createRateLimiter({ limit: options.limit ?? 60, windowMs: 60_000, now: () => clock.now() })
  const deps: FreshEndpointDeps = {
    verifyToken: async (token) => users[token]?.userId ?? null,
    verifyTimeoutMs: 1_000,
    limiter: {
      tryConsume: (key) => {
        limiterKeys.push(key)
        return limiter.tryConsume(key)
      },
    },
    store: {
      readPage: async (input): Promise<PageRead> => {
        reads.push({ checkKeys: input.checkKeys.map((k) => ({ ...k })), poolKeys: [...input.poolKeys] })
        if (options.failRead) {
          counted.calls.push('readPage')
          throw new Error('read_failed')
        }
        return counted.store.readPage(input)
      },
    },
    loadUserData: async (token) => {
      userLoads.push(token)
      const user = users[token]
      if (!user || user.data === 'fail') throw new Error('user_read_failed')
      return user.data
    },
    loadTimeoutMs: 1_000,
    now: () => clock.now(),
    log: (entry) => logs.push({ ...entry }),
  }
  return { stores, clock, deps, storeCalls: counted.calls, reads, userLoads, limiterKeys, logs }
}

/** A signed-in scope path built like `loadFreshUserData` does, from Skills in path order. */
export function userPath(input: {
  id: string
  hobby: string
  skills: FreshPathSkill[]
  currentSkillId: string | null
  goalClass?: GoalClass
  poolHobby?: string
}): FreshScopePath {
  const path: FreshPath = {
    id: input.id,
    hobbyId: input.hobby.toLowerCase(),
    hobby: input.hobby,
    goalClass: input.goalClass ?? 'none',
    currentSkillId: input.currentSkillId,
    windowSkillIds: windowSkillIds(input.skills, input.currentSkillId),
    skills: input.skills.map((s) => ({ ...s })),
    activeAt: null,
    colorSlot: 1,
    completedCount: 0,
  }
  return { path, poolHobby: input.poolHobby ?? input.hobby }
}

/** Signed-in data with no mutes or events unless given. */
export function userData(
  language: string,
  paths: FreshScopePath[],
  extra: { mutes?: ChannelMute[]; events?: VideoEvent[] } = {},
): FreshUserData {
  return { language, paths, mutes: extra.mutes ?? [], events: extra.events ?? [] }
}
