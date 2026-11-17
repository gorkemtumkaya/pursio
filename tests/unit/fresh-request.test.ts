// Fresh request layer (spec: fresh, task 13.7; Req 8.2, 8.15, 16.4 to 16.6, 19.13, 19.20).
import { describe, expect, it, vi } from 'vitest'
import type { FreshResponseOk } from '../../shared/types/fresh'
import { emptyProgress } from '../../shared/utils/progress-engine'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import sample from '../../data/sample-bouldering.json'
import { createFreshLoader, FRESH_TIMEOUT_MS } from '../../app/composables/useFresh'
import { parseFreshResponse } from '../../app/utils/fresh-api'
import { buildFreshRequest, demoBody, requestPath, signedOutBody } from '../../app/utils/fresh-request'
import type { HobbyLibrary } from '../../app/utils/hobby-store'
import { freshItem, freshPath, freshResponse } from '../support/fresh-client'

const loaded = loadSkillTree(sample)
if (!loaded.ok) throw new Error('sample tree must load')
const tree = loaded.value

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createFreshLoader', () => {
  it('starts in loading and becomes ready with the response', async () => {
    const response = freshResponse({ paths: [freshPath('p', 'Bouldering', 's1')] })
    const loader = createFreshLoader({ load: async () => response, now: () => 42 })
    expect(loader.status.value).toBe('loading')
    await loader.start()
    expect(loader.status.value).toBe('ready')
    expect(loader.response.value).toBe(response)
    expect(loader.receivedAt.value).toBe(42)
  })

  it('shows the error state after a failed request (Req 16.4)', async () => {
    const loader = createFreshLoader({ load: async () => Promise.reject(new Error('network')) })
    await loader.start()
    expect(loader.status.value).toBe('error')
    expect(loader.pending.value).toBe(false)
  })

  it('shows the error state after an error response (Req 16.4)', () => {
    expect(() => parseFreshResponse({ error: 'rate_limited' })).toThrow()
    expect(() => parseFreshResponse({ error: 'invalid_input', field: 'paths' })).toThrow()
    expect(() => parseFreshResponse(null)).toThrow()
  })

  it('shows the error state when no response arrives within 10 s (Req 16.4)', async () => {
    vi.useFakeTimers()
    try {
      let aborted = false
      const loader = createFreshLoader({
        load: (signal) =>
          new Promise<FreshResponseOk>(() => {
            signal.addEventListener('abort', () => {
              aborted = true
            })
          }),
      })
      const run = loader.start()
      await vi.advanceTimersByTimeAsync(FRESH_TIMEOUT_MS - 1)
      expect(loader.status.value).toBe('loading')
      await vi.advanceTimersByTimeAsync(1)
      await run
      expect(loader.status.value).toBe('error')
      expect(aborted).toBe(true)
      expect(FRESH_TIMEOUT_MS).toBe(10_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends exactly one request per retry, none while one is pending (Req 16.5)', async () => {
    const calls: ReturnType<typeof deferred<FreshResponseOk>>[] = []
    const loader = createFreshLoader({
      load: () => {
        const d = deferred<FreshResponseOk>()
        calls.push(d)
        return d.promise
      },
    })
    const first = loader.start()
    calls[0]!.reject(new Error('down'))
    await first
    expect(loader.status.value).toBe('error')

    const retry = loader.retry()
    expect(calls).toHaveLength(2)
    expect(loader.pending.value).toBe(true) // the "Try again" button is disabled
    void loader.retry()
    void loader.retry()
    expect(calls).toHaveLength(2)
    calls[1]!.resolve(freshResponse())
    await retry
    expect(loader.status.value).toBe('ready')
    expect(loader.pending.value).toBe(false)
    expect(calls).toHaveLength(2)
  })

  it('a failed retry shows the error and an enabled "Try again" again (Req 16.5)', async () => {
    let n = 0
    const loader = createFreshLoader({ load: async () => Promise.reject(new Error(`fail ${++n}`)) })
    await loader.start()
    await loader.retry()
    expect(n).toBe(2)
    expect(loader.status.value).toBe('error')
    expect(loader.pending.value).toBe(false)
  })
})

