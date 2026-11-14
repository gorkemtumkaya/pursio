// Property tests for handleTreeRequest (spec: accounts-cloud-save, Properties 12 to 15).
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import type { Provider, StartLevel } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { handleTreeRequest } from '../../server/utils/llm-handlers'
import { cacheKey } from '../../server/utils/tree-cache'
import { arbValidTree } from '../arbitraries'
import { DEFAULTS, fakeTreeDeps, never, treeOutput, withVideoFields, type FakeTreeOptions } from '../support/tree-deps'
import type { AdapterResult } from '../../server/utils/providers/types'

const RUNS = { numRuns: 100 }
const SHORT_MS = 5

const arbToken = fc.stringMatching(/^[A-Za-z0-9._-]{1,40}$/)
const arbScheme = fc.constantFrom('Bearer', 'bearer', 'BEARER')
const arbStartLevel = fc.constantFrom<StartLevel>('new', 'some', 'serious')
const arbOptionalLevel = fc.option(arbStartLevel, { nil: undefined })
const arbProvider = fc.constantFrom<Provider>('anthropic', 'openai')
const arbModel = fc.stringMatching(/^[a-z0-9.-]{1,30}$/)
const arbPad = fc.constantFrom('', ' ', '  ', '\t', ' \n')

/** A hobby as sent, with its trimmed form of 1 to 60 characters. */
const arbHobby: fc.Arbitrary<{ raw: string; trimmed: string }> = fc
  .tuple(
    arbPad,
    fc
      .string({ minLength: 1, maxLength: 60 })
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    arbPad,
  )
  .map(([before, trimmed, after]) => ({ raw: `${before}${trimmed}${after}`, trimmed }))

type ConfigChoice = { kind: 'default' } | { kind: 'user'; provider: Provider; model: string; key: string }

const arbConfig: fc.Arbitrary<ConfigChoice> = fc.oneof(
  fc.constant<ConfigChoice>({ kind: 'default' }),
  fc.record({
    kind: fc.constant('user' as const),
    provider: arbProvider,
    model: arbModel,
    key: fc.stringMatching(/^[a-z0-9]{1,20}$/),
  }),
)

function effective(config: ConfigChoice): { provider: Provider; model: string } {
  if (config.kind === 'user') return { provider: config.provider, model: config.model }
  return { provider: 'anthropic', model: DEFAULTS.model }
}

function requestBody(hobby: string, level: StartLevel | undefined, config: ConfigChoice): Record<string, unknown> {
  const body: Record<string, unknown> = { hobby }
  if (level !== undefined) body.level = level
  if (config.kind === 'user') {
    body.provider = config.provider
    body.model = config.model
  }
  return body
}

function headerKey(config: ConfigChoice): string | undefined {
  return config.kind === 'user' ? config.key : undefined
}

const arbVideoTree = arbValidTree.map(withVideoFields)

function loaded(tree: SkillTree): SkillTree {
  const result = loadSkillTree(tree)
  if (!result.ok) throw new Error('arbValidTree gave a tree the Tree_Loader rejects')
  return result.value
}

