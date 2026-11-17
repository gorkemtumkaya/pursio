// Fresh_Endpoint examples (spec: fresh, task 12.8, Req 19.12, 19.18, 8.4 to 8.17).
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { FreshResponse, FreshResponseOk } from '../../shared/types/fresh'
import type { PoolVideo } from '../../shared/types/video'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { normalizeText, poolKey } from '../../shared/utils/video-normalize'
import type { HandlerResponse } from '../../server/utils/llm-handlers'
import { FRESH_POOL_LIMIT, windowSkillIds } from '../../server/utils/fresh/compose'
import { handleFreshRequest, parseFreshRequest } from '../../server/utils/fresh/handlers'
import { currentWindow } from '../../server/utils/video/scheduler'
import { fakeFreshItem } from '../support/fresh-fakes'
import { createFreshEndpointHarness, userData, userPath, type FreshEndpointHarness } from '../support/fresh-route-fakes'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const IP = '192.0.2.10'
const DAY_MS = 86_400_000

const SKILLS = [
  { id: 'feet', title: 'Footwork', level: 'beginner' as const },
  { id: 'grip', title: 'Grip strength', level: 'beginner' as const },
  { id: 'rest', title: 'Resting', level: 'intermediate' as const },
  { id: 'flag', title: 'Flagging', level: 'intermediate' as const },
]

function body(overrides: Record<string, unknown> = {}, path: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    language: 'en',
    paths: [{ id: 'bouldering', hobby: 'Bouldering', skills: SKILLS, currentSkillId: 'feet', ...path }],
    ...overrides,
  }
}

function ok(result: HandlerResponse<FreshResponse>): FreshResponseOk {
  expect(result.status).toBe(200)
  if ('error' in result.body) throw new Error(`unexpected error ${result.body.error}`)
  return result.body
}

function signedOut(h: FreshEndpointHarness, b: unknown = body()) {
  return handleFreshRequest({ body: b, authorization: undefined, clientIp: IP }, h.deps)
}

function poolVideo(id: string, overrides: Partial<PoolVideo> = {}): PoolVideo {
  return {
    id,
    title: `Pool ${id}`,
    channel: 'Pool channel',
    channelId: 'UCpoolchannel',
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
    ...overrides,
  }
}

async function seedPool(h: FreshEndpointHarness, skillTitle: string, level: 'beginner' | 'intermediate', language: string, videos: PoolVideo[]) {
  const pk = poolKey({ hobby: 'Bouldering', skillTitle, level, language })
  await h.stores.pipeline.takeLease(pk, 'run')
  await h.stores.pipeline.storePool(pk, 'run', videos)
}

