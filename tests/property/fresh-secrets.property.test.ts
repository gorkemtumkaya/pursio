// Feature: fresh, Property 9: Secrets never leak
// For any random Check_Route secret and provider API key, and any failure mode (wrong secret,
// failed feed with a body that holds the key, provider error, model error, store error), no
// response body, response header or log entry of the Check_Route or the Fresh_Endpoint holds the
// secret or the key, or any substring of 8 or more characters of either.
// Validates: Requirements 7.6, 18.5, 18.6
import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckKey, FeedEntry } from '../../shared/types/fresh'
import type { PoolVideo } from '../../shared/types/video'
import { poolKey } from '../../shared/utils/video-normalize'
import type { FreshStore } from '../../server/utils/fresh/check-store'
import { handleCheckRequest, handleFreshRequest } from '../../server/utils/fresh/handlers'
import type { VideoProvider } from '../../server/utils/video/provider'
import { createFakeClock, createFakeFeedFetcher, createFakeFreshJudge, keepAllVerdicts } from '../support/fresh-fakes'
import { activePath, createCheckRouteHarness, createFreshEndpointHarness, userData, userPath } from '../support/fresh-route-fakes'
import { createFakeVideoProvider, fakeDetails, type FakeJudge } from '../support/video-fakes'

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
const secretArb = fc.string({ unit: fc.constantFrom(...ALNUM.split('')), minLength: 8, maxLength: 64 })
const KEY: CheckKey = { hobby: 'bouldering', language: 'en' }
const VIDEO = 'vidAAAAAAA1'
const CHANNEL = 'UCchan00000000000000000'

/** True when `text` holds any 8-character substring of `secret`. */
function leaks(text: string, secret: string): boolean {
  for (let i = 0; i + 8 <= secret.length; i += 1) if (text.includes(secret.slice(i, i + 8))) return true
  return false
}

let consoleLines: string[] = []
beforeEach(() => {
  consoleLines = []
  const capture = (...args: unknown[]): void => {
    consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a) ?? String(a))).join(' '))
  }
  vi.spyOn(console, 'error').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
  vi.spyOn(console, 'info').mockImplementation(capture)
  vi.spyOn(console, 'log').mockImplementation(capture)
})
afterEach(() => {
  vi.restoreAllMocks()
})

type Mode = 'wrong_secret' | 'feed_body' | 'provider_error' | 'model_error' | 'model_output' | 'store_error' | 'ok'

function poolVideo(): PoolVideo {
  return {
    id: 'poolvideo01',
    title: 'Pool',
    channel: 'Pool channel',
    channelId: null,
    thumbnailUrl: '',
    durationSeconds: 300,
    viewCount: null,
    likeCount: null,
    publishedAt: null,
    defaultAudioLanguage: null,
    hasCaptions: null,
    teachesThisSkill: 0.9,
    levelFit: 0.8,
    style: 'technique',
    matchedQuestText: null,
  }
}