// Feature: accounts-cloud-save, Property 12: An unauthorized request does nothing else
// **Validates: Requirements 9.1, 9.2**
describe('Property 12: An unauthorized request does nothing else', () => {
  type BadAuth =
    | { kind: 'missing' }
    | { kind: 'malformed'; header: string }
    | { kind: 'rejected' | 'empty_id' | 'throws' | 'timeout'; scheme: string; token: string }

  const arbMalformed = fc.oneof(
    fc.constantFrom(
      '',
      'Bearer',
      'Bearer ',
      'Basic abc',
      'Token abc',
      'abc',
      'Bearer a b',
      'Bearerabc',
      ' Bearer abc',
      'Bearer abc ',
    ),
    fc.string().filter((s) => !/^bearer /i.test(s)),
  )

  const arbBadAuth: fc.Arbitrary<BadAuth> = fc.oneof(
    fc.constant<BadAuth>({ kind: 'missing' }),
    arbMalformed.map((header): BadAuth => ({ kind: 'malformed', header })),
    fc.record({
      kind: fc.constantFrom('rejected' as const, 'empty_id' as const, 'throws' as const, 'timeout' as const),
      scheme: arbScheme,
      token: arbToken,
    }),
  )

  const arbBody: fc.Arbitrary<unknown> = fc.oneof(
    fc.anything(),
    fc.tuple(arbHobby, arbOptionalLevel, arbConfig).map(([hobby, level, config]) => requestBody(hobby.raw, level, config)),
  )

  it('answers 401 and calls nothing but the verifier', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbBody,
        fc.option(fc.string(), { nil: undefined }),
        arbBadAuth,
        async (body, key, auth) => {
          const fake = fakeTreeDeps({
            verifyTimeoutMs: SHORT_MS,
            verifyToken: async () => {
              if (auth.kind === 'empty_id') return ''
              if (auth.kind === 'throws') throw new Error('verifier down')
              if (auth.kind === 'timeout') return never<string | null>()
              return null
            },
          })
          const authorization =
            auth.kind === 'missing' ? undefined : auth.kind === 'malformed' ? auth.header : `${auth.scheme} ${auth.token}`

          const response = await handleTreeRequest({ body, headerKey: key, authorization }, fake.deps)

          expect(response).toEqual({ status: 401, body: { error: 'unauthorized' } })
          expect(fake.calls.cacheGet).toEqual([])
          expect(fake.calls.cacheSet).toEqual([])
          expect(fake.calls.consume).toEqual([])
          expect(fake.calls.adapter).toEqual([])
          expect(fake.calls.save).toEqual([])
          const verified = auth.kind === 'missing' || auth.kind === 'malformed' ? [] : [auth.token]
          expect(fake.calls.verify).toEqual(verified)
          expect(fake.calls.order).toEqual(verified.map(() => 'verify'))
        },
      ),
      RUNS,
    )
  })

  it('checks the token before anything else on an authorized request', async () => {
    await fc.assert(
      fc.asyncProperty(arbBody, fc.option(fc.string(), { nil: undefined }), arbToken, async (body, key, token) => {
        const fake = fakeTreeDeps({ users: { [token]: 'user-1' } })
        await handleTreeRequest({ body, headerKey: key, authorization: `Bearer ${token}` }, fake.deps)
        expect(fake.calls.order[0]).toBe('verify')
        expect(fake.calls.verify).toEqual([token])
      }),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 13: Only the verified user id is used
// **Validates: Requirements 9.4, 9.7**
describe('Property 13: Only the verified user id is used', () => {
  const arbSpoof = fc.record(
    {
      userId: fc.string(),
      user_id: fc.string(),
      uid: fc.string(),
      id: fc.string(),
      sub: fc.string(),
      token: fc.string(),
      user: fc.record({ id: fc.string() }),
    },
    { requiredKeys: [] },
  )

  it('takes the limiter key and the save token from the verified token only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hobby: arbHobby,
          level: arbOptionalLevel,
          config: arbConfig,
          spoof: arbSpoof,
          scheme: arbScheme,
          token: arbToken,
          userId: fc.uuid(),
          otherUserId: fc.uuid(),
          tree: arbVideoTree,
          cachedModel: fc.option(arbModel, { nil: undefined }),
        }),
        async ({ hobby, level, config, spoof, scheme, token, userId, otherUserId, tree, cachedModel }) => {
          const expectedTree = loaded(tree)
          const expectedLevel: StartLevel = level ?? 'new'
          const { provider, model } = effective(config)
          const fake = fakeTreeDeps({
            users: { [token]: userId, [`${token}-other`]: otherUserId },
            adapterResult: () => treeOutput(tree),
          })
          if (cachedModel !== undefined) {
            fake.cache.set(cacheKey(hobby.trimmed, expectedLevel, provider, model), {
              tree: expectedTree,
              model: cachedModel,
            })
          }
          const expectedModel = cachedModel ?? model
          const body = { ...spoof, ...requestBody(hobby.raw, level, config) }

          const response = await handleTreeRequest(
            { body, headerKey: headerKey(config), authorization: `${scheme} ${token}` },
            fake.deps,
          )

          expect(response).toEqual({
            status: 200,
            body: { tree: expectedTree, model: expectedModel, pathId: 'path-1' },
          })
          expect(fake.calls.verify).toEqual([token])
          expect(fake.calls.order[0]).toBe('verify')
          const billable = config.kind === 'default' && cachedModel === undefined
          expect(fake.calls.consume).toEqual(billable ? [userId] : [])
          expect(fake.calls.adapter).toHaveLength(cachedModel === undefined ? 1 : 0)
          expect(fake.calls.save).toEqual([
            {
              token,
              input: { hobby: hobby.trimmed, level: expectedLevel, tree: expectedTree, model: expectedModel, goalClass: 'none' },
            },
          ])
        },
      ),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 14: Only billable generations are counted
// **Validates: Requirements 9.5**
describe('Property 14: Only billable generations are counted', () => {
  type Step =
    | { kind: 'valid'; hobby: string; level: StartLevel; config: ConfigChoice; token: string }
    | { kind: 'invalid'; body: unknown; key: string | undefined; token: string }

  const arbPoolHobby = fc.constantFrom(
    'guitar',
    'Guitar',
    ' guitar ',
    'chess',
    'rock climbing',
    'rock   climbing',
    'ROCK CLIMBING',
    'sewing',
  )
  const arbUser = fc.constantFrom('token-1', 'token-2')
  /** Includes the default model, so a User_Config request can fill the entry a Default_Config request reads. */
  const arbPoolConfig: fc.Arbitrary<ConfigChoice> = fc.oneof(
    fc.constant<ConfigChoice>({ kind: 'default' }),
    fc.record({
      kind: fc.constant('user' as const),
      provider: arbProvider,
      model: fc.constantFrom(DEFAULTS.model, 'm-1'),
      key: fc.constant('own-key-placeholder'),
    }),
  )

  /** Invalid with or without an own key. */
  const arbInvalidBody: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(
    {},
    null,
    'guitar',
    ['guitar'],
    { hobby: '' },
    { hobby: '   ' },
    { hobby: 'x'.repeat(61) },
    { hobby: 42 },
    { hobby: 'guitar', level: 'expert', provider: 'openai', model: 'm-1' },
    { hobby: 'guitar', level: null, provider: 'openai', model: 'm-1' },
  )
  /** Invalid only as a User_Config request. */
  const arbInvalidUserBody: fc.Arbitrary<unknown> = fc.constantFrom<unknown>(
    { hobby: 'guitar' },
    { hobby: 'guitar', provider: 'nope', model: 'm-1' },
    { hobby: 'guitar', provider: 'openai', model: '' },
    { hobby: 'guitar', provider: 'openai', model: 'm'.repeat(101) },
  )

  const arbStep: fc.Arbitrary<Step> = fc.oneof(
    {
      weight: 4,
      arbitrary: fc.record({
        kind: fc.constant('valid' as const),
        hobby: arbPoolHobby,
        level: arbStartLevel,
        config: arbPoolConfig,
        token: arbUser,
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('invalid' as const),
        body: arbInvalidBody,
        key: fc.constantFrom(undefined, '', 'own-key-placeholder'),
        token: arbUser,
      }),
    },
    {
      weight: 1,
      arbitrary: fc.record({
        kind: fc.constant('invalid' as const),
        body: arbInvalidUserBody,
        key: fc.constant('own-key-placeholder'),
        token: arbUser,
      }),
    },
  )

  it('calls tryConsume once per valid Default_Config request that missed the cache', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbStep, { maxLength: 25 }), async (steps) => {
        const fake = fakeTreeDeps({ users: { 'token-1': 'user-1', 'token-2': 'user-2' } })
        const users: Record<string, string> = { 'token-1': 'user-1', 'token-2': 'user-2' }
        const cached = new Set<string>()
        const expectedConsume: string[] = []
        let misses = 0

        for (const step of steps) {
          const authorization = `Bearer ${step.token}`
          if (step.kind === 'invalid') {
            const response = await handleTreeRequest({ body: step.body, headerKey: step.key, authorization }, fake.deps)
            expect(response).toEqual({ status: 400, body: { error: 'invalid_input' } })
            continue
          }
          const { provider, model } = effective(step.config)
          const key = cacheKey(step.hobby, step.level, provider, model)
          if (!cached.has(key)) {
            cached.add(key)
            misses += 1
            if (step.config.kind === 'default') expectedConsume.push(users[step.token] ?? '')
          }
          const response = await handleTreeRequest(
            {
              body: requestBody(step.hobby, step.level, step.config),
              headerKey: headerKey(step.config),
              authorization,
            },
            fake.deps,
          )
          expect(response.status).toBe(200)
        }

        expect(fake.calls.consume).toEqual(expectedConsume)
        expect(fake.calls.adapter).toHaveLength(misses)
      }),
      RUNS,
    )
  })
})

