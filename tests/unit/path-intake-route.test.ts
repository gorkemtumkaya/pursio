import { describe, expect, it } from 'vitest'
import type { IntakeProfile } from '../../shared/types/learner-profile'
import type { Provider } from '../../shared/types/llm'
import { handleIntakeRequest, intakeLanguage, type IntakeDeps } from '../../server/utils/intake-handlers'
import { createAnthropicAdapter } from '../../server/utils/providers/anthropic'
import { createOpenAIAdapter } from '../../server/utils/providers/openai'
import type { AdapterResult, Fetcher, ProviderAdapter, StructuredOptions } from '../../server/utils/providers/types'

const TOKEN = 'token-a'
const AUTH = `Bearer ${TOKEN}`

const GUITAR_ANSWER = {
  notAHobby: false,
  level: 'returning',
  goal: { id: 'songs-at-home', label: 'Play songs I love at home', finishLine: 'Play 5 songs you love, start to finish' },
  avoid: ['performing'],
  taste: [],
  goalOptions: [
    { id: 'songs-at-home', label: 'Play songs I love at home', finishLine: 'Play 5 songs you love, start to finish' },
    { id: 'campfire', label: 'Play around a campfire', finishLine: 'Lead a 3 song campfire sing along' },
    { id: 'write-a-song', label: 'Write my own song', finishLine: 'Write and record one song of your own' },
    { id: 'jam', label: 'Jam with friends', finishLine: 'Keep time through a 10 minute jam' },
  ],
  knownOptions: [
    { id: 'holding-tuning', label: 'Holding and tuning' },
    { id: 'open-chords', label: 'Open chords' },
    { id: 'basic-strumming', label: 'Basic strumming' },
    { id: 'chord-changes', label: 'Smooth chord changes' },
  ],
  tasteOptions: [],
  mascotSet: 'guitar',
}

interface StructuredCall {
  provider: Provider
  model: string
  apiKey: string
  options: StructuredOptions
}

function fakeDeps(overrides: Partial<IntakeDeps> & { answer?: () => AdapterResult | Promise<AdapterResult> } = {}) {
  const calls: StructuredCall[] = []
  const consumed: string[] = []
  const answer = overrides.answer ?? (() => ({ ok: true, value: GUITAR_ANSWER }) as AdapterResult)
  const adapter = (provider: Provider): ProviderAdapter => ({
    async generateTree() {
      throw new Error('not used')
    },
    async generateStructured(config, options) {
      calls.push({ provider, model: config.model, apiKey: config.apiKey, options })
      return answer()
    },
    async testConnection() {
      return { ok: true, value: null }
    },
  })
  const deps: IntakeDeps = {
    adapters: { anthropic: adapter('anthropic'), openai: adapter('openai') },
    systemPrompt: async () => 'intake prompt',
    defaults: { provider: 'anthropic', model: 'tree-model', apiKey: 'server-key-placeholder' },
    smallModels: { anthropic: 'small-claude', openai: 'small-gpt' },
    maxTokens: { anthropic: 1200, openai: 2000 },
    openaiReasoningEffort: 'minimal',
    limiter: {
      tryConsume(key) {
        consumed.push(key)
        return true
      },
    },
    verifyToken: async token => (token === TOKEN ? 'user-a' : null),
    deadlineMs: 5_000,
    now: () => 0,
    ...overrides,
  }
  return { deps, calls, consumed }
}

function request(body: unknown, extra: { headerKey?: string; authorization?: string } = {}) {
  return { body, headerKey: extra.headerKey, authorization: extra.authorization ?? AUTH }
}

