// Unit tests for handleTreeRequest (spec: accounts-cloud-save, task 4.10).
import { describe, expect, it } from 'vitest'
import { ERROR_CODES } from '../../shared/utils/llm'
import { ERROR_STATUS, handleTreeRequest } from '../../server/utils/llm-handlers'
import { currentAiObservabilityContext, type AiObservabilityContext } from '../../server/utils/ai-observability'
import type { AnalyticsIdentity } from '../../server/utils/analytics-events'
import type { StartLevel } from '../../shared/types/llm'
import { createRateLimiter } from '../../server/utils/rate-limiter'
import { cacheKey } from '../../server/utils/tree-cache'
import {
  DEFAULTS,
  NOT_A_HOBBY_OUTPUT,
  TOKEN,
  USER_ID,
  bearer,
  fakeTreeDeps,
  never,
  sampleTree,
  treeOutput,
} from '../support/tree-deps'

const SHORT_MS = 10
const OWN_KEY = 'own-key-placeholder'
const UNAUTHORIZED = { status: 401, body: { error: 'unauthorized' } }

function request(hobby: string, token = TOKEN) {
  return { body: { hobby }, headerKey: undefined, authorization: bearer(token) }
}

function ownKeyRequest(hobby: string, token = TOKEN) {
  return { body: { hobby, provider: 'openai', model: 'own-model' }, headerKey: OWN_KEY, authorization: bearer(token) }
}

describe('handleTreeRequest success', () => {
  it('answers 200 with exactly { tree, model, pathId, profile }', async () => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest(request('  Bouldering '), fake.deps)

    expect(response).toEqual({
      status: 200,
      body: { tree: sampleTree(), model: DEFAULTS.model, pathId: 'path-1', profile: null },
    })
    expect(Object.keys(response.body).sort()).toEqual(['model', 'pathId', 'profile', 'tree'])
    expect(fake.calls.order).toEqual(['verify', 'limit', 'cache.get', 'limiter', 'adapter', 'cache.set', 'save'])
  })

  it('saves the trimmed hobby, the level, the tree and the model with the user token', async () => {
    const fake = fakeTreeDeps()
    await handleTreeRequest(
      { body: { hobby: '  Bouldering ', level: 'serious' }, headerKey: undefined, authorization: bearer(TOKEN) },
      fake.deps,
    )

    expect(fake.calls.save).toEqual([
      { token: TOKEN, input: { hobby: 'Bouldering', level: 'serious', tree: sampleTree(), model: DEFAULTS.model, goalClass: 'none', profile: null } },
    ])
    expect(fake.calls.consume).toEqual([USER_ID])
  })

  it('accepts a lower-case bearer scheme', async () => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest(
      { body: { hobby: 'guitar' }, headerKey: undefined, authorization: `bearer ${TOKEN}` },
      fake.deps,
    )
    expect(response.status).toBe(200)
    expect(fake.calls.verify).toEqual([TOKEN])
  })
})

describe('handleTreeRequest 401', () => {
  it.each([
    ['a missing header', undefined],
    ['an empty header', ''],
    ['another scheme', `Basic ${TOKEN}`],
    ['a scheme with no token', 'Bearer'],
    ['text after the token', `Bearer ${TOKEN} extra`],
  ])('answers 401 for %s without calling the verifier', async (_name, authorization) => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest({ body: { hobby: 'guitar' }, headerKey: undefined, authorization }, fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.order).toEqual([])
  })

  it('answers 401 for a rejected token', async () => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest(request('guitar', 'unknown-token'), fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.order).toEqual(['verify'])
  })

  it('answers 401 when the verifier throws', async () => {
    const fake = fakeTreeDeps({
      verifyToken: async () => {
        throw new Error('auth server down')
      },
    })
    const response = await handleTreeRequest(request('guitar'), fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(fake.calls.order).toEqual(['verify'])
  })

  it('answers 401 when the verifier passes its time limit, and aborts it', async () => {
    let aborted = false
    const fake = fakeTreeDeps({
      verifyTimeoutMs: SHORT_MS,
      verifyToken: (_token, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return never<string | null>()
      },
    })
    const response = await handleTreeRequest(request('guitar'), fake.deps)

    expect(response).toEqual(UNAUTHORIZED)
    expect(aborted).toBe(true)
    expect(fake.calls.order).toEqual(['verify'])
  })

  it('answers 401 before 400 for an invalid body with a bad token', async () => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest(
      { body: { hobby: '' }, headerKey: undefined, authorization: bearer('unknown-token') },
      fake.deps,
    )
    expect(response).toEqual(UNAUTHORIZED)
  })
})

