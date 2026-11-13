import { afterEach, describe, expect, it, vi } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { PathInsertRow, ProgressWriteRow } from '../../shared/types/cloud'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { THEME_STORAGE_KEY } from '../../shared/utils/theme'
import { ACTIVE_HOBBY_KEY } from '../../app/utils/active-hobby'
import { ACTIVITY_STORAGE_KEY } from '../../app/utils/activity-store'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY, serializeGeneratedTree } from '../../app/utils/generated-tree'
import { HOBBY_LIBRARY_KEY, hobbyProgressKey } from '../../app/utils/hobby-store'
import {
  clearLegacyData,
  IMPORT_DEADLINE_MS,
  planImport,
  readLegacyData,
  runLegacyImport,
} from '../../app/utils/legacy-import'
import type { ImportApi, ImportPlan, LegacyData } from '../../app/utils/legacy-import'
import { LLM_SETTINGS_KEY } from '../../app/utils/llm-settings'
import { progressStorageKey } from '../../app/utils/progress-store'
import type { StorageLike } from '../../app/utils/progress-store'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const bouldering: SkillTree = loaded.value
const withHobby = (hobby: string): SkillTree => ({ ...bouldering, hobby })
const guitar = withHobby('Guitar')
const chess = withHobby('Chess')
const [firstId, secondId, thirdId] = bouldering.sections.flatMap(section => section.nodes.map(node => node.id)) as [
  string,
  string,
  string,
]

interface SpyStorage extends StorageLike {
  data: Map<string, string>
  /** Every `setItem` and `removeItem` call. */
  writes: string[]
}

function memoryStorage(initial: Record<string, string> = {}): SpyStorage {
  const data = new Map(Object.entries(initial))
  const writes: string[] = []
  return {
    data,
    writes,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => {
      writes.push(`set ${k}`)
      data.set(k, v)
    },
    removeItem: (k) => {
      writes.push(`remove ${k}`)
      data.delete(k)
    },
  }
}

const progressJson = (completed: string[]): string => JSON.stringify({ completed, quests: {} })
const libraryJson = (hobbies: unknown[], activeId?: unknown): string =>
  JSON.stringify(activeId === undefined ? { hobbies } : { hobbies, activeId })
const entry = (tree: SkillTree, addedAt: number, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: tree.hobby.toLowerCase(),
  tree,
  model: 'model-1',
  addedAt,
  ...extra,
})

const NOW = Date.UTC(2026, 0, 15, 12)
const T1 = Date.UTC(2025, 5, 1)
const T2 = Date.UTC(2025, 6, 1)

function context(): { userId: string, now: number, newId: () => string } {
  let made = 0
  return { userId: 'user-1', now: NOW, newId: () => `path-${(made += 1)}` }
}