describe('parseFreshRequest', () => {
  it.each([
    ['more than 10 paths', { paths: Array.from({ length: 11 }, (_v, i) => ({ id: `p${i}`, hobby: 'h', skills: SKILLS, currentSkillId: null })) }, 'paths'],
    ['more than 200 Skills', body({}, { skills: Array.from({ length: 201 }, (_v, i) => ({ id: `s${i}`, title: 't', level: 'beginner' })) }), 'paths.0.skills'],
    ['no Skills', body({}, { skills: [] }), 'paths.0.skills'],
    ['an empty path id', body({}, { id: '' }), 'paths.0.id'],
    ['an empty hobby', body({}, { hobby: '   ' }), 'paths.0.hobby'],
    ['a hobby over 100 characters', body({}, { hobby: 'h'.repeat(101) }), 'paths.0.hobby'],
    ['an empty Skill id', body({}, { skills: [{ id: '', title: 't', level: 'beginner' }] }), 'paths.0.skills.0.id'],
    ['an empty Skill title', body({}, { skills: [...SKILLS, { id: 'x', title: '', level: 'beginner' }] }), 'paths.0.skills.4.title'],
    ['a title over 100 characters', body({}, { skills: [{ id: 'x', title: 't'.repeat(101), level: 'beginner' }] }), 'paths.0.skills.0.title'],
    ['a Level outside the list', body({}, { skills: [{ id: 'x', title: 't', level: 'expert' }] }), 'paths.0.skills.0.level'],
    ['an unknown Current_Skill id', body({}, { currentSkillId: 'nope' }), 'paths.0.currentSkillId'],
    ['a missing Current_Skill id', body({}, { currentSkillId: undefined }), 'paths.0.currentSkillId'],
    ['a non-string language', body({ language: 7 }), 'language'],
    ['a body that is not an object', 'paths', 'body'],
  ])('rejects %s', async (_name, b, field) => {
    expect(parseFreshRequest(b)).toEqual({ ok: false, field })
    const h = createFreshEndpointHarness()
    expect(await signedOut(h, b)).toEqual({ status: 400, body: { error: 'invalid_input', field } })
    expect(h.reads).toEqual([])
  })

  it('accepts exactly 100 characters, 10 paths and 200 Skills', () => {
    const skills = Array.from({ length: 200 }, (_v, i) => ({ id: `s${i}`, title: 't'.repeat(100), level: 'advanced' }))
    const paths = Array.from({ length: 10 }, (_v, i) => ({ id: `p${i}`, hobby: 'h'.repeat(100), skills, currentSkillId: 's0' }))
    expect(parseFreshRequest({ paths }).ok).toBe(true)
  })

  it.each([undefined, null, '', '  '])('reads the language %j as en', (language) => {
    const parsed = parseFreshRequest({ ...body(), language })
    expect(parsed.ok && parsed.request.language).toBe('en')
  })

  it('accepts a null currentSkillId', () => {
    const parsed = parseFreshRequest(body({}, { currentSkillId: null }))
    expect(parsed.ok && parsed.request.paths[0]?.currentSkillId).toBeNull()
  })
})

// spec: fresh-v2, Requirements 9.9 and 12.8.
describe('colorSlot and completedCount of a signed-out body', () => {
  it('copies valid values into the response path', async () => {
    const h = createFreshEndpointHarness()
    const res = ok(await signedOut(h, body({}, { colorSlot: 4, completedCount: 3 })))
    expect(res.paths.map((p) => [p.colorSlot, p.completedCount])).toEqual([[4, 3]])
    const edges = ok(await signedOut(h, body({}, { colorSlot: 5, completedCount: SKILLS.length })))
    expect(edges.paths.map((p) => [p.colorSlot, p.completedCount])).toEqual([[5, SKILLS.length]])
  })

  it('reads a body with neither field as slot 1 and 0 completed (D-C)', () => {
    const parsed = parseFreshRequest(body())
    expect(parsed.ok && [parsed.request.paths[0]?.colorSlot, parsed.request.paths[0]?.completedCount]).toEqual([1, 0])
  })

  it.each([0, 6, 2.5, -1, '3', null, true, Number.NaN])('rejects colorSlot %j with 400 and the field', async (colorSlot) => {
    expect(parseFreshRequest(body({}, { colorSlot }))).toEqual({ ok: false, field: 'paths[0].colorSlot' })
    const h = createFreshEndpointHarness()
    const res = await signedOut(h, body({}, { colorSlot }))
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'invalid_input', field: 'paths[0].colorSlot' })
    expect(h.reads).toHaveLength(0)
  })

  it.each([-1, SKILLS.length + 1, 1.5, '2', null, Number.POSITIVE_INFINITY])(
    'rejects completedCount %j with 400 and the field',
    async (completedCount) => {
      expect(parseFreshRequest(body({}, { completedCount }))).toEqual({ ok: false, field: 'paths[0].completedCount' })
      const h = createFreshEndpointHarness()
      const res = await signedOut(h, body({}, { completedCount }))
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'invalid_input', field: 'paths[0].completedCount' })
    },
  )

  it('names the path index and reports colorSlot before completedCount', () => {
    const second = { id: 'guitar', hobby: 'Guitar', skills: SKILLS, currentSkillId: null }
    const paths = [{ id: 'bouldering', hobby: 'Bouldering', skills: SKILLS, currentSkillId: 'feet' }]
    expect(parseFreshRequest({ paths: [...paths, { ...second, colorSlot: 9, completedCount: -4 }] })).toEqual({
      ok: false,
      field: 'paths[1].colorSlot',
    })
    expect(parseFreshRequest({ paths: [...paths, { ...second, colorSlot: 2, completedCount: -4 }] })).toEqual({
      ok: false,
      field: 'paths[1].completedCount',
    })
  })
})

