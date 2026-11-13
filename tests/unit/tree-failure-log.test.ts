// Unit tests for failure reasons and log safety (spec: tree-api-502-on-new-path, task 4.9).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ rpc }),
}))

import { handleTreeRequest } from '../../server/utils/llm-handlers'
import { llmTreeDeps } from '../../server/utils/llm-runtime'
import { savePathForUser } from '../../server/utils/supabase-server'
import { TOKEN, bearer, fakeTreeDeps, sampleTree } from '../support/tree-deps'

const SECRET_URL = 'https://project-sentinel.example.test'
const SECRET_ANON = 'anon-sentinel-key'
const input = { hobby: 'guitar', level: 'some', tree: sampleTree(), model: 'm' } as const

function stubConfig(config: Record<string, unknown>): void {
  vi.stubGlobal('useRuntimeConfig', () => config)
}

function reasonOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: { reason?: unknown; message?: unknown }) => {
      expect(error.message).toBe('save_failed')
      return error.reason
    },
  )
}

describe('savePathForUser reasons', () => {
  beforeEach(() => {
    rpc.mockReset()
    stubConfig({ public: { supabaseUrl: SECRET_URL, supabaseAnonKey: SECRET_ANON }, llmProvider: '', llmModel: '', llmApiKey: '' })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports config_missing when the Supabase config is empty', async () => {
    stubConfig({ public: { supabaseUrl: '', supabaseAnonKey: '' } })
    expect(await reasonOf(savePathForUser(TOKEN, input))).toBe('config_missing')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('keeps a safe RPC code: rpc_error:<code>', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'secret message', details: 'd', hint: 'h' } })
    expect(await reasonOf(savePathForUser(TOKEN, input))).toBe('rpc_error:42501')
  })

  it.each(['has space', 'way_too_long_code_value_here', '', 'a;b'])('drops the unsafe code %j', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'secret message' } })
    expect(await reasonOf(savePathForUser(TOKEN, input))).toBe('rpc_error')
  })

  it('reports rpc_error when the id is not a string', async () => {
    rpc.mockResolvedValue({ data: 42, error: null })
    expect(await reasonOf(savePathForUser(TOKEN, input))).toBe('rpc_error')
  })

  it('returns the id on success', async () => {
    rpc.mockResolvedValue({ data: 'path-9', error: null })
    expect(await savePathForUser(TOKEN, input)).toBe('path-9')
  })
})

describe('handler failure reasons', () => {
  const req = { body: { hobby: 'guitar' }, headerKey: undefined, authorization: bearer(TOKEN) }

  it('logs http_<status> when the provider failure carries a status', async () => {
    const fake = fakeTreeDeps({ adapterResult: () => ({ ok: false, error: 'provider_error', status: 500 }) })
    const response = await handleTreeRequest(req, fake.deps)
    expect(response.status).toBe(502)
    expect(fake.calls.log).toHaveLength(1)
    expect(fake.calls.log[0]).toMatchObject({ code: 'provider_error', stage: 'provider_call', reason: 'http_500' })
  })

  it('logs http_401 for an auth failure with status', async () => {
    const fake = fakeTreeDeps({ adapterResult: () => ({ ok: false, error: 'provider_auth', status: 401 }) })
    await handleTreeRequest(req, fake.deps)
    expect(fake.calls.log[0]).toMatchObject({ code: 'provider_auth', reason: 'http_401' })
  })

  it('falls back to a fixed label when the status is out of range', async () => {
    const fake = fakeTreeDeps({ adapterResult: () => ({ ok: false, error: 'provider_error', status: 99999 }) })
    await handleTreeRequest(req, fake.deps)
    expect(fake.calls.log[0]).toMatchObject({ reason: 'provider' })
  })
})

describe('log never holds secrets', () => {
  const SENTINELS = {
    token: 'token-sentinel-abc',
    userKey: 'sk-user-sentinel-key',
    defaultKey: 'sk-default-sentinel-key',
    prompt: 'prompt-sentinel-text',
    body: 'response-body-sentinel',
    message: 'error-message-sentinel',
  }
  const all = Object.values(SENTINELS)

  function expectClean(text: string): void {
    for (const secret of all) expect(text).not.toContain(secret)
  }

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const failures: Array<[string, Parameters<typeof fakeTreeDeps>[0]]> = [
    [
      'provider failure',
      {
        adapterResult: () => ({ ok: false, error: 'provider_error', status: 500, body: SENTINELS.body, message: SENTINELS.message } as never),
      },
    ],
    ['invalid output', { adapterResult: () => ({ ok: true, value: { result: { junk: SENTINELS.body } } }) }],
    [
      'save throw',
      {
        savePath: async () => {
          throw Object.assign(new Error(SENTINELS.message), { reason: 'rpc_error:42501', details: SENTINELS.body })
        },
      },
    ],
    [
      'save throw with unsafe reason',
      {
        savePath: async () => {
          throw Object.assign(new Error('x'), { reason: `leak ${SENTINELS.message}` })
        },
      },
    ],
    [
      'prompt failure',
      {},
    ],
  ]

  it.each(failures)('handler log entry is clean: %s', async (name, options) => {
    const fake = fakeTreeDeps({
      ...options,
      defaults: { provider: 'anthropic', model: 'm', apiKey: SENTINELS.defaultKey },
    })
    if (name === 'prompt failure') {
      fake.deps.systemPrompt = async () => {
        throw new Error(`${SENTINELS.prompt} ${SENTINELS.message}`)
      }
    }
    const response = await handleTreeRequest(
      { body: { hobby: 'guitar' }, headerKey: undefined, authorization: bearer(SENTINELS.token) },
      { ...fake.deps, verifyToken: async () => 'user-a' },
    )
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(fake.calls.log).toHaveLength(1)
    expectClean(JSON.stringify(fake.calls.log))
    expectClean(JSON.stringify(response))
  })

  it('own-key request does not log the key', async () => {
    const fake = fakeTreeDeps({ adapterResult: () => ({ ok: false, error: 'provider_auth', status: 401 }) })
    await handleTreeRequest(
      {
        body: { hobby: 'guitar', provider: 'openai', model: 'own-model' },
        headerKey: SENTINELS.userKey,
        authorization: bearer(SENTINELS.token),
      },
      fake.deps,
    )
    expectClean(JSON.stringify(fake.calls.log))
  })

  it('logLlmError writes only code, stage, reason, provider and model', async () => {
    stubConfig({ llmProvider: 'anthropic', llmModel: 'm', llmApiKey: SENTINELS.defaultKey, public: {} })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = llmTreeDeps().log
    expect(log).toBeDefined()
    // An entry with extra fields, as a careless caller might pass.
    const entry = {
      code: 'save_failed',
      stage: 'path_save',
      reason: 'rpc_error:42501',
      provider: 'anthropic',
      model: 'm',
      apiKey: SENTINELS.defaultKey,
      token: SENTINELS.token,
      prompt: SENTINELS.prompt,
      body: SENTINELS.body,
    } as const
    log?.(entry)

    expect(spy).toHaveBeenCalledTimes(1)
    const [tag, payload] = spy.mock.calls[0] ?? []
    expect(tag).toBe('[llm]')
    expect(Object.keys(payload as object).sort()).toEqual(['code', 'model', 'provider', 'reason', 'stage'])
    expectClean(JSON.stringify(spy.mock.calls))
  })
})