// Feature: accounts-cloud-save, Property 15: A save failure keeps the tree for a free retry
// **Validates: Requirements 9.10**
describe('Property 15: A save failure keeps the tree for a free retry', () => {
  it('answers 502 save_failed, then 200 with a pathId without generating or counting again', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hobby: arbHobby,
          level: arbOptionalLevel,
          config: arbConfig,
          mode: fc.constantFrom('throws' as const, 'timeout' as const, 'empty' as const),
          tree: arbVideoTree,
        }),
        async ({ hobby, level, config, mode, tree }) => {
          const expectedTree = loaded(tree)
          let failing = true
          const fake = fakeTreeDeps({
            users: { 'token-1': 'user-1' },
            adapterResult: () => treeOutput(tree),
            saveTimeoutMs: SHORT_MS,
            savePath: async () => {
              if (!failing) return 'path-ok'
              if (mode === 'throws') throw new Error('database down')
              if (mode === 'timeout') return never<string>()
              return ''
            },
          })
          const input = {
            body: requestBody(hobby.raw, level, config),
            headerKey: headerKey(config),
            authorization: 'Bearer token-1',
          }

          const first = await handleTreeRequest(input, fake.deps)
          expect(first).toEqual({ status: 502, body: { error: 'save_failed' } })
          expect(fake.calls.adapter).toHaveLength(1)
          const consumed = config.kind === 'default' ? ['user-1'] : []
          expect(fake.calls.consume).toEqual(consumed)

          failing = false
          const second = await handleTreeRequest(input, fake.deps)
          expect(second).toEqual({
            status: 200,
            body: { tree: expectedTree, model: effective(config).model, pathId: 'path-ok' },
          })
          expect(fake.calls.adapter).toHaveLength(1)
          expect(fake.calls.consume).toEqual(consumed)
          expect(fake.calls.save).toHaveLength(2)
        },
      ),
      RUNS,
    )
  })
})