describe('readLegacyData', () => {
  it('returns null when no Legacy_Data key exists, whatever else is stored', () => {
    const storage = memoryStorage({
      [progressStorageKey('Bouldering')]: progressJson([firstId]),
      [THEME_STORAGE_KEY]: 'trail',
      [LLM_SETTINGS_KEY]: '{}',
      [hobbyProgressKey('guitar')]: progressJson([firstId]),
    })
    expect(readLegacyData(() => storage)).toBeNull()
    expect(readLegacyData(() => null)).toBeNull()
    expect(
      readLegacyData(() => {
        throw new Error('no storage')
      }),
    ).toBeNull()
  })

  it('writes and removes nothing, also for unreadable values (Req 8.5)', () => {
    const initial = {
      [HOBBY_LIBRARY_KEY]: libraryJson([entry(guitar, T1), { id: 'broken', tree: {}, model: 'm', addedAt: 1 }], 'guitar'),
      [hobbyProgressKey('guitar')]: 'not json',
      [GENERATED_TREE_KEY]: '{broken',
      [GENERATED_PROGRESS_KEY]: progressJson(['ghost']),
      [ACTIVITY_STORAGE_KEY]: '{"completions":"none"}',
    }
    const storage = memoryStorage(initial)

    const legacy = readLegacyData(() => storage)

    expect(storage.writes).toEqual([])
    expect(Object.fromEntries(storage.data)).toEqual(initial)
    expect(legacy).toEqual({
      entries: [
        {
          id: 'guitar',
          tree: guitar,
          model: 'model-1',
          archived: false,
          addedAt: T1,
          progress: { completed: [], quests: {} },
        },
      ],
      activeId: 'guitar',
      completions: [],
    })
  })

  it('reads the library in order and then the earlier Generated_Tree', () => {
    const storage = memoryStorage({
      [HOBBY_LIBRARY_KEY]: libraryJson([entry(guitar, T1, { archived: true }), entry(chess, T2)], 'chess'),
      [hobbyProgressKey('guitar')]: JSON.stringify({
        completed: [secondId, 'ghost', firstId],
        quests: { [firstId]: [true, false, false], ghost: [true, true, true] },
      }),
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: bouldering, model: 'model-g' }),
      [GENERATED_PROGRESS_KEY]: progressJson([thirdId]),
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({ completions: [30, 10, 20] }),
    })

    expect(readLegacyData(() => storage)).toEqual({
      entries: [
        {
          id: 'guitar',
          tree: guitar,
          model: 'model-1',
          archived: true,
          addedAt: T1,
          progress: { completed: [secondId, firstId], quests: { [firstId]: [true, false, false] } },
        },
        { id: 'chess', tree: chess, model: 'model-1', archived: false, addedAt: T2, progress: { completed: [], quests: {} } },
        {
          id: 'bouldering',
          tree: bouldering,
          model: 'model-g',
          archived: false,
          addedAt: null,
          progress: { completed: [thirdId], quests: {} },
        },
      ],
      activeId: 'chess',
      completions: [30, 10, 20],
    })
  })

  it('reads a Generated_Tree alone, and skips one whose Hobby_Id is already in the library', () => {
    const alone = memoryStorage({ [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: guitar, model: 'model-g' }) })
    expect(readLegacyData(() => alone)?.entries.map(e => [e.id, e.model, e.addedAt])).toEqual([
      ['guitar', 'model-g', null],
    ])

    const both = memoryStorage({
      [HOBBY_LIBRARY_KEY]: libraryJson([entry(guitar, T1)]),
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: withHobby(' GUITAR '), model: 'model-g' }),
    })
    expect(readLegacyData(() => both)?.entries.map(e => [e.id, e.model, e.addedAt])).toEqual([
      ['guitar', 'model-1', T1],
    ])
  })
})