describe('Fresh_Endpoint requests', () => {
  it('signed out: Goal_Class none, IP rate limit, window from the body, one read', async () => {
    const h = createFreshEndpointHarness()
    const res = ok(await signedOut(h))
    expect(res.paths).toEqual([
      {
        id: 'bouldering',
        hobbyId: null,
        hobby: 'Bouldering',
        goalClass: 'none',
        currentSkillId: 'feet',
        windowSkillIds: ['feet', 'grip', 'rest'],
        skills: SKILLS,
        activeAt: null,
        // A body without the fresh-v2 fields reads as slot 1 and 0 completed (D-C).
        colorSlot: 1,
        completedCount: 0,
      },
    ])
    expect(h.limiterKeys).toEqual([`ip:${IP}`])
    expect(h.reads).toHaveLength(1)
    expect(h.storeCalls).toEqual(['readPage'])
    expect(res.mutes).toEqual([])
    expect(res.events).toEqual([])
  })

  it('signed out over the limit: 429 with no read', async () => {
    const h = createFreshEndpointHarness({ limit: 2 })
    await signedOut(h)
    await signedOut(h)
    expect(await signedOut(h)).toEqual({ status: 429, body: { error: 'rate_limited' } })
    expect(h.reads).toHaveLength(2)
  })

  it.each(['Bearer bad-token', 'Basic abc', 'Bearer'])('answers 401 with no read for %j', async (authorization) => {
    const h = createFreshEndpointHarness({ users: { good: { userId: 'u1', data: userData('en', []) } } })
    expect(await handleFreshRequest({ body: body(), authorization, clientIp: IP }, h.deps)).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    })
    expect(h.reads).toEqual([])
    expect(h.userLoads).toEqual([])
    expect(h.limiterKeys).toEqual([])
  })

  it('signed in: user rate limit, stored Goal_Class, mutes and events, body ignored', async () => {
    const mutes = [{ channelId: 'UCmuted', muted: true, changedAt: 1 }]
    const path = userPath({ id: 'uuid-1', hobby: 'Bouldering', skills: SKILLS, currentSkillId: 'grip', goalClass: 'targeted' })
    const h = createFreshEndpointHarness({ users: { tok: { userId: 'u1', data: userData('en', [path], { mutes }) } } })
    const res = ok(await handleFreshRequest({ body: 'ignored', authorization: 'Bearer tok', clientIp: IP }, h.deps))
    expect(h.limiterKeys).toEqual(['user:u1'])
    expect(res.paths[0]?.goalClass).toBe('targeted')
    expect(res.paths[0]?.windowSkillIds).toEqual(['grip', 'rest', 'flag'])
    expect(res.mutes).toEqual(mutes)
  })

  it('signed in with no stored language reads en keys', async () => {
    const path = userPath({ id: 'uuid-1', hobby: 'Bouldering', skills: SKILLS, currentSkillId: 'feet' })
    const h = createFreshEndpointHarness({ users: { tok: { userId: 'u1', data: userData('', [path]) } } })
    const res = ok(await handleFreshRequest({ body: null, authorization: 'Bearer tok', clientIp: IP }, h.deps))
    expect(res.language).toBe('en')
    expect(h.reads[0]?.checkKeys).toEqual([{ hobby: 'bouldering', language: 'en' }])
  })

  it('a missing language reads only en keys', async () => {
    const h = createFreshEndpointHarness()
    const b = body()
    delete b.language
    ok(await signedOut(h, b))
    expect(h.reads[0]?.checkKeys).toEqual([{ hobby: 'bouldering', language: 'en' }])
    expect(h.reads[0]?.poolKeys.map((k) => (JSON.parse(k) as string[])[3])).toEqual(['en', 'en', 'en'])
  })

  it('a de request reads the de and en keys', async () => {
    const h = createFreshEndpointHarness()
    ok(await signedOut(h, body({ language: 'de-AT' })))
    expect(h.reads[0]?.checkKeys).toEqual([
      { hobby: 'bouldering', language: 'de' },
      { hobby: 'bouldering', language: 'en' },
    ])
    expect(h.reads[0]?.poolKeys).toHaveLength(6)
  })

  it('0 paths: empty lists, no check time and no read', async () => {
    const h = createFreshEndpointHarness()
    const res = ok(await signedOut(h, { paths: [] }))
    expect(res).toMatchObject({ paths: [], items: [], pools: [], sources: [], checkTimes: [], mutes: [], events: [] })
    expect(h.reads).toEqual([])
  })

  it('a read failure gives 200 with empty lists and a fresh_read_failed log', async () => {
    const h = createFreshEndpointHarness({ failRead: true })
    h.stores.fresh.setCheckState({ hobby: 'bouldering', language: 'en' }, { lastSuccessMs: 1, lastAttemptMs: 1 })
    const res = ok(await signedOut(h))
    expect(res).toMatchObject({ items: [], pools: [], sources: [], checkTimes: [] })
    expect(h.logs).toContainEqual({ type: 'fresh_read_failed' })
  })

  it('a user read failure gives 200 with empty lists', async () => {
    const h = createFreshEndpointHarness({ users: { tok: { userId: 'u1', data: 'fail' } } })
    const res = ok(await handleFreshRequest({ body: null, authorization: 'Bearer tok', clientIp: IP }, h.deps))
    expect(res).toMatchObject({ paths: [], items: [], pools: [], sources: [], checkTimes: [], mutes: [], events: [] })
    expect(h.reads).toEqual([])
    expect(h.logs).toContainEqual({ type: 'fresh_read_failed' })
  })

  it('writes one timing log with the duration only', async () => {
    const h = createFreshEndpointHarness()
    await signedOut(h)
    const timing = h.logs.filter((l) => l.type === 'fresh_timing')
    expect(timing).toHaveLength(1)
    expect(Object.keys(timing[0] ?? {}).sort()).toEqual(['durationMs', 'type'])
  })
})