describe('POST /api/intake: a valid answer', () => {
  it('returns 200 with the sanitized profile and makes exactly one model call', async () => {
    const { deps, calls } = fakeDeps()
    const result = await handleIntakeRequest(
      request({ hobby: ' Guitar ', note: 'Played a bit as a teen. Not into performing.', language: 'en-US' }),
      deps,
    )
    expect(result.status).toBe(200)
    const profile = (result.body as { profile: IntakeProfile }).profile
    expect(profile.level).toBe('returning')
    expect(profile.goal?.id).toBe('songs-at-home')
    expect(profile.avoid).toEqual(['performing'])
    expect(profile.mascotSet).toBe('guitar')
    expect(calls).toHaveLength(1)
  })

  it('sends the inputs as one JSON value, with the server key and the Anthropic Small_Model', async () => {
    const { deps, calls } = fakeDeps()
    await handleIntakeRequest(request({ hobby: 'guitar', note: 'hi', language: 'tr-TR' }), deps)
    const [call] = calls
    expect(call?.provider).toBe('anthropic')
    expect(call?.model).toBe('small-claude')
    expect(call?.apiKey).toBe('server-key-placeholder')
    expect(JSON.parse(call?.options.userText ?? '')).toEqual({ language: 'tr', hobby: 'guitar', note: 'hi' })
    expect(call?.options.maxTokens).toBe(1200)
    expect(call?.options.redactContent).toBe(true)
    expect(call?.options.fastMode).toEqual({})
  })

  it('uses the learner key with that provider Small_Model, the lowest effort and 2000 tokens', async () => {
    const { deps, calls } = fakeDeps()
    await handleIntakeRequest(
      request({ hobby: 'guitar', note: '', provider: 'openai' }, { headerKey: 'own-key-placeholder' }),
      deps,
    )
    const [call] = calls
    expect(call?.provider).toBe('openai')
    expect(call?.model).toBe('small-gpt')
    expect(call?.apiKey).toBe('own-key-placeholder')
    expect(call?.options.maxTokens).toBe(2000)
    expect(call?.options.fastMode).toEqual({ reasoningEffort: 'minimal' })
  })
})

describe('POST /api/intake: repair instead of reject', () => {
  it('repairs small slips: a wrong level, a repeated id, too many options, a long finish line', async () => {
    const answer = {
      ...GUITAR_ANSWER,
      level: 'expert',
      goalOptions: [
        ...GUITAR_ANSWER.goalOptions,
        { id: 'campfire', label: 'Repeated id', finishLine: 'x' },
        { id: 'fifth', label: 'Fifth', finishLine: 'F'.repeat(70) },
      ],
      knownOptions: Array.from({ length: 9 }, (_, i) => ({ id: `skill-${i}`, label: `Skill ${i}` })),
    }
    const { deps } = fakeDeps({ answer: () => ({ ok: true, value: answer }) })
    const result = await handleIntakeRequest(request({ hobby: 'guitar', note: 'x' }), deps)
    expect(result.status).toBe(200)
    const profile = (result.body as { profile: IntakeProfile }).profile
    expect(profile.level).toBeNull()
    expect(profile.goalOptions.map(option => option.id)).toEqual(['songs-at-home', 'campfire', 'write-a-song', 'jam'])
    expect(profile.knownOptions).toHaveLength(6)
  })

  it('fails with 502 when fewer than 2 goal options survive', async () => {
    const answer = { ...GUITAR_ANSWER, goal: null, goalOptions: [GUITAR_ANSWER.goalOptions[0]] }
    const { deps } = fakeDeps({ answer: () => ({ ok: true, value: answer }) })
    const result = await handleIntakeRequest(request({ hobby: 'guitar', note: 'x' }), deps)
    expect(result).toEqual({ status: 502, body: { error: 'generation_failed' } })
  })

  it('clears level, goal, avoid and taste when the Note is empty, whatever the model said', async () => {
    const { deps } = fakeDeps()
    const result = await handleIntakeRequest(request({ hobby: 'guitar', note: '   ' }), deps)
    const profile = (result.body as { profile: IntakeProfile }).profile
    expect(profile).toMatchObject({ level: null, goal: null, avoid: [], taste: [] })
    expect(profile.goalOptions).toHaveLength(4)
    expect(profile.knownOptions).toHaveLength(4)
  })
})

describe('intakeLanguage', () => {
  it('keeps a 2 or 3 letter primary subtag in lowercase, else en', () => {
    expect(intakeLanguage('pt-BR')).toBe('pt')
    expect(intakeLanguage('FIL')).toBe('fil')
    expect(intakeLanguage('zh_Hant')).toBe('zh')
    expect(intakeLanguage('english')).toBe('en')
    expect(intakeLanguage(null)).toBe('en')
  })
})

