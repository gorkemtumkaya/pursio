import { describe, expect, it, vi } from 'vitest'
import type { SkillTree } from '../../shared/types/skill-tree'
import {
  createProgressStore,
  parseStoredProgress,
  progressStorageKey,
  pruneProgress,
  serializeProgress,
  type StorageLike,
} from '../../app/utils/progress-store'

const node = (id: string) => ({
  id,
  title: id,
  description: 'd',
  prerequisites: [],
  optional: false,
  milestone: false,
  quests: ['a', 'b', 'c'] as [string, string, string],
})

const tree: SkillTree = {
  hobby: 'bouldering',
  sections: [{ title: 'Beginner', level: 'beginner', nodes: [node('a'), node('b')] }],
  mascot: { set: 'bouldering' },
}

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('denied')
  },
}

const key = progressStorageKey('bouldering')

describe('progress-store', () => {
  it('builds the versioned key', () => {
    expect(key).toBe('pursio-progress:v1:bouldering')
  })

  it('parses null as empty and valid', () => {
    expect(parseStoredProgress(null)).toEqual({ progress: { completed: [], quests: {} }, invalid: false })
  })

  it('flags bad JSON and schema mismatches as invalid', () => {
    expect(parseStoredProgress('{nope').invalid).toBe(true)
    expect(parseStoredProgress('{"completed":["a"],"quests":{"a":[true,false]}}').invalid).toBe(true)
    expect(parseStoredProgress('[]').invalid).toBe(true)
  })

  it('collapses duplicate completed ids', () => {
    const raw = '{"completed":["a","b","a"],"quests":{"a":[true,false,true]}}'
    expect(parseStoredProgress(raw)).toEqual({
      progress: { completed: ['a', 'b'], quests: { a: [true, false, true] } },
      invalid: false,
    })
  })

  it('round-trips through serialize and parse', () => {
    const p = { completed: ['b', 'x'], quests: { a: [false, true, false] as [boolean, boolean, boolean] } }
    expect(parseStoredProgress(serializeProgress(p)).progress).toEqual(p)
  })

  it('prunes ids missing from the tree', () => {
    const p = { completed: ['a', 'gone'], quests: { gone: [true, true, true] as [boolean, boolean, boolean] } }
    expect(pruneProgress(p, tree)).toEqual({ completed: ['a'], quests: {} })
  })

  it('saves and loads, pruning unknown ids', () => {
    const s = memoryStorage()
    const store = createProgressStore(() => s, tree)
    store.save({ completed: ['a', 'zzz'], quests: { b: [true, false, false] } })
    expect(store.load()).toEqual({ completed: ['a'], quests: { b: [true, false, false] } })
  })

  it('removes an invalid saved value on load', () => {
    const s = memoryStorage({ [key]: 'not json' })
    expect(createProgressStore(() => s, tree).load()).toEqual({ completed: [], quests: {} })
    expect(s.data.has(key)).toBe(false)
  })

  it('save calls setItem with the versioned hobby key', () => {
    const s = memoryStorage()
    const setItem = vi.fn(s.setItem)
    const store = createProgressStore(() => ({ ...s, setItem }), tree)
    const p = { completed: ['a'], quests: { b: [true, false, false] as [boolean, boolean, boolean] } }
    store.save(p)
    expect(setItem).toHaveBeenCalledTimes(1)
    expect(setItem).toHaveBeenCalledWith('pursio-progress:v1:bouldering', serializeProgress(p))
  })

  it('load with a missing key gives empty Progress and removes nothing', () => {
    const s = memoryStorage({ [progressStorageKey('guitar')]: '{"completed":["a"],"quests":{}}' })
    const removeItem = vi.fn(s.removeItem)
    const store = createProgressStore(() => ({ ...s, removeItem }), tree)
    expect(store.load()).toEqual({ completed: [], quests: {} })
    expect(removeItem).not.toHaveBeenCalled()
  })

  it('removes a schema-mismatched value with removeItem on the same key', () => {
    const s = memoryStorage({ [key]: '{"completed":"a","quests":{}}' })
    const removeItem = vi.fn(s.removeItem)
    const store = createProgressStore(() => ({ ...s, removeItem }), tree)
    expect(store.load()).toEqual({ completed: [], quests: {} })
    expect(removeItem).toHaveBeenCalledWith(key)
    expect(s.data.has(key)).toBe(false)
  })

  it('gives empty Progress when the value is invalid and removeItem throws', () => {
    const s = memoryStorage({ [key]: 'not json' })
    const store = createProgressStore(() => ({ ...s, removeItem: throwing.removeItem }), tree)
    expect(store.load()).toEqual({ completed: [], quests: {} })
  })

  it('returns empty and no-ops when storage is null or throws', () => {
    for (const get of [() => null, () => throwing, (): StorageLike => { throw new Error('blocked') }]) {
      const store = createProgressStore(get, tree)
      expect(store.load()).toEqual({ completed: [], quests: {} })
      expect(() => store.save({ completed: ['a'], quests: {} })).not.toThrow()
    }
  })
})
