// loadFreshUserData mapping (spec: fresh, task 12.3, Req 8.1, 8.8, 8.14, 8.16, 8.17).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Result = { data: unknown; error: unknown }
const db = vi.hoisted(() => ({
  tables: {} as Record<string, Result>,
  calls: [] as { table: string; ops: string[] }[],
  headers: [] as unknown[],
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, options?: { global?: { headers?: unknown } }) => {
    db.headers.push(options?.global?.headers)
    return {
      from: (table: string) => {
        const call = { table, ops: [] as string[] }
        db.calls.push(call)
        const builder = {
          select: (cols: string) => (call.ops.push(`select:${cols}`), builder),
          eq: (col: string, value: unknown) => (call.ops.push(`eq:${col}=${String(value)}`), builder),
          order: (col: string, opts: { ascending: boolean }) => (call.ops.push(`order:${col}:${opts.ascending ? 'asc' : 'desc'}`), builder),
          limit: (n: number) => (call.ops.push(`limit:${n}`), builder),
          abortSignal: () => (call.ops.push('signal'), builder),
          then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(db.tables[table] ?? { data: [], error: null }).then(resolve, reject),
        }
        return builder
      },
    }
  },
}))

import sampleJson from '../../data/sample-bouldering.json'
import { findCurrentNodeId } from '../../shared/utils/progress-engine'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { loadFreshUserData } from '../../server/utils/supabase-server'
import { currentWindow } from '../../server/utils/video/scheduler'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('sample tree invalid')
const TREE = loaded.value
const ALL_IDS = TREE.sections.flatMap((s) => s.nodes.map((n) => n.id))

function pathRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    hobby: 'Bouldering',
    hobby_id: 'bouldering',
    tree: sampleJson,
    goal_class: 'targeted',
    last_opened_at: '2026-11-10T10:00:00Z',
    created_at: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  db.tables = {}
  db.calls = []
  db.headers = []
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { supabaseUrl: 'https://db.example.test', supabaseAnonKey: 'anon' } }))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loadFreshUserData', () => {
  it('reads with the user token and maps paths, window, goal, activity, language, events and mutes', async () => {
    const completed = ALL_IDS.slice(0, 2)
    db.tables = {
      paths: { data: [pathRow('p1'), pathRow('p2', { goal_class: 'weird', last_opened_at: null }), pathRow('p3', { tree: { bad: true } })], error: null },
      progress: {
        data: [
          { path_id: 'p1', completed, updated_at: '2026-11-12T10:00:00Z' },
          { path_id: 'p2', completed: ALL_IDS, updated_at: '2026-11-09T10:00:00Z' },
        ],
        error: null,
      },
      profiles: { data: [{ language: 'de-AT' }], error: null },
      video_events: {
        data: [
          {
            video_id: 'vidAAAAAAA1', source: 'feed', played_at: '2026-11-10T10:00:00Z', watched_seconds: 30, finished: false,
            saved: true, saved_at: '2026-11-10T10:01:00Z', skipped: false, snapshot: null, snapshot_at: null, updated_at: '2026-11-10T10:01:00Z',
          },
          { video_id: '', source: 'feed' },
        ],
        error: null,
      },
      channel_mutes: { data: [{ channel_id: 'UCmuted', muted: true, changed_at: '2026-11-11T00:00:00Z' }, { channel_id: '', muted: true, changed_at: 'x' }], error: null },
    }
    const data = await loadFreshUserData('user-token', 'user-1', new AbortController().signal)

    expect(db.headers.every((h) => JSON.stringify(h) === JSON.stringify({ Authorization: 'Bearer user-token' }))).toBe(true)
    expect(db.calls.map((c) => c.table).sort()).toEqual(['channel_mutes', 'paths', 'profiles', 'progress', 'video_events'])
    expect(db.calls.find((c) => c.table === 'paths')?.ops).toEqual(
      expect.arrayContaining(['eq:user_id=user-1', 'eq:archived=false', 'order:created_at:asc', 'signal']),
    )
    expect(db.calls.find((c) => c.table === 'video_events')?.ops).toEqual(expect.arrayContaining(['order:updated_at:desc', 'limit:5000']))

    expect(data.language).toBe('de')
    expect(data.paths.map((p) => p.path.id)).toEqual(['p1', 'p2'])
    const [p1, p2] = data.paths
    const current = findCurrentNodeId(TREE, { completed, quests: {} })
    expect(p1?.path).toMatchObject({
      hobby: 'Bouldering',
      hobbyId: 'bouldering',
      goalClass: 'targeted',
      currentSkillId: current,
      windowSkillIds: currentWindow(TREE, current ?? '').map((w) => w.node.id),
      activeAt: Date.parse('2026-11-12T10:00:00Z'),
    })
    expect(p1?.path.skills).toHaveLength(ALL_IDS.length)
    expect(p1?.poolHobby).toBe(TREE.hobby)
    // Every Skill completed: no Current_Skill and an empty window; unknown goal reads none.
    expect(p2?.path).toMatchObject({ currentSkillId: null, windowSkillIds: [], goalClass: 'none', activeAt: Date.parse('2026-11-09T10:00:00Z') })
    expect(data.events.map((e) => [e.videoId, e.saved, e.savedAt])).toEqual([['vidAAAAAAA1', true, Date.parse('2026-11-10T10:01:00Z')]])
    expect(data.mutes).toEqual([{ channelId: 'UCmuted', muted: true, changedAt: Date.parse('2026-11-11T00:00:00Z') }])
  })

  it.each([null, '', '   '])('reads a stored language %j as en', async (language) => {
    db.tables = { profiles: { data: [{ language }], error: null } }
    expect((await loadFreshUserData('t', 'u')).language).toBe('en')
  })

  it('reads en when the profile row is missing', async () => {
    expect((await loadFreshUserData('t', 'u')).language).toBe('en')
  })

  it('throws a fixed label on a read error', async () => {
    db.tables = { channel_mutes: { data: null, error: { message: 'secret detail' } } }
    await expect(loadFreshUserData('t', 'u')).rejects.toThrow('fresh_user_read_failed:channel_mutes')
  })
})