describe('handleTreeRequest 400 after a valid token', () => {
  it.each([
    ['an empty hobby', { hobby: '' }],
    ['a blank hobby', { hobby: '   ' }],
    ['a hobby of 61 characters', { hobby: 'x'.repeat(61) }],
    ['a hobby that is not a string', { hobby: 7 }],
    ['a missing hobby', {}],
    ['an unknown level', { hobby: 'guitar', level: 'expert' }],
  ])('answers 400 invalid_input for %s', async (_name, body) => {
    const fake = fakeTreeDeps()
    const response = await handleTreeRequest({ body, headerKey: undefined, authorization: bearer(TOKEN) }, fake.deps)

    expect(response).toEqual({ status: 400, body: { error: 'invalid_input' } })
    expect(fake.calls.order).toEqual(['verify'])
  })
})

describe('handleTreeRequest rate limit', () => {
  function limitedDeps() {
    return fakeTreeDeps({
      users: { 'token-1': 'user-1', 'token-2': 'user-2' },
      limiter: createRateLimiter({ limit: 10, windowMs: 3_600_000, now: () => 1_000 }),
    })
  }

  it('answers 429 after 10 default-config generations by one user, and not for another user', async () => {
    const fake = limitedDeps()
    for (let i = 0; i < 10; i++) {
      const response = await handleTreeRequest(request(`hobby ${i}`, 'token-1'), fake.deps)
      expect(response.status).toBe(200)
    }

    const eleventh = await handleTreeRequest(request('hobby 10', 'token-1'), fake.deps)
    expect(eleventh).toEqual({ status: 429, body: { error: 'rate_limited' } })
    expect(fake.calls.adapter).toHaveLength(10)
    expect(fake.calls.save).toHaveLength(10)

    const other = await handleTreeRequest(request('hobby 10', 'token-2'), fake.deps)
    expect(other.status).toBe(200)
    expect(fake.calls.consume).toEqual([...Array<string>(11).fill('user-1'), 'user-2'])
  })

  it('does not count User_Config requests', async () => {
    const fake = limitedDeps()
    for (let i = 0; i < 12; i++) {
      const response = await handleTreeRequest(ownKeyRequest(`hobby ${i}`, 'token-1'), fake.deps)
      expect(response.status).toBe(200)
    }
    expect(fake.calls.consume).toEqual([])
    expect(fake.calls.adapter).toHaveLength(12)
  })

  it('does not count cache hits', async () => {
    const fake = limitedDeps()
    for (let i = 0; i < 12; i++) {
      const response = await handleTreeRequest(request(i % 2 === 0 ? 'Guitar' : '  guitar ', 'token-1'), fake.deps)
      expect(response.status).toBe(200)
    }
    expect(fake.calls.consume).toEqual(['user-1'])
    expect(fake.calls.adapter).toHaveLength(1)
    expect(fake.calls.save).toHaveLength(12)
  })

  it('still serves a cached tree to a user who is over the limit', async () => {
    const fake = limitedDeps()
    for (let i = 0; i < 10; i++) await handleTreeRequest(request(`hobby ${i}`, 'token-1'), fake.deps)

    const response = await handleTreeRequest(request('hobby 3', 'token-1'), fake.deps)
    expect(response.status).toBe(200)
    expect(fake.calls.consume).toHaveLength(10)
  })
})

