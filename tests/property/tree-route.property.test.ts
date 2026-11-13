// Property tests for handleTreeRequest (spec: accounts-cloud-save, Properties 12 to 15).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Provider, StartLevel } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { handleTreeRequest } from '../../server/utils/llm-handlers'
import { cacheKey } from '../../server/utils/tree-cache'
import { arbValidTree } from '../arbitraries'
import { DEFAULTS, fakeTreeDeps, never, treeOutput } from '../support/tree-deps'

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
          tree: arbValidTree,
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
              input: { hobby: hobby.trimmed, level: expectedLevel, tree: expectedTree, model: expectedModel },
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
          tree: arbValidTree,
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