describe('Fresh_Endpoint composition', () => {
  it('a null currentSkillId returns no window videos but still its items, sources and check time', async () => {
    const h = createFreshEndpointHarness()
    const now = h.clock.now()
    await seedPool(h, 'Footwork', 'beginner', 'en', [poolVideo('poolvideo01')])
    h.stores.fresh.setSources({ hobby: 'bouldering', language: 'en' }, [
      { channelId: 'UCsource', channelName: 'Source', qualifyingCount: 3, latestQualifyingMs: now, lastCheckedMs: null },
    ])
    h.stores.fresh.setCheckState({ hobby: 'bouldering', language: 'en' }, { lastSuccessMs: now - 1000, lastAttemptMs: now - 1000 })
    h.stores.fresh.putItem(fakeFreshItem('vidAAAAAAA1', { skillNorm: 'footwork', publishedMs: now - 1000, foundMs: now - 1000 }))
    const res = ok(await signedOut(h, body({}, { currentSkillId: null })))
    expect(res.paths[0]?.windowSkillIds).toEqual([])
    expect(res.pools).toEqual([])
    expect(h.reads[0]?.poolKeys).toEqual([])
    expect(res.items.map((i) => [i.videoId, i.matches])).toEqual([['vidAAAAAAA1', [{ pathId: 'bouldering', skillId: 'feet' }]]])
    expect(res.sources).toEqual([{ hobby: 'bouldering', language: 'en', channelId: 'UCsource', channelName: 'Source' }])
    expect(res.checkTimes).toEqual([{ hobby: 'bouldering', language: 'en', lastSuccessMs: now - 1000 }])
  })

  it('adds en items after fewer than 3 user-language items, keeping the user copy of a duplicate', async () => {
    const h = createFreshEndpointHarness()
    const now = h.clock.now()
    const at = (ms: number) => ({ publishedMs: now - ms, foundMs: now - ms })
    h.stores.fresh.putItem(fakeFreshItem('vidDE000001', { language: 'de', ...at(1000) }))
    h.stores.fresh.putItem(fakeFreshItem('vidBOTH0001', { language: 'de', ...at(2000), why: 'Deutsche Kopie.' }))
    h.stores.fresh.putItem(fakeFreshItem('vidBOTH0001', { language: 'en', ...at(500), why: 'English copy.' }))
    h.stores.fresh.putItem(fakeFreshItem('vidEN000001', { language: 'en', ...at(3000) }))
    const res = ok(await signedOut(h, body({ language: 'de' })))
    expect(res.items.map((i) => [i.videoId, i.poolLanguage])).toEqual([
      ['vidDE000001', 'de'],
      ['vidBOTH0001', 'de'],
      ['vidEN000001', 'en'],
    ])
    expect(res.items[1]?.why).toBe('Deutsche Kopie.')
  })

  it('adds no en items once a Skill has 3 user-language items', async () => {
    const h = createFreshEndpointHarness()
    const now = h.clock.now()
    for (const id of ['vidDE000001', 'vidDE000002', 'vidDE000003']) {
      h.stores.fresh.putItem(fakeFreshItem(id, { language: 'de', publishedMs: now - 1000, foundMs: now - 1000 }))
    }
    h.stores.fresh.putItem(fakeFreshItem('vidEN000001', { language: 'en', publishedMs: now - 1000, foundMs: now - 1000 }))
    const res = ok(await signedOut(h, body({ language: 'de' })))
    expect(res.items.map((i) => i.poolLanguage)).toEqual(['de', 'de', 'de'])
  })

  it('returns only items published within the last 7 days', async () => {
    const h = createFreshEndpointHarness()
    const now = h.clock.now()
    h.stores.fresh.putItem(fakeFreshItem('vidOLD00001', { publishedMs: now - 7 * DAY_MS, foundMs: now - DAY_MS }))
    h.stores.fresh.putItem(fakeFreshItem('vidNEW00001', { publishedMs: now - 7 * DAY_MS + 1000, foundMs: now - DAY_MS }))
    const res = ok(await signedOut(h))
    expect(res.items.map((i) => i.videoId)).toEqual(['vidNEW00001'])
  })

  it('matches a Fresh_Item whose Level differs from the Skill section Level', async () => {
    const h = createFreshEndpointHarness()
    const now = h.clock.now()
    h.stores.fresh.putItem(fakeFreshItem('vidLVL00001', { skillNorm: 'flagging', level: 'beginner', publishedMs: now - 1000, foundMs: now - 1000 }))
    const res = ok(await signedOut(h, body({}, { hobby: ' BOULDERING! ' })))
    expect(res.items.map((i) => [i.videoId, i.level, i.matches])).toEqual([
      ['vidLVL00001', 'beginner', [{ pathId: 'bouldering', skillId: 'flag' }]],
    ])
  })

  it('ranks the window pools with the en fallback and the 24 limit', async () => {
    const h = createFreshEndpointHarness()
    await seedPool(h, 'Footwork', 'beginner', 'de', [poolVideo('poolDE00001', { teachesThisSkill: 0.6 })])
    await seedPool(
      h,
      'Footwork',
      'beginner',
      'en',
      Array.from({ length: 30 }, (_v, i) => poolVideo(`poolEN${String(i).padStart(5, '0')}`)),
    )
    const res = ok(await signedOut(h, body({ language: 'de' })))
    expect(res.pools.map((p) => p.skillId)).toEqual(['feet', 'grip', 'rest'])
    const feet = res.pools[0]!
    expect(feet.videos).toHaveLength(FRESH_POOL_LIMIT)
    expect(feet.videos[0]).toMatchObject({ kind: 'pool', videoId: 'poolDE00001', poolLanguage: 'de', matches: [{ pathId: 'bouldering', skillId: 'feet' }] })
    expect(feet.videos[1]?.poolLanguage).toBe('en')
  })

  it('windowSkillIds matches the pipeline Current_Window', () => {
    const loaded = loadSkillTree(sampleJson)
    if (!loaded.ok) throw new Error('sample tree invalid')
    const tree = loaded.value
    const skills = tree.sections.flatMap((s) => s.nodes.map((n) => ({ id: n.id })))
    for (const { id } of [...skills, { id: 'unknown' }]) {
      expect(windowSkillIds(skills, id)).toEqual(currentWindow(tree, id).map((w) => w.node.id))
    }
    expect(windowSkillIds(skills, null)).toEqual([])
    expect(normalizeText(tree.hobby)).toBe('bouldering')
  })
})