describe('handleTreeRequest save_failed', () => {
  it('answers 502 save_failed when the save throws, and keeps the tree cached', async () => {
    const fake = fakeTreeDeps({
      savePath: async () => {
        throw new Error('insert failed: secret detail')
      },
    })
    const response = await handleTreeRequest(request('guitar'), fake.deps)

    expect(response).toEqual({ status: 502, body: { error: 'save_failed' } })
    expect(fake.cache.get(cacheKey('guitar', 'new', 'anthropic', DEFAULTS.model))).toEqual({
      tree: sampleTree(),
      model: DEFAULTS.model,
    })
    expect(fake.calls.log).toEqual([{ code: 'save_failed', stage: 'path_save', reason: 'unknown', provider: 'anthropic', model: DEFAULTS.model }])
  })

  it('answers 502 save_failed when the save passes its time limit, and aborts it', async () => {
    let aborted = false
    const fake = fakeTreeDeps({
      saveTimeoutMs: SHORT_MS,
      savePath: (_token, _input, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return never<string>()
      },
    })
    const response = await handleTreeRequest(request('guitar'), fake.deps)

    expect(response).toEqual({ status: 502, body: { error: 'save_failed' } })
    expect(aborted).toBe(true)
  })

  it('answers 502 save_failed when the save gives no id', async () => {
    const fake = fakeTreeDeps({ savePath: async () => '' })
    const response = await handleTreeRequest(request('guitar'), fake.deps)
    expect(response).toEqual({ status: 502, body: { error: 'save_failed' } })
  })

  it('retries for free after a failed save', async () => {
    let failing = true
    const fake = fakeTreeDeps({
      savePath: async () => {
        if (failing) throw new Error('insert failed')
        return 'path-retry'
      },
    })
    await handleTreeRequest(request('guitar'), fake.deps)
    failing = false
    const response = await handleTreeRequest(request('guitar'), fake.deps)

    expect(response).toEqual({
      status: 200,
      body: { tree: sampleTree(), model: DEFAULTS.model, pathId: 'path-retry', profile: null },
    })
    expect(fake.calls.adapter).toHaveLength(1)
    expect(fake.calls.consume).toHaveLength(1)
  })
})

describe('handleTreeRequest cache hit', () => {
  it('saves and answers with the cached model', async () => {
    const fake = fakeTreeDeps()
    fake.cache.set(cacheKey('guitar', 'some', 'anthropic', DEFAULTS.model), {
      tree: sampleTree(),
      model: 'cached-model',
    })
    const response = await handleTreeRequest(
      { body: { hobby: ' Guitar ', level: 'some' }, headerKey: undefined, authorization: bearer(TOKEN) },
      fake.deps,
    )

    expect(response).toEqual({ status: 200, body: { tree: sampleTree(), model: 'cached-model', pathId: 'path-1', profile: null } })
    expect(fake.calls.save).toEqual([
      { token: TOKEN, input: { hobby: 'Guitar', level: 'some', tree: sampleTree(), model: 'cached-model', goalClass: 'none', profile: null } },
    ])
    expect(fake.calls.adapter).toEqual([])
    expect(fake.calls.consume).toEqual([])
  })
})

describe('handleTreeRequest without a tree', () => {
  it('does not save or cache a not_a_hobby answer', async () => {
    const fake = fakeTreeDeps({ adapterResult: () => NOT_A_HOBBY_OUTPUT })
    const response = await handleTreeRequest(request('asdf'), fake.deps)

    expect(response).toEqual({ status: 422, body: { error: 'not_a_hobby' } })
    expect(fake.calls.save).toEqual([])
    expect(fake.calls.cacheSet).toEqual([])
  })
})