describe('planImport', () => {
  const storage = (): SpyStorage =>
    memoryStorage({
      [HOBBY_LIBRARY_KEY]: libraryJson([entry(guitar, T1, { archived: true }), entry(chess, T2)], 'chess'),
      [hobbyProgressKey('guitar')]: progressJson([secondId, firstId]),
      [hobbyProgressKey('chess')]: progressJson([firstId]),
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: bouldering, model: 'model-g' }),
      [GENERATED_PROGRESS_KEY]: progressJson([thirdId, firstId]),
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({ completions: [400, 100, 300, 200] }),
    })

  it('plans the library plus the Generated_Tree with level new and the oldest log values first (Req 8.1 to 8.3)', () => {
    const legacy = readLegacyData(storage) as LegacyData
    const plan = planImport(legacy, 0, context())

    expect(plan.paths).toEqual([
      {
        id: 'path-1',
        user_id: 'user-1',
        hobby: 'Guitar',
        hobby_id: 'guitar',
        level: 'new',
        tree: guitar,
        mascot_set: guitar.mascot.set,
        model: 'model-1',
        archived: true,
        created_at: new Date(T1).toISOString(),
      },
      {
        id: 'path-2',
        user_id: 'user-1',
        hobby: 'Chess',
        hobby_id: 'chess',
        level: 'new',
        tree: chess,
        mascot_set: chess.mascot.set,
        model: 'model-1',
        archived: false,
        created_at: new Date(T2).toISOString(),
      },
      {
        id: 'path-3',
        user_id: 'user-1',
        hobby: 'Bouldering',
        hobby_id: 'bouldering',
        level: 'new',
        tree: bouldering,
        mascot_set: bouldering.mascot.set,
        model: 'model-g',
        archived: false,
        // The earlier Generated_Tree has no stored time.
        created_at: new Date(NOW).toISOString(),
      },
    ])
    expect(plan.progress).toEqual([
      {
        path_id: 'path-1',
        user_id: 'user-1',
        completed: [secondId, firstId],
        quests: {},
        completed_at: { [secondId]: 100, [firstId]: 200 },
        quest_ticks: {},
        daily_pick: null,
        daily_bonus_count: 0,
      },
      {
        path_id: 'path-2',
        user_id: 'user-1',
        completed: [firstId],
        quests: {},
        completed_at: { [firstId]: 300 },
        quest_ticks: {},
        daily_pick: null,
        daily_bonus_count: 0,
      },
      // The log ends after one more value: the last completed Node gets no timestamp.
      {
        path_id: 'path-3',
        user_id: 'user-1',
        completed: [thirdId, firstId],
        quests: {},
        completed_at: { [thirdId]: 400 },
        quest_ticks: {},
        daily_pick: null,
        daily_bonus_count: 0,
      },
    ])
    expect(plan.activeHobbyId).toBe('chess')
  })

  it('drops surplus log values and falls back to the first entry without a stored activeId', () => {
    const legacy: LegacyData = {
      entries: [
        { id: 'guitar', tree: guitar, model: 'm', archived: false, addedAt: T1, progress: { completed: [firstId], quests: {} } },
        { id: 'chess', tree: chess, model: 'm', archived: false, addedAt: T2, progress: { completed: [], quests: {} } },
      ],
      activeId: null,
      completions: [9, 7, 8],
    }
    const plan = planImport(legacy, 0, context())
    expect(plan.progress.map(row => row.completed_at)).toEqual([{ [firstId]: 7 }, {}])
    expect(plan.activeHobbyId).toBe('guitar')
    expect(legacy.completions).toEqual([9, 7, 8])
  })

  it('gives an empty plan when every entry is invalid (Req 8.7)', () => {
    const invalid = memoryStorage({
      [HOBBY_LIBRARY_KEY]: libraryJson(
        [
          { id: 'guitar', tree: guitar, model: '', addedAt: T1 },
          { id: 'chess', tree: { hobby: 'Chess', sections: [], mascot: { set: 'x' } }, model: 'm', addedAt: T2 },
          null,
        ],
        'guitar',
      ),
      [GENERATED_TREE_KEY]: JSON.stringify({ tree: guitar }),
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({ completions: [1, 2] }),
    })
    const legacy = readLegacyData(() => invalid)
    expect(legacy).toEqual({ entries: [], activeId: null, completions: [1, 2] })
    expect(planImport(legacy as LegacyData, 0, context())).toEqual({ paths: [], progress: [], activeHobbyId: null })
  })

  it('plans nothing when the user already has a path (Req 8.6)', () => {
    const legacy = readLegacyData(storage) as LegacyData
    let asked = 0
    const plan = planImport(legacy, 1, {
      userId: 'user-1',
      now: NOW,
      newId: () => `path-${(asked += 1)}`,
    })
    expect(plan).toEqual({ paths: [], progress: [], activeHobbyId: null })
    expect(asked).toBe(0)
  })
})

interface FakeApi extends ImportApi {
  calls: string[]
  inserted: { paths: PathInsertRow[], progress: ProgressWriteRow[] }
  deleted: string[][]
  signals: (AbortSignal | undefined)[]
}