// Bug condition exploration (spec: tree-api-502-on-new-path, task 1, Property 1).
// Expected to FAIL on unfixed code: error log entries carry no stage or reason.
describe('handleTreeRequest error log names the failing stage', () => {
  const SENTINEL_KEY = 'SENTINEL_KEY_9f3a'
  const SENTINEL_TOKEN = 'SENTINEL_TOKEN_71bc'
  const SENTINEL_PROMPT = 'SENTINEL_PROMPT_c20d'
  const SENTINEL_BODY = 'SENTINEL_BODY_5e8a'
  const SENTINELS = [SENTINEL_KEY, SENTINEL_TOKEN, SENTINEL_PROMPT, SENTINEL_BODY]
  const EXPLORE_RUNS = { numRuns: 20 }

  type CaseName = 'provider_auth' | 'prompt_missing' | 'invalid_trees' | 'save_throws' | 'save_timeout'
  const arbCase = fc.constantFrom<CaseName>('provider_auth', 'prompt_missing', 'invalid_trees', 'save_throws', 'save_timeout')

  const EXPECTED: Record<CaseName, { code: string; stage: string; reason?: string }> = {
    provider_auth: { code: 'provider_auth', stage: 'provider_call', reason: 'auth' },
    prompt_missing: { code: 'provider_error', stage: 'prompt_load', reason: 'prompt_missing' },
    invalid_trees: { code: 'generation_failed', stage: 'tree_validation' },
    save_throws: { code: 'save_failed', stage: 'path_save' },
    save_timeout: { code: 'save_failed', stage: 'path_save', reason: 'timeout' },
  }

  function optionsFor(name: CaseName): FakeTreeOptions {
    const users = { [SENTINEL_TOKEN]: 'user-1' }
    switch (name) {
      case 'provider_auth':
        return { users, adapterResult: (): AdapterResult => ({ ok: false, error: 'provider_auth' }) }
      case 'invalid_trees':
        return { users, adapterResult: () => treeOutput({ nodes: SENTINEL_BODY }) }
      case 'save_throws':
        return {
          users,
          savePath: async () => {
            throw new Error(`rpc failed ${SENTINEL_BODY}`)
          },
        }
      case 'save_timeout':
        return { users, saveTimeoutMs: SHORT_MS, savePath: () => never<string>() }
      default:
        return { users }
    }
  }

  async function run(name: CaseName, hobby: string) {
    const fake = fakeTreeDeps(optionsFor(name))
    if (name === 'prompt_missing') {
      fake.deps.systemPrompt = async () => {
        throw new Error(`ENOENT ${SENTINEL_PROMPT}`)
      }
    }
    const input = {
      body: { hobby, provider: 'anthropic', model: 'm-1' },
      headerKey: SENTINEL_KEY,
      authorization: `Bearer ${SENTINEL_TOKEN}`,
    }
    if (name !== 'save_timeout') return { fake, response: await handleTreeRequest(input, fake.deps) }
    vi.useFakeTimers()
    try {
      const pending = handleTreeRequest(input, fake.deps)
      await vi.advanceTimersByTimeAsync(SHORT_MS + 1)
      return { fake, response: await pending }
    } finally {
      vi.useRealTimers()
    }
  }

  it('logs one entry with stage and reason, keeps status and code, and leaks no secret', async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, arbHobby, async (name, hobby) => {
        const expected = EXPECTED[name]
        const { fake, response } = await run(name, hobby.raw)

        // Status and error code equal the original mapping.
        expect(response.status).toBe(502)
        expect(response.body).toEqual({ error: expected.code })

        // Exactly one log entry, with stage and a reason.
        expect(fake.calls.log).toHaveLength(1)
        const entry: Record<string, unknown> = { ...fake.calls.log[0] }
        expect(entry.code).toBe(expected.code)
        expect(entry.stage).toBe(expected.stage)
        if (expected.reason !== undefined) expect(entry.reason).toBe(expected.reason)
        else expect(typeof entry.reason === 'string' && entry.reason !== '').toBe(true)

        // No sentinel key, token, prompt or response body in the logged JSON.
        const logged = JSON.stringify(fake.calls.log)
        for (const sentinel of SENTINELS) expect(logged).not.toContain(sentinel)
      }),
      EXPLORE_RUNS,
    )
  })
})