describe('Provider requests of the intake call (decision 37)', () => {
  const options: StructuredOptions = {
    systemPrompt: 'p',
    userText: 'u',
    schemaName: 'intake_profile',
    schema: { type: 'object' },
    maxTokens: 1200,
  }

  function recordingFetcher(response: unknown) {
    const bodies: Record<string, unknown>[] = []
    const fetcher: Fetcher = async (_url, request) => {
      bodies.push(request.body)
      return response
    }
    return { fetcher, bodies }
  }

  it('Anthropic: thinking disabled explicitly only for the fast call, with its token limit', async () => {
    const { fetcher, bodies } = recordingFetcher({ content: [] })
    const adapter = createAnthropicAdapter(fetcher)
    const config = { provider: 'anthropic' as const, model: 'small-claude', apiKey: 'k' }
    await adapter.generateStructured(config, { ...options, fastMode: {} })
    await adapter.generateStructured(config, options)
    expect(bodies[0]?.thinking).toEqual({ type: 'disabled' })
    expect(bodies[0]?.max_tokens).toBe(1200)
    expect(bodies[1]).not.toHaveProperty('thinking')
  })

  it('OpenAI: reasoning_effort only when given, with its token limit', async () => {
    const { fetcher, bodies } = recordingFetcher({ choices: [] })
    const adapter = createOpenAIAdapter(fetcher)
    const config = { provider: 'openai' as const, model: 'small-gpt', apiKey: 'k' }
    await adapter.generateStructured(config, { ...options, maxTokens: 2000, fastMode: { reasoningEffort: 'minimal' } })
    await adapter.generateStructured(config, options)
    expect(bodies[0]?.reasoning_effort).toBe('minimal')
    expect(bodies[0]?.max_completion_tokens).toBe(2000)
    expect(bodies[1]).not.toHaveProperty('reasoning_effort')
  })
})