describe('Property 9: Secrets never leak', () => {
  it('the Check_Route writes neither the secret nor the key to a response or log', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        secretArb,
        fc.constantFrom<Mode>('wrong_secret', 'feed_body', 'provider_error', 'model_error', 'model_output', 'store_error', 'ok'),
        async (secret, apiKey, mode) => {
          consoleLines = []
          const clock = createFakeClock()
          const now = clock.now()
          const entry: FeedEntry = { videoId: VIDEO, title: 'New video', channelId: CHANNEL, publishedMs: now - 3_600_000 }
          const feeds = createFakeFeedFetcher({
            clock,
            feeds: { [CHANNEL]: mode === 'feed_body' ? { status: 500, body: `denied key=${apiKey} secret=${secret}` } : { entries: [entry] } },
          })
          const base = createFakeVideoProvider({ catalog: [fakeDetails(VIDEO, { channelId: CHANNEL })] })
          const provider: VideoProvider = {
            search: (q, n, o) => base.search(q, n, o),
            getDetails: async (ids, opts) => {
              if (mode === 'provider_error') throw new Error(`https://example.invalid/videos?key=${apiKey}`)
              return base.getDetails(ids, opts)
            },
          }
          const fakeJudge = createFakeFreshJudge([{ verdicts: keepAllVerdicts([{ id: VIDEO }], 'footwork') }])
          const judge: FakeJudge = {
            ...fakeJudge,
            generateStructured: async (config, options) => {
              if (mode === 'model_error') throw new Error(`model refused key ${apiKey} ${secret}`)
              if (mode === 'model_output') return { ok: true, value: { verdicts: apiKey, secret } }
              return fakeJudge.generateStructured(config, options)
            },
          }
          const h = createCheckRouteHarness({ clock, secret, feeds, provider, judge })
          if (mode === 'store_error' && h.deps.run) {
            const inner = h.deps.run.store
            const failing: FreshStore = {
              ...inner,
              storeCheck: async () => {
                throw new Error(`db error for ${secret} with ${apiKey}`)
              },
            }
            h.deps.run = { ...h.deps.run, store: failing }
          }
          if (h.deps.run) h.deps.run = { ...h.deps.run, check: { ...h.deps.run.check, config: { provider: 'openai', model: 'm', apiKey } } }
          h.stores.fresh.setPaths([activePath(KEY.hobby, 'en', now)])
          const pk = poolKey({ hobby: KEY.hobby, skillTitle: 'footwork', level: 'beginner', language: 'en' })
          await h.stores.pipeline.takeLease(pk, 'pool-run')
          await h.stores.pipeline.storePool(pk, 'pool-run', [poolVideo()])
          h.stores.fresh.setSources(KEY, [
            { channelId: CHANNEL, channelName: 'Channel', qualifyingCount: 3, latestQualifyingMs: now - 1, lastCheckedMs: null },
          ])

          const header = mode === 'wrong_secret' ? `${secret}x` : secret
          const result = await handleCheckRequest({ secretHeader: header }, h.deps)

          const outputs = [JSON.stringify(result), ...h.logs.map((l) => JSON.stringify(l)), ...consoleLines]
          for (const text of outputs) {
            expect(leaks(text, secret)).toBe(false)
            expect(leaks(text, apiKey)).toBe(false)
          }
          // Every log entry has fixed fields only.
          for (const entry of h.logs) for (const k of Object.keys(entry)) expect(['type', 'checkKey']).toContain(k)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('the Fresh_Endpoint writes neither the secret nor the key to a response or log', async () => {
    await fc.assert(
      fc.asyncProperty(
        secretArb,
        secretArb,
        fc.constantFrom('read_error', 'user_error', 'bad_token', 'signed_out', 'signed_in'),
        async (secret, apiKey, mode) => {
          consoleLines = []
          const paths = [userPath({ id: 'p1', hobby: 'Bouldering', skills: [{ id: 's1', title: 'Footwork', level: 'beginner' }], currentSkillId: 's1' })]
          const h = createFreshEndpointHarness({
            failRead: mode === 'read_error',
            users: {
              good: { userId: 'user-1', data: mode === 'user_error' ? 'fail' : userData('en', paths) },
            },
          })
          if (mode === 'read_error') {
            h.deps.store = {
              readPage: async () => {
                throw new Error(`rpc failed ${secret} ${apiKey}`)
              },
            }
          }
          if (mode === 'user_error') {
            h.deps.loadUserData = async () => {
              throw new Error(`select failed ${secret} ${apiKey}`)
            }
          }
          const authorization =
            mode === 'bad_token' ? `Bearer ${secret}` : mode === 'signed_out' ? undefined : 'Bearer good'
          const body = { language: 'en', paths: [{ id: 'p1', hobby: 'Bouldering', skills: [{ id: 's1', title: 'Footwork', level: 'beginner' }], currentSkillId: 's1' }] }
          const result = await handleFreshRequest({ body, authorization, clientIp: '203.0.113.9' }, h.deps)
          const outputs = [JSON.stringify(result), ...h.logs.map((l) => JSON.stringify(l)), ...consoleLines]
          for (const text of outputs) {
            expect(leaks(text, secret)).toBe(false)
            expect(leaks(text, apiKey)).toBe(false)
          }
          for (const entry of h.logs) for (const k of Object.keys(entry)) expect(['type', 'durationMs']).toContain(k)
        },
      ),
      { numRuns: 150 },
    )
  })
})
