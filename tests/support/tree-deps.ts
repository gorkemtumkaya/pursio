// Fake `TreeDeps` for the Tree_Route tests (spec: accounts-cloud-save, tasks 4.5 to 4.10).
// Every dependency records its calls. No network, no real provider, no real Supabase.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PathSaveInput } from '../../shared/types/cloud'
import type { ErrorCode, Provider, ProviderConfig } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import type { DefaultConfigInput, TreeDeps } from '../../server/utils/llm-handlers'
import type { AdapterResult, ProviderAdapter } from '../../server/utils/providers/types'
import type { RateLimiter } from '../../server/utils/rate-limiter'
import { createTreeCache, type TreeCache } from '../../server/utils/tree-cache'

export const DEFAULTS: DefaultConfigInput = {
  provider: 'anthropic',
  model: 'default-model',
  apiKey: 'default-key-placeholder',
}

export const TOKEN = 'token-a'
export const USER_ID = 'user-a'

let cachedSample: SkillTree | undefined

/** The loaded Sample_Tree: a tree the Tree_Loader accepts. */
export function sampleTree(): SkillTree {
  cachedSample ??= readSampleTree()
  return cachedSample
}

function readSampleTree(): SkillTree {
  const path = fileURLToPath(new URL('../../data/sample-bouldering.json', import.meta.url))
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const loaded = loadSkillTree(raw)
  if (!loaded.ok) throw new Error('tests/support/tree-deps: the sample tree did not load')
  return loaded.value
}

/** A promise that never settles, for timeout cases. */
export function never<T>(): Promise<T> {
  return new Promise<T>(() => {})
}

export function bearer(token: string): string {
  return `Bearer ${token}`
}

/** Wraps a tree (or any candidate) the way a provider answers. */
export function treeOutput(tree: unknown): AdapterResult {
  return { ok: true, value: { result: tree } }
}

export const NOT_A_HOBBY_OUTPUT: AdapterResult = { ok: true, value: { result: { error: 'not_a_hobby' } } }

export type CallName = 'verify' | 'cache.get' | 'cache.set' | 'limiter' | 'adapter' | 'save'

export interface AdapterCall {
  provider: Provider
  hobby: string
  model: string
}

export interface SaveCall {
  token: string
  input: PathSaveInput
}

export interface TreeCalls {
  /** Every dependency call in order. */
  order: CallName[]
  /** Tokens given to `verifyToken`. */
  verify: string[]
  cacheGet: string[]
  cacheSet: string[]
  /** Keys given to `tryConsume`. */
  consume: string[]
  adapter: AdapterCall[]
  save: SaveCall[]
  log: { code: ErrorCode; provider: Provider; model: string }[]
}

export interface FakeTreeOptions {
  /** Access_Token to user id. Unknown tokens verify to null. Default: `{ [TOKEN]: USER_ID }`. */
  users?: Record<string, string>
  /** Replaces the map-backed verifier. */
  verifyToken?: TreeDeps['verifyToken']
  /** Replaces the default save, which returns `path-1`, `path-2`, ... */
  savePath?: TreeDeps['savePath']
  /** What every adapter answers. Default: the sample tree. */
  adapterResult?: (hobby: string, config: ProviderConfig) => AdapterResult | Promise<AdapterResult>
  /** Wrapped by the spy. Default: always allows. */
  limiter?: RateLimiter
  /** Wrapped by the spy. Default: a real Tree_Cache. */
  cache?: TreeCache
  defaults?: DefaultConfigInput
  timeoutMs?: number
  verifyTimeoutMs?: number
  saveTimeoutMs?: number
}

export interface FakeTree {
  deps: TreeDeps
  calls: TreeCalls
  /** The unwrapped cache, for seeding without counting. */
  cache: TreeCache
}

export function fakeTreeDeps(options: FakeTreeOptions = {}): FakeTree {
  const calls: TreeCalls = {
    order: [],
    verify: [],
    cacheGet: [],
    cacheSet: [],
    consume: [],
    adapter: [],
    save: [],
    log: [],
  }
  const users = options.users ?? { [TOKEN]: USER_ID }
  const innerCache = options.cache ?? createTreeCache()
  const innerLimiter: RateLimiter = options.limiter ?? { tryConsume: () => true }
  const defaultTree = options.adapterResult ? undefined : sampleTree()
  const adapterResult = options.adapterResult ?? (() => treeOutput(defaultTree))
  const verifyInner: TreeDeps['verifyToken'] =
    options.verifyToken ?? (async (token) => (Object.hasOwn(users, token) ? (users[token] ?? null) : null))
  const saveInner: TreeDeps['savePath'] = options.savePath ?? (async () => `path-${calls.save.length}`)

  const adapter = (provider: Provider): ProviderAdapter => ({
    async generateTree(hobby, config) {
      calls.order.push('adapter')
      calls.adapter.push({ provider, hobby, model: config.model })
      return adapterResult(hobby, config)
    },
    async testConnection() {
      return { ok: true, value: null }
    },
  })

  const deps: TreeDeps = {
    adapters: { anthropic: adapter('anthropic'), openai: adapter('openai') },
    systemPrompt: async () => 'system prompt',
    defaults: options.defaults ?? DEFAULTS,
    cache: {
      get(key) {
        calls.order.push('cache.get')
        calls.cacheGet.push(key)
        return innerCache.get(key)
      },
      set(key, value) {
        calls.order.push('cache.set')
        calls.cacheSet.push(key)
        innerCache.set(key, value)
      },
      get size() {
        return innerCache.size
      },
    },
    limiter: {
      tryConsume(key) {
        calls.order.push('limiter')
        calls.consume.push(key)
        return innerLimiter.tryConsume(key)
      },
    },
    timeoutMs: options.timeoutMs ?? 1_000,
    verifyToken(token, signal) {
      calls.order.push('verify')
      calls.verify.push(token)
      return verifyInner(token, signal)
    },
    savePath(token, input, signal) {
      calls.order.push('save')
      calls.save.push({ token, input })
      return saveInner(token, input, signal)
    },
    verifyTimeoutMs: options.verifyTimeoutMs ?? 1_000,
    saveTimeoutMs: options.saveTimeoutMs ?? 1_000,
    log: (entry) => {
      calls.log.push(entry)
    },
  }

  return { deps, calls, cache: innerCache }
}