describe('POST /api/intake: errors (Req 2.1 to 2.4, 2.14 to 2.16)', () => {
  const body = { hobby: 'guitar', note: 'Played a bit as a teen' }

  it('401 without a token, with an unknown token, or when the check runs out of time; no model call', async () => {
    for (const authorization of ['', 'Bearer nope']) {
      const { deps, calls } = fakeDeps()
      expect(await handleIntakeRequest(request(body, { authorization }), deps)).toEqual({ status: 401, body: { error: 'unauthorized' } })
      expect(calls).toHaveLength(0)
    }
    let clock = 0
    const { deps, calls } = fakeDeps({
      deadlineMs: 5,
      now: () => clock,
      verifyToken: () => new Promise((resolve) => { clock = 10; setTimeout(() => resolve('user-a'), 50) }),
    })
    expect((await handleIntakeRequest(request(body), deps)).status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('400 for a missing, empty or long hobby, a long Note, or a key without a provider; no model call', async () => {
    const bad = [
      {},
      { hobby: '   ' },
      { hobby: 'x'.repeat(61) },
      { hobby: 'guitar', note: 'x'.repeat(801) },
      { hobby: 'guitar', note: 7 },
    ]
    for (const item of bad) {
      const { deps, calls } = fakeDeps()
      expect(await handleIntakeRequest(request(item), deps)).toEqual({ status: 400, body: { error: 'invalid_input' } })
      expect(calls).toHaveLength(0)
    }
    const { deps, calls } = fakeDeps()
    const result = await handleIntakeRequest(request(body, { headerKey: 'own-key-placeholder' }), deps)
    expect(result.status).toBe(400)
    expect(calls).toHaveLength(0)
    // 800 characters is the limit, not past it (decision 40).
    const ok = fakeDeps()
    expect((await handleIntakeRequest(request({ hobby: 'guitar', note: 'x'.repeat(800) }), ok.deps)).status).toBe(200)
  })

  it('429 over the limit, with no model call', async () => {
    const { deps, calls } = fakeDeps({ limiter: { tryConsume: () => false } })
    expect(await handleIntakeRequest(request(body), deps)).toEqual({ status: 429, body: { error: 'rate_limited' } })
    expect(calls).toHaveLength(0)
  })

  it('503 when no key, provider or Small_Model is usable', async () => {
    for (const overrides of [
      { defaults: { provider: 'anthropic', model: 'm', apiKey: '  ' } },
      { defaults: { provider: 'other', model: 'm', apiKey: 'k' } },
      { smallModels: { anthropic: '', openai: 'small-gpt' } },
    ]) {
      const { deps, calls } = fakeDeps(overrides)
      expect(await handleIntakeRequest(request(body), deps)).toEqual({ status: 503, body: { error: 'no_key' } })
      expect(calls).toHaveLength(0)
    }
  })

  it('504 when the model does not answer within the budget', async () => {
    const { deps } = fakeDeps({ deadlineMs: 20, now: () => performance.now(), answer: () => new Promise(() => {}) })
    expect(await handleIntakeRequest(request(body), deps)).toEqual({ status: 504, body: { error: 'timeout' } })
  })

  it('502 for a provider failure, an unusable answer or a thrown error', async () => {
    const cases: [() => AdapterResult | Promise<AdapterResult>, string][] = [
      [() => ({ ok: false, error: 'provider_auth' }), 'provider_auth'],
      [() => ({ ok: false, error: 'provider_error', status: 500 }), 'provider_error'],
      [() => ({ ok: false, error: 'bad_output' }), 'generation_failed'],
      [() => ({ ok: true, value: 'not an object' }), 'generation_failed'],
      [() => Promise.reject(new Error('boom')), 'provider_error'],
    ]
    for (const [answer, code] of cases) {
      const { deps, calls } = fakeDeps({ answer })
      expect(await handleIntakeRequest(request(body), deps)).toEqual({ status: 502, body: { error: code } })
      expect(calls).toHaveLength(1)
    }
  })

  it('422 when the model says it is not a hobby', async () => {
    const { deps } = fakeDeps({ answer: () => ({ ok: true, value: { ...GUITAR_ANSWER, notAHobby: true } }) })
    expect(await handleIntakeRequest(request({ hobby: 'asdfgh' }), deps)).toEqual({ status: 422, body: { error: 'not_a_hobby' } })
  })

  it('logs only code, stage, provider and model; never the hobby, the Note or the answer', async () => {
    const entries: unknown[] = []
    const { deps } = fakeDeps({ log: entry => entries.push(entry), answer: () => ({ ok: true, value: { ...GUITAR_ANSWER, goalOptions: [] } }) })
    await handleIntakeRequest(request({ hobby: 'secret hobby', note: 'secret note' }), deps)
    expect(entries).toEqual([{ code: 'generation_failed', stage: 'sanitize', provider: 'anthropic', model: 'small-claude' }])
    expect(JSON.stringify(entries)).not.toMatch(/secret|songs/)
  })

  it('counts every call that reaches the limiter against the intake limiter only', async () => {
    const { deps, consumed } = fakeDeps()
    await handleIntakeRequest(request(body), deps)
    await handleIntakeRequest(request({ hobby: '' }), deps)
    expect(consumed).toEqual(['user-a'])
  })
})

describe('POST /api/intake: the 31st call in an hour is refused', () => {
  it('uses a limiter of 30 per user per hour, separate from the tree limiter', async () => {
    const { createRateLimiter } = await import('../../server/utils/rate-limiter')
    let clock = 0
    const intakeLimiter = createRateLimiter({ limit: 30, windowMs: 3_600_000, now: () => clock })
    const treeLimiter = createRateLimiter({ limit: 10, windowMs: 3_600_000, now: () => clock })
    const { deps } = fakeDeps({ limiter: intakeLimiter })
    const statuses: number[] = []
    for (let i = 0; i < 31; i++) {
      clock = i * 1000
      statuses.push((await handleIntakeRequest(request({ hobby: 'guitar' }), deps)).status)
    }
    expect(statuses.slice(0, 30).every(status => status === 200)).toBe(true)
    expect(statuses[30]).toBe(429)
    // The tree limiter was never touched: it still allows its full 10.
    expect(Array.from({ length: 10 }, () => treeLimiter.tryConsume('user-a')).every(Boolean)).toBe(true)
  })
})