describe('handleTreeRequest hobby limit', () => {
  it('answers 403 hobby_limit with 0 model calls, and touches no cache, rate limit or save', async () => {
    const fake = fakeTreeDeps({ hobbyLimitBlocks: async () => true })
    const response = await handleTreeRequest(request('  Pottery '), fake.deps)

    expect(response).toEqual({ status: 403, body: { error: 'hobby_limit' } })
    expect(fake.calls.adapter).toEqual([])
    expect(fake.calls.order).toEqual(['verify', 'limit'])
    // The check gets the verified user and the trimmed hobby, nothing from the client about the plan.
    expect(fake.calls.limit).toEqual([{ userId: USER_ID, hobby: 'Pottery' }])
  })

  it('stops a cached tree too, and a request with the learner\'s own key', async () => {
    const fake = fakeTreeDeps({ hobbyLimitBlocks: async () => true })
    fake.cache.set(cacheKey('pottery', 'new', 'anthropic', DEFAULTS.model), { tree: sampleTree(), model: 'cached' })
    expect((await handleTreeRequest(request('pottery'), fake.deps)).status).toBe(403)
    const own = await handleTreeRequest(
      { body: { hobby: 'pottery', provider: 'openai', model: 'm' }, headerKey: OWN_KEY, authorization: bearer(TOKEN) },
      fake.deps,
    )
    expect(own.status).toBe(403)
    expect(fake.calls.adapter).toEqual([])
    expect(fake.calls.save).toEqual([])
  })

  it('checks the token and the input first', async () => {
    const fake = fakeTreeDeps({ hobbyLimitBlocks: async () => true })
    expect((await handleTreeRequest({ body: { hobby: 'pottery' }, headerKey: undefined, authorization: undefined }, fake.deps)).status).toBe(401)
    expect((await handleTreeRequest(request('   '), fake.deps)).status).toBe(400)
    expect(fake.calls.limit).toEqual([])
  })

  it('builds as before when the limit does not block', async () => {
    const fake = fakeTreeDeps({ hobbyLimitBlocks: async () => false })
    expect((await handleTreeRequest(request('pottery'), fake.deps)).status).toBe(200)
    expect(fake.calls.adapter).toHaveLength(1)
  })

  it('makes 0 model calls and answers 502 when the check fails or passes its time limit', async () => {
    const failing = fakeTreeDeps({ hobbyLimitBlocks: async () => { throw new Error('down') } })
    expect(await handleTreeRequest(request('pottery'), failing.deps)).toEqual({ status: 502, body: { error: 'generation_failed' } })
    const slow = fakeTreeDeps({ hobbyLimitBlocks: () => never<boolean>(), limitTimeoutMs: SHORT_MS })
    expect((await handleTreeRequest(request('pottery'), slow.deps)).status).toBe(502)
    for (const fake of [failing, slow]) {
      expect(fake.calls.adapter).toEqual([])
      expect(fake.calls.save).toEqual([])
      expect(fake.calls.log.at(-1)).toMatchObject({ code: 'generation_failed', stage: 'limit_check' })
    }
  })
})

describe('ERROR_STATUS', () => {
  it('maps every Error_Code to its status', () => {
    expect(ERROR_STATUS).toEqual({
      invalid_input: 400,
      not_a_hobby: 422,
      rate_limited: 429,
      timeout: 504,
      generation_failed: 502,
      provider_auth: 502,
      provider_error: 502,
      no_key: 503,
      unauthorized: 401,
      save_failed: 502,
      hobby_limit: 403,
    })
    expect(Object.keys(ERROR_STATUS).sort()).toEqual([...ERROR_CODES].sort())
  })
})