function fakeApi(overrides: Partial<ImportApi> = {}): FakeApi {
  const api: FakeApi = {
    calls: [],
    inserted: { paths: [], progress: [] },
    deleted: [],
    signals: [],
    insertPaths: async (rows, signal) => {
      api.calls.push('insertPaths')
      api.signals.push(signal)
      if (overrides.insertPaths) return overrides.insertPaths(rows, signal)
      api.inserted.paths.push(...rows)
    },
    insertProgress: async (rows, signal) => {
      api.calls.push('insertProgress')
      api.signals.push(signal)
      if (overrides.insertProgress) return overrides.insertProgress(rows, signal)
      api.inserted.progress.push(...rows)
    },
    deletePaths: async (ids) => {
      api.calls.push('deletePaths')
      api.deleted.push([...ids])
      if (overrides.deletePaths) return overrides.deletePaths(ids)
    },
  }
  return api
}

function samplePlan(): ImportPlan {
  const legacy: LegacyData = {
    entries: [
      { id: 'guitar', tree: guitar, model: 'm', archived: false, addedAt: T1, progress: { completed: [firstId], quests: {} } },
      { id: 'chess', tree: chess, model: 'm', archived: true, addedAt: T2, progress: { completed: [], quests: {} } },
    ],
    activeId: 'chess',
    completions: [5],
  }
  return planImport(legacy, 0, context())
}

describe('runLegacyImport', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('inserts the paths, then the progress, and deletes nothing', async () => {
    const api = fakeApi()
    const plan = samplePlan()
    expect(await runLegacyImport(api, plan)).toBe(true)
    expect(api.calls).toEqual(['insertPaths', 'insertProgress'])
    expect(api.inserted).toEqual({ paths: plan.paths, progress: plan.progress })
    expect(api.signals.every(signal => signal instanceof AbortSignal && !signal.aborted)).toBe(true)
  })

  it('an empty plan is a success without any call (Req 8.7)', async () => {
    const api = fakeApi()
    expect(await runLegacyImport(api, { paths: [], progress: [], activeHobbyId: null })).toBe(true)
    expect(api.calls).toEqual([])
  })

  it('a failing second insert deletes the paths of the plan and reports failure (Req 8.5)', async () => {
    const api = fakeApi({
      insertProgress: async () => {
        throw new Error('insert failed')
      },
    })
    const plan = samplePlan()

    expect(await runLegacyImport(api, plan)).toBe(false)

    expect(api.calls).toEqual(['insertPaths', 'insertProgress', 'deletePaths'])
    expect(api.deleted).toEqual([['path-1', 'path-2']])
    expect(api.deleted[0]).toEqual(plan.paths.map(row => row.id))
  })

  it('a failing first insert skips the second one and still deletes the plan ids', async () => {
    const api = fakeApi({
      insertPaths: async () => {
        throw new Error('insert failed')
      },
    })
    expect(await runLegacyImport(api, samplePlan())).toBe(false)
    expect(api.calls).toEqual(['insertPaths', 'deletePaths'])
    expect(api.deleted).toEqual([['path-1', 'path-2']])
  })

  it('a missed deadline deletes the paths of the plan, aborts the writes and reports failure', async () => {
    vi.useFakeTimers()
    const api = fakeApi({ insertProgress: () => new Promise<void>(() => {}) })
    const plan = samplePlan()

    const result = runLegacyImport(api, plan, 200)
    await vi.advanceTimersByTimeAsync(199)
    expect(api.calls).toEqual(['insertPaths', 'insertProgress'])
    await vi.advanceTimersByTimeAsync(1)

    expect(await result).toBe(false)
    expect(api.calls).toEqual(['insertPaths', 'insertProgress', 'deletePaths'])
    expect(api.deleted).toEqual([plan.paths.map(row => row.id)])
    expect(api.signals.every(signal => signal?.aborted === true)).toBe(true)
  })

  it('uses a 10 second deadline by default', async () => {
    vi.useFakeTimers()
    expect(IMPORT_DEADLINE_MS).toBe(10_000)
    const api = fakeApi({ insertPaths: () => new Promise<void>(() => {}) })

    let settled: boolean | null = null
    const result = runLegacyImport(api, samplePlan()).then((ok) => {
      settled = ok
    })
    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    await result
    expect(settled).toBe(false)
    expect(api.deleted).toEqual([['path-1', 'path-2']])
  })

  it('reports failure when the compensating delete fails or hangs too', async () => {
    const failing = fakeApi({
      insertPaths: async () => {
        throw new Error('insert failed')
      },
      deletePaths: async () => {
        throw new Error('delete failed')
      },
    })
    expect(await runLegacyImport(failing, samplePlan())).toBe(false)

    vi.useFakeTimers()
    const hanging = fakeApi({
      insertPaths: async () => {
        throw new Error('insert failed')
      },
      deletePaths: () => new Promise<void>(() => {}),
    })
    const result = runLegacyImport(hanging, samplePlan(), 100)
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe(false)
  })
})