// Preservation (spec: tree-api-502-on-new-path, task 2, Property 3).
// Observed on unfixed code; asserts status, body, cache writes and limiter calls, never log fields.
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
describe('Property 3: Preservation of status, body, cache and limiter effects', () => {
  type Outcome =
    | 'tree'
    | 'not_a_hobby'
    | 'provider_auth'
    | 'provider_error'
    | 'adapter_throws'
    | 'bad_output_twice'
    | 'invalid_twice'
    | 'invalid_then_tree'
    | 'bad_output_then_tree'
    | 'hangs'

  const arbOutcome = fc.constantFrom<Outcome>(
    'tree',
    'not_a_hobby',
    'provider_auth',
    'provider_error',
    'adapter_throws',
    'bad_output_twice',
    'invalid_twice',
    'invalid_then_tree',
    'bad_output_then_tree',
    'hangs',
  )

  const EXPECTED: Record<Outcome, { status: number; error?: string; adapterCalls: number }> = {
    tree: { status: 200, adapterCalls: 1 },
    not_a_hobby: { status: 422, error: 'not_a_hobby', adapterCalls: 1 },
    provider_auth: { status: 502, error: 'provider_auth', adapterCalls: 1 },
    provider_error: { status: 502, error: 'provider_error', adapterCalls: 1 },
    adapter_throws: { status: 502, error: 'provider_error', adapterCalls: 1 },
    bad_output_twice: { status: 502, error: 'generation_failed', adapterCalls: 2 },
    invalid_twice: { status: 502, error: 'generation_failed', adapterCalls: 2 },
    invalid_then_tree: { status: 200, adapterCalls: 2 },
    bad_output_then_tree: { status: 200, adapterCalls: 2 },
    hangs: { status: 504, error: 'timeout', adapterCalls: 1 },
  }

  function adapterFor(outcome: Outcome, tree: unknown): (attempt: number) => AdapterResult | Promise<AdapterResult> {
    return (attempt) => {
      switch (outcome) {
        case 'tree':
          return treeOutput(tree)
        case 'not_a_hobby':
          return { ok: true, value: { result: { error: 'not_a_hobby' } } }
        case 'provider_auth':
          return { ok: false, error: 'provider_auth' }
        case 'provider_error':
          return { ok: false, error: 'provider_error' }
        case 'adapter_throws':
          throw new Error('network down')
        case 'bad_output_twice':
          return { ok: false, error: 'bad_output' }
        case 'invalid_twice':
          return treeOutput({ nodes: 'not a tree' })
        case 'invalid_then_tree':
          return attempt === 1 ? treeOutput({ nodes: 'not a tree' }) : treeOutput(tree)
        case 'bad_output_then_tree':
          return attempt === 1 ? { ok: false, error: 'bad_output' } : treeOutput(tree)
        case 'hangs':
          return never<AdapterResult>()
      }
    }
  }

  it('maps every adapter outcome to the observed status, body, cache write and limiter use', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hobby: arbHobby,
          level: arbOptionalLevel,
          config: arbConfig,
          outcome: arbOutcome,
          tree: arbVideoTree,
          token: arbToken,
          scheme: arbScheme,
          userId: fc.uuid(),
        }),
        async ({ hobby, level, config, outcome, tree, token, scheme, userId }) => {
          const expectedTree = loaded(tree)
          const expected = EXPECTED[outcome]
          const { provider, model } = effective(config)
          let attempt = 0
          const next = adapterFor(outcome, tree)
          const fake = fakeTreeDeps({
            users: { [token]: userId },
            timeoutMs: SHORT_MS,
            adapterResult: () => next(++attempt),
          })

          const response = await handleTreeRequest(
            { body: requestBody(hobby.raw, level, config), headerKey: headerKey(config), authorization: `${scheme} ${token}` },
            fake.deps,
          )

          expect(response.status).toBe(expected.status)
          expect(fake.calls.adapter).toHaveLength(expected.adapterCalls)
          expect(fake.calls.adapter.every((c) => c.provider === provider && c.model === model)).toBe(true)
          expect(fake.calls.consume).toEqual(config.kind === 'default' ? [userId] : [])
          if (expected.error !== undefined) {
            expect(response.body).toEqual({ error: expected.error })
            expect(fake.calls.cacheSet).toEqual([])
            expect(fake.calls.save).toEqual([])
          } else {
            expect(response.body).toEqual({ tree: expectedTree, model, pathId: 'path-1' })
            expect(fake.calls.cacheSet).toEqual([cacheKey(hobby.trimmed, level ?? 'new', provider, model)])
            // The learner's own token and the trimmed hobby reach the save.
            expect(fake.calls.save).toEqual([
              { token, input: { hobby: hobby.trimmed, level: level ?? 'new', tree: expectedTree, model, goalClass: 'none' } },
            ])
          }
        },
      ),
      RUNS,
    )
  })

  it('answers 400 invalid_input for a bad hobby or level without cache, limiter or adapter use', async () => {
    const arbBadBody = fc.oneof(
      fc.constantFrom<unknown>(null, 'x', [], {}, { hobby: 5 }, { hobby: '' }, { hobby: '  \t ' }, { hobby: 'x'.repeat(61) }),
      arbHobby.map((h) => ({ hobby: h.raw, level: 'expert' })),
      arbHobby.map((h) => ({ hobby: h.raw, level: null })),
    )
    await fc.assert(
      fc.asyncProperty(arbBadBody, arbToken, async (body, token) => {
        const fake = fakeTreeDeps({ users: { [token]: 'user-1' } })
        const response = await handleTreeRequest({ body, headerKey: undefined, authorization: `Bearer ${token}` }, fake.deps)
        expect(response).toEqual({ status: 400, body: { error: 'invalid_input' } })
        expect(fake.calls.cacheGet).toEqual([])
        expect(fake.calls.cacheSet).toEqual([])
        expect(fake.calls.consume).toEqual([])
        expect(fake.calls.adapter).toEqual([])
        expect(fake.calls.save).toEqual([])
      }),
      RUNS,
    )
  })

  it('answers 503 no_key when the default config is incomplete and no user key is sent', async () => {
    const arbBadDefaults = fc.constantFrom(
      { provider: 'anthropic', model: '', apiKey: 'k' },
      { provider: 'anthropic', model: 'm', apiKey: '  ' },
      { provider: 'nope', model: 'm', apiKey: 'k' },
      { provider: '', model: '', apiKey: '' },
    )
    await fc.assert(
      fc.asyncProperty(arbBadDefaults, arbHobby, arbOptionalLevel, arbToken, async (defaults, hobby, level, token) => {
        const fake = fakeTreeDeps({ users: { [token]: 'user-1' }, defaults })
        const response = await handleTreeRequest(
          { body: requestBody(hobby.raw, level, { kind: 'default' }), headerKey: undefined, authorization: `Bearer ${token}` },
          fake.deps,
        )
        expect(response).toEqual({ status: 503, body: { error: 'no_key' } })
        expect(fake.calls.cacheSet).toEqual([])
        expect(fake.calls.consume).toEqual([])
        expect(fake.calls.adapter).toEqual([])
        expect(fake.calls.save).toEqual([])
      }),
      RUNS,
    )
  })

  it('answers 429 rate_limited on a default-config miss, and never for a user key or a cache hit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ hobby: arbHobby, level: arbOptionalLevel, config: arbConfig, tree: arbVideoTree, token: arbToken, cachedHit: fc.boolean() }),
        async ({ hobby, level, config, tree, token, cachedHit }) => {
          const expectedTree = loaded(tree)
          const { provider, model } = effective(config)
          const fake = fakeTreeDeps({
            users: { [token]: 'user-1' },
            limiter: { tryConsume: () => false },
            adapterResult: () => treeOutput(tree),
          })
          if (cachedHit) fake.cache.set(cacheKey(hobby.trimmed, level ?? 'new', provider, model), { tree: expectedTree, model })

          const response = await handleTreeRequest(
            { body: requestBody(hobby.raw, level, config), headerKey: headerKey(config), authorization: `Bearer ${token}` },
            fake.deps,
          )

          if (config.kind === 'default' && !cachedHit) {
            expect(response).toEqual({ status: 429, body: { error: 'rate_limited' } })
            expect(fake.calls.consume).toEqual(['user-1'])
            expect(fake.calls.adapter).toEqual([])
            expect(fake.calls.cacheSet).toEqual([])
            expect(fake.calls.save).toEqual([])
          } else {
            expect(response).toEqual({ status: 200, body: { tree: expectedTree, model, pathId: 'path-1' } })
            expect(fake.calls.consume).toEqual([])
          }
        },
      ),
      RUNS,
    )
  })

  it('serves a cache hit without the adapter, the limiter or a cache write, and saves with the learner token', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ hobby: arbHobby, level: arbOptionalLevel, config: arbConfig, tree: arbVideoTree, token: arbToken, cachedModel: arbModel }),
        async ({ hobby, level, config, tree, token, cachedModel }) => {
          const expectedTree = loaded(tree)
          const { provider, model } = effective(config)
          const fake = fakeTreeDeps({ users: { [token]: 'user-1' } })
          fake.cache.set(cacheKey(hobby.trimmed, level ?? 'new', provider, model), { tree: expectedTree, model: cachedModel })

          const response = await handleTreeRequest(
            { body: requestBody(hobby.raw, level, config), headerKey: headerKey(config), authorization: `Bearer ${token}` },
            fake.deps,
          )

          expect(response).toEqual({ status: 200, body: { tree: expectedTree, model: cachedModel, pathId: 'path-1' } })
          expect(fake.calls.adapter).toEqual([])
          expect(fake.calls.consume).toEqual([])
          expect(fake.calls.cacheSet).toEqual([])
          expect(fake.calls.save).toEqual([
            { token, input: { hobby: hobby.trimmed, level: level ?? 'new', tree: expectedTree, model: cachedModel, goalClass: 'none' } },
          ])
        },
      ),
      RUNS,
    )
  })

  it('uses the body provider and model for a user key, even when the default config is unusable', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ hobby: arbHobby, level: arbOptionalLevel, provider: arbProvider, model: arbModel, key: fc.stringMatching(/^[a-z0-9]{1,20}$/), tree: arbVideoTree, token: arbToken }),
        async ({ hobby, level, provider, model, key, tree, token }) => {
          const fake = fakeTreeDeps({
            users: { [token]: 'user-1' },
            defaults: { provider: '', model: '', apiKey: '' },
            adapterResult: () => treeOutput(tree),
          })
          const response = await handleTreeRequest(
            { body: { hobby: hobby.raw, level, provider, model }, headerKey: key, authorization: `Bearer ${token}` },
            fake.deps,
          )
          expect(response.status).toBe(200)
          expect(fake.calls.adapter).toEqual([{ provider, hobby: hobby.trimmed, model }])
          expect(fake.calls.consume).toEqual([])
        },
      ),
      RUNS,
    )
  })
})