// spec: sample-path, Requirement 12 (bug APP-ANALYTICS-01).
describe('handleTreeRequest analytics identity', () => {
  const BROWSER: AnalyticsIdentity = { distinctId: 'browser-1', sessionId: 'session-1' }

  type Recorded = { identity: AnalyticsIdentity; startLevel: StartLevel; cached: boolean }

  /** Fake deps that keep the observability context seen by the model call and every `recordGenerated` call. */
  function withRecorder(options: Parameters<typeof fakeTreeDeps>[0] = {}) {
    const contexts: (AiObservabilityContext | undefined)[] = []
    const recorded: Recorded[] = []
    const fake = fakeTreeDeps({
      ...options,
      adapterResult: (hobby, config) => {
        contexts.push(currentAiObservabilityContext())
        return options.adapterResult ? options.adapterResult(hobby, config) : treeOutput(sampleTree())
      },
    })
    fake.deps.recordGenerated = async (input) => {
      recorded.push(input)
    }
    return { fake, contexts, recorded }
  }

  it('uses the browser ids for the model call and the generated event', async () => {
    const { fake, contexts, recorded } = withRecorder()
    const response = await handleTreeRequest({ ...request('guitar'), analytics: BROWSER }, fake.deps)

    expect(response.status).toBe(200)
    expect(contexts).toHaveLength(1)
    expect(contexts[0]?.distinctId).toBe('browser-1')
    expect(contexts[0]?.browserSessionId).toBe('session-1')
    expect(recorded).toEqual([{ identity: BROWSER, startLevel: 'new', cached: false }])
  })

  it('falls back to the user id without a browser identity', async () => {
    for (const analytics of [undefined, null]) {
      const { fake, contexts, recorded } = withRecorder()
      await handleTreeRequest({ ...request('guitar'), analytics }, fake.deps)

      expect(contexts[0]?.distinctId).toBe(USER_ID)
      expect(contexts[0]?.browserSessionId).toBeUndefined()
      expect(recorded).toEqual([{ identity: { distinctId: USER_ID }, startLevel: 'new', cached: false }])
    }
  })

  it('sends the generated event with cached true on a cache hit', async () => {
    const { fake, contexts, recorded } = withRecorder()
    fake.cache.set(cacheKey('guitar', 'some', 'anthropic', DEFAULTS.model), { tree: sampleTree(), model: 'cached-model' })
    await handleTreeRequest(
      { body: { hobby: 'guitar', level: 'some' }, headerKey: undefined, authorization: bearer(TOKEN), analytics: BROWSER },
      fake.deps,
    )

    expect(contexts).toEqual([])
    expect(recorded).toEqual([{ identity: BROWSER, startLevel: 'some', cached: true }])
  })

  it('sends no generated event when the build fails', async () => {
    const { fake, recorded } = withRecorder({ adapterResult: () => NOT_A_HOBBY_OUTPUT })
    const response = await handleTreeRequest({ ...request('asdfgh'), analytics: BROWSER }, fake.deps)

    expect(response.status).not.toBe(200)
    expect(recorded).toEqual([])
  })

  it('answers the same when the generated event throws', async () => {
    const { fake } = withRecorder()
    fake.deps.recordGenerated = async () => {
      throw new Error('posthog down')
    }
    const response = await handleTreeRequest({ ...request('guitar'), analytics: BROWSER }, fake.deps)

    expect(response).toEqual({ status: 200, body: { tree: sampleTree(), model: DEFAULTS.model, pathId: 'path-1', profile: null } })
  })

  it('changes nothing but analytics: same limiter key, same save, same body', async () => {
    const plain = withRecorder()
    const withIds = withRecorder()
    const a = await handleTreeRequest(request('guitar'), plain.fake.deps)
    const b = await handleTreeRequest({ ...request('guitar'), analytics: { distinctId: 'someone-else' } }, withIds.fake.deps)

    expect(b).toEqual(a)
    expect(withIds.fake.calls.consume).toEqual([USER_ID])
    expect(withIds.fake.calls.save).toEqual(plain.fake.calls.save)
    expect(withIds.fake.calls.order).toEqual(plain.fake.calls.order)
  })
})