describe('clearLegacyData', () => {
  it('removes exactly the Legacy_Data keys (Req 8.4)', () => {
    const kept = {
      [progressStorageKey('Bouldering')]: progressJson([firstId]),
      [THEME_STORAGE_KEY]: 'trail',
      [LLM_SETTINGS_KEY]: '{"provider":"anthropic"}',
      [ACTIVE_HOBBY_KEY]: 'guitar',
      unrelated: 'value',
    }
    const storage = memoryStorage({
      ...kept,
      [HOBBY_LIBRARY_KEY]: libraryJson(
        [
          entry(guitar, T1),
          // A stored id that differs from the recomputed one: both Progress keys go.
          { id: 'old chess', tree: chess, model: 'm', addedAt: T2 },
          // An entry the import skipped still owns its Progress key.
          { id: 'broken', tree: { hobby: 'Broken' }, model: '', addedAt: 3 },
        ],
        'guitar',
      ),
      [hobbyProgressKey('guitar')]: progressJson([firstId]),
      [hobbyProgressKey('chess')]: progressJson([secondId]),
      [hobbyProgressKey('old chess')]: progressJson([secondId]),
      [hobbyProgressKey('broken')]: progressJson([]),
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: bouldering, model: 'model-g' }),
      [GENERATED_PROGRESS_KEY]: progressJson([thirdId]),
      [ACTIVITY_STORAGE_KEY]: JSON.stringify({ completions: [1, 2, 3] }),
    })

    clearLegacyData(() => storage)

    expect(Object.fromEntries(storage.data)).toEqual(kept)
    expect(storage.writes.every(write => write.startsWith('remove '))).toBe(true)
    expect(readLegacyData(() => storage)).toBeNull()
  })

  it('removes the fixed keys when the library is unreadable or absent', () => {
    const storage = memoryStorage({
      [HOBBY_LIBRARY_KEY]: '{not json',
      [GENERATED_TREE_KEY]: '{',
      [ACTIVITY_STORAGE_KEY]: 'x',
      [progressStorageKey('Bouldering')]: progressJson([firstId]),
    })
    clearLegacyData(() => storage)
    expect([...storage.data.keys()]).toEqual([progressStorageKey('Bouldering')])

    const onlyLog = memoryStorage({ [ACTIVITY_STORAGE_KEY]: '{"completions":[]}', [THEME_STORAGE_KEY]: 'boulder' })
    clearLegacyData(() => onlyLog)
    expect([...onlyLog.data.keys()]).toEqual([THEME_STORAGE_KEY])
  })

  it('ignores a storage that is missing or throws', () => {
    expect(() => clearLegacyData(() => null)).not.toThrow()
    expect(() =>
      clearLegacyData(() => {
        throw new Error('no storage')
      }),
    ).not.toThrow()

    const data = new Map([[HOBBY_LIBRARY_KEY, libraryJson([entry(guitar, T1)])]])
    const throwing: StorageLike = {
      getItem: k => data.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(() => clearLegacyData(() => throwing)).not.toThrow()
  })
})