describe('Fresh request bodies', () => {
  it('Demo_Mode sends the Demo_Paths and no token (Req 8.15, 19.20)', async () => {
    const demo = await buildFreshRequest({
      kind: 'demo',
      id: 'demo',
      tree,
      progress: () => emptyProgress(),
      language: () => null,
    })
    expect(demo.token).toBeNull()
    expect(demo.body.language).toBe('en')
    expect(demo.body.paths).toHaveLength(1)
    const path = demo.body.paths[0]!
    expect(path.hobby).toBe(tree.hobby)
    expect(path.skills.map((s) => s.id)).toEqual(tree.sections.flatMap((s) => s.nodes.map((n) => n.id)))
    expect(path.currentSkillId).toBe(tree.sections[0]!.nodes[0]!.id)
  })

  it('with a token sends it and lets the Server read the paths', async () => {
    const library = vi.fn((): HobbyLibrary => ({ hobbies: [], activeId: null }))
    const req = await buildFreshRequest({
      kind: 'account',
      token: async () => 'tok',
      library,
      progressOf: () => emptyProgress(),
      language: () => 'de',
    })
    expect(req).toEqual({ body: { language: 'de', paths: [] }, token: 'tok' })
    expect(library).not.toHaveBeenCalled()
  })

  it('without a token sends the local library, active hobby first, archived left out (Req 8.2)', async () => {
    const make = (id: string, addedAt: number, archived = false) => ({
      id,
      tree: { ...tree, hobby: id },
      model: 'm',
      addedAt,
      archived,
      colorSlot: (((addedAt - 1) % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    })
    const library: HobbyLibrary = {
      hobbies: [make('a', 1), make('b', 2), make('c', 3, true), make('d', 4)],
      activeId: 'a',
    }
    const req = await buildFreshRequest({
      kind: 'account',
      token: async () => null,
      library: () => library,
      progressOf: () => emptyProgress(),
      language: () => '',
    })
    expect(req.token).toBeNull()
    expect(req.body.language).toBe('en')
    expect(req.body.paths.map((p) => p.id)).toEqual(['a', 'd', 'b'])
    // Each path carries its record's Color_Slot and its completed count (spec: fresh-v2, Req 9.9).
    expect(req.body.paths.map((p) => [p.id, p.colorSlot, p.completedCount])).toEqual([
      ['a', 1, 0],
      ['d', 4, 0],
      ['b', 2, 0],
    ])
  })

  it('counts the completed Skills that are sent, and the Demo_Path uses slot 1 (spec: fresh-v2, Req 9.9)', () => {
    const ids = tree.sections.flatMap((s) => s.nodes.map((n) => n.id))
    const progress = { completed: [ids[0]!, ids[1]!, 'not-a-skill', ids[0]!], quests: {} }
    const path = requestPath('p', tree, progress, 3)
    expect(path?.colorSlot).toBe(3)
    expect(path?.completedCount).toBe(2)
    expect(path?.skills.length).toBe(ids.length)
    expect(requestPath('p', tree, emptyProgress(), 5)?.completedCount).toBe(0)
    expect(requestPath('p', tree, { completed: ids, quests: {} }, 1)?.completedCount).toBe(ids.length)

    const demo = demoBody('demo', tree, progress, null)
    expect(demo.paths.map((p) => [p.colorSlot, p.completedCount])).toEqual([[1, 2]])
  })

  it('a completed path has a null Current_Skill (decision D16)', () => {
    const all = tree.sections.flatMap((s) => s.nodes.map((n) => n.id))
    const path = requestPath('demo', tree, { completed: all, quests: {} }, 1)
    expect(path?.currentSkillId).toBeNull()
  })

  it('keeps at most 10 paths and clips texts to the body limits (Req 8.3)', () => {
    const hobbies = Array.from({ length: 12 }, (_, i) => ({
      id: `h${i}`,
      tree: { ...tree, hobby: `${'x'.repeat(120)}${i}` },
      model: 'm',
      addedAt: i,
      archived: false,
      colorSlot: 1 as const,
    }))
    const body = signedOutBody({ hobbies, activeId: null }, () => emptyProgress(), null)
    expect(body.paths).toHaveLength(10)
    for (const p of body.paths) expect(p.hobby.length).toBeLessThanOrEqual(100)
    expect(demoBody('x', { ...tree, hobby: '   ' }, emptyProgress(), null).paths).toEqual([])
  })
})

describe('parseFreshResponse', () => {
  it('reads a valid response and drops bad entries', () => {
    const good = freshItem('v1', 'p', 's1')
    const parsed = parseFreshResponse({
      ...freshResponse({ paths: [freshPath('p', 'Bouldering', 's1')] }),
      items: [good, { ...good, videoId: '' }, 'junk'],
      mutes: [{ channelId: 'UCa', muted: true, changedAt: 3 }, { channelId: '', muted: true, changedAt: 3 }],
      events: [{ bad: true }],
    })
    expect(parsed.items).toEqual([good])
    expect(parsed.mutes).toEqual([{ channelId: 'UCa', muted: true, changedAt: 3 }])
    expect(parsed.events).toEqual([])
  })

  it('reads missing mutes and events as empty lists', () => {
    const { mutes: _m, events: _e, ...rest } = freshResponse()
    const parsed = parseFreshResponse(rest)
    expect(parsed.mutes).toEqual([])
    expect(parsed.events).toEqual([])
  })
})