describe('Fresh_Endpoint import boundary (Req 3.11, 8.6)', () => {
  /** Value imports (not `import type`) of a module, resolved to repo-relative paths. */
  function valueImports(file: string): string[] {
    const source = readFileSync(join(ROOT, file), 'utf8')
    const out: string[] = []
    const re = /^(import|export)\s+(type\s+)?(\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s+from\s+'([^']+)'/gm
    for (const m of source.matchAll(re)) {
      if (m[2]) continue // import type / export type
      const spec = m[4] ?? ''
      if (!spec.startsWith('.')) continue
      const names = (m[3] ?? '').replace(/[{}\s]/g, '').split(',').filter(Boolean)
      // `import { type A, type B } from` brings no value either.
      if (names.length > 0 && names.every((n) => n.startsWith('type'))) continue
      out.push(resolve(dirname(join(ROOT, file)), spec).slice(ROOT.length) + '.ts')
    }
    return out
  }

  function graph(entry: string): Set<string> {
    const seen = new Set<string>()
    const todo = [entry]
    while (todo.length > 0) {
      const file = todo.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      todo.push(...valueImports(file))
    }
    return seen
  }

  it('handlers.ts reaches no check, feed fetcher, provider, model adapter or scheduler', () => {
    const reached = graph('server/utils/fresh/handlers.ts')
    for (const banned of [
      'server/utils/fresh/check.ts',
      'server/utils/fresh/feed-fetch.ts',
      'server/utils/video/provider.ts',
      'server/utils/video/youtube-provider.ts',
      'server/utils/video/select-provider.ts',
      'server/utils/video/scheduler.ts',
      'server/utils/video/pipeline.ts',
      'server/utils/providers/anthropic.ts',
      'server/utils/providers/openai.ts',
    ]) {
      expect(reached.has(banned), banned).toBe(false)
    }
    expect(reached.has('server/utils/fresh/compose.ts')).toBe(true)
    expect(reached.has('server/utils/video/request-guards.ts')).toBe(true)
    // Control: the runtime, which wires the Check_Route, does reach check.ts and the provider.
    const runtime = graph('server/utils/fresh/runtime.ts')
    expect(runtime.has('server/utils/fresh/check.ts')).toBe(true)
    expect(runtime.has('server/utils/fresh/feed-fetch.ts')).toBe(true)
    expect(runtime.has('server/utils/video/select-provider.ts')).toBe(true)
  })

  it('the Fresh_Endpoint route imports only the handler and the runtime deps', () => {
    expect(valueImports('server/api/fresh.post.ts').sort()).toEqual(['server/utils/fresh/handlers.ts', 'server/utils/fresh/runtime.ts'])
  })
})