// Save-retry exploration (spec: tree-api-502-on-new-path, task 3, Property 2).
// Pins that the tree is cached before the save, so a retry costs no provider call and no limiter use.
// **Validates: Requirements 1.3, 2.3**
describe('Property 2: A failed save keeps the generated tree for a free retry', () => {
  it('returns 502 save_failed, then a repeat makes no adapter call, no limiter use, and one more save', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          hobby: arbHobby,
          level: arbOptionalLevel,
          config: arbConfig,
          tree: arbVideoTree,
          mode: fc.constantFrom('throws' as const, 'timeout' as const, 'empty' as const),
        }),
        async ({ hobby, level, config, tree, mode }) => {
          const fake = fakeTreeDeps({
            users: { 'token-1': 'user-1' },
            adapterResult: () => treeOutput(tree),
            saveTimeoutMs: SHORT_MS,
            savePath: async () => {
              if (mode === 'throws') throw new Error('database down')
              if (mode === 'timeout') return never<string>()
              return ''
            },
          })
          const input = {
            body: requestBody(hobby.raw, level, config),
            headerKey: headerKey(config),
            authorization: 'Bearer token-1',
          }

          const first = await handleTreeRequest(input, fake.deps)
          expect(first).toEqual({ status: 502, body: { error: 'save_failed' } })
          const adapterCalls = fake.calls.adapter.length
          const consumeCalls = [...fake.calls.consume]
          const savesBefore = fake.calls.save.length
          expect(adapterCalls).toBe(1)
          expect(savesBefore).toBe(1)

          const second = await handleTreeRequest(input, fake.deps)
          expect(second).toEqual({ status: 502, body: { error: 'save_failed' } })
          expect(fake.calls.adapter).toHaveLength(adapterCalls)
          expect(fake.calls.consume).toEqual(consumeCalls)
          expect(fake.calls.save).toHaveLength(savesBefore + 1)
        },
      ),
      RUNS,
    )
  })
})
