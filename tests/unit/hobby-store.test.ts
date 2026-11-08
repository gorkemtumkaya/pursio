import { describe, expect, it } from 'vitest'
import sampleJson from '../../data/sample-bouldering.json'
import type { SkillTree } from '../../shared/types/skill-tree'
import { loadSkillTree } from '../../shared/utils/skill-tree-load'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY, serializeGeneratedTree } from '../../app/utils/generated-tree'
import {
  addHobby,
  HOBBY_LIBRARY_KEY,
  hobbyEntries,
  hobbyId,
  hobbyPath,
  hobbyProgressKey,
  lastActivePath,
  loadHobbyLibrary,
  parseHobbyLibrary,
  pickHobby,
  serializeHobbyLibrary,
  setActiveHobby,
} from '../../app/utils/hobby-store'
import type { StorageLike } from '../../app/utils/progress-store'

const loaded = loadSkillTree(sampleJson)
if (!loaded.ok) throw new Error('Sample_Tree must load')
const bouldering: SkillTree = loaded.value
const withHobby = (hobby: string): SkillTree => ({ ...bouldering, hobby })
const guitar = withHobby('Guitar')
const firstId = bouldering.sections[0]!.nodes[0]!.id

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

const progressJson = (completed: string[]) => JSON.stringify({ completed, quests: {} })

describe('hobby ids and keys', () => {
  it('normalizes the hobby name', () => {
    expect(hobbyId(withHobby('  Film   Photography '))).toBe('film photography')
    expect(hobbyProgressKey('film photography')).toBe('pursio-progress:v1:hobby:film photography')
    expect(hobbyPath('film photography')).toBe('/path?hobby=film%20photography')
  })

  it('never collides with the Sample_Tree or legacy Progress keys', () => {
    expect(hobbyProgressKey('bouldering')).not.toBe('pursio-progress:v1:bouldering')
    expect(hobbyProgressKey('generated')).not.toBe(GENERATED_PROGRESS_KEY)
  })
})

describe('addHobby', () => {
  it('appends new hobbies in order and makes the latest active', () => {
    const storage = memoryStorage()
    expect(addHobby(() => storage, { tree: bouldering, model: 'm1' }, 1)).toBe('bouldering')
    expect(addHobby(() => storage, { tree: guitar, model: 'm2' }, 2)).toBe('guitar')
    const library = loadHobbyLibrary(() => storage)
    expect(library.hobbies.map((h) => [h.id, h.model, h.addedAt])).toEqual([
      ['bouldering', 'm1', 1],
      ['guitar', 'm2', 2],
    ])
    expect(library.activeId).toBe('guitar')
  })

  it('replaces an entry with the same id in place and resets only its Progress', () => {
    const storage = memoryStorage()
    addHobby(() => storage, { tree: bouldering, model: 'm1' }, 1)
    addHobby(() => storage, { tree: guitar, model: 'm2' }, 2)
    storage.setItem(hobbyProgressKey('bouldering'), progressJson([firstId]))
    storage.setItem(hobbyProgressKey('guitar'), progressJson([firstId]))

    addHobby(() => storage, { tree: withHobby('BOULDERING'), model: 'm3' }, 3)

    const library = loadHobbyLibrary(() => storage)
    expect(library.hobbies.map((h) => [h.id, h.tree.hobby, h.model, h.addedAt])).toEqual([
      ['bouldering', 'BOULDERING', 'm3', 1],
      ['guitar', 'Guitar', 'm2', 2],
    ])
    expect(library.activeId).toBe('bouldering')
    expect(storage.data.has(hobbyProgressKey('bouldering'))).toBe(false)
    expect(storage.data.get(hobbyProgressKey('guitar'))).toBe(progressJson([firstId]))
  })

  it('stays silent without storage', () => {
    expect(addHobby(() => null, { tree: guitar, model: 'm' })).toBe('guitar')
  })
})

describe('parseHobbyLibrary', () => {
  it.each(['nope', '[]', '{"hobbies":{}}'])('marks %s invalid', (raw) => {
    expect(parseHobbyLibrary(raw)).toEqual({ library: { hobbies: [], activeId: null }, invalid: true })
  })

  it('drops bad entries and repeated ids but keeps the rest', () => {
    const good = { id: 'x', tree: bouldering, model: 'm', addedAt: 1 }
    const raw = JSON.stringify({
      hobbies: [
        good,
        { ...good, tree: guitar, model: '' },
        { ...good, tree: { hobby: 'broken' } },
        { ...good, tree: guitar, addedAt: 'yesterday' },
        { ...good, model: 'duplicate' },
        { tree: guitar, model: 'm2', addedAt: 2 },
      ],
      activeId: 'missing',
    })
    const { library, invalid } = parseHobbyLibrary(raw)
    expect(invalid).toBe(false)
    expect(library.hobbies.map((h) => [h.id, h.model])).toEqual([
      ['bouldering', 'm'],
      ['guitar', 'm2'],
    ])
    expect(library.activeId).toBeNull()
  })

  it('round-trips a library', () => {
    const library = { hobbies: [{ id: 'guitar', tree: guitar, model: 'm', addedAt: 5 }], activeId: 'guitar' }
    expect(parseHobbyLibrary(serializeHobbyLibrary(library))).toEqual({ library, invalid: false })
  })

  it('removes an unreadable stored library on load', () => {
    const storage = memoryStorage({ [HOBBY_LIBRARY_KEY]: '{bad' })
    expect(loadHobbyLibrary(() => storage).hobbies).toEqual([])
    expect(storage.data.has(HOBBY_LIBRARY_KEY)).toBe(false)
  })
})

describe('legacy migration', () => {
  it('imports the old Generated_Tree with its Progress and removes the old keys', () => {
    const storage = memoryStorage({
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: guitar, model: 'old-model' }),
      [GENERATED_PROGRESS_KEY]: progressJson([firstId]),
    })
    const library = loadHobbyLibrary(() => storage, 42)
    expect(library).toEqual({ hobbies: [{ id: 'guitar', tree: guitar, model: 'old-model', addedAt: 42 }], activeId: 'guitar' })
    expect(storage.data.get(hobbyProgressKey('guitar'))).toBe(progressJson([firstId]))
    expect(storage.data.has(GENERATED_TREE_KEY)).toBe(false)
    expect(storage.data.has(GENERATED_PROGRESS_KEY)).toBe(false)
    expect(loadHobbyLibrary(() => storage)).toEqual(library)
  })

  it('does not run once a library exists', () => {
    const storage = memoryStorage({
      [HOBBY_LIBRARY_KEY]: serializeHobbyLibrary({ hobbies: [], activeId: null }),
      [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: guitar, model: 'old-model' }),
    })
    expect(loadHobbyLibrary(() => storage).hobbies).toEqual([])
    expect(storage.data.has(GENERATED_TREE_KEY)).toBe(true)
  })

  it('keeps the old keys when the new library cannot be written', () => {
    const storage = memoryStorage({ [GENERATED_TREE_KEY]: serializeGeneratedTree({ tree: guitar, model: 'm' }) })
    const failing: StorageLike = {
      ...storage,
      setItem: (k, v) => {
        if (k === HOBBY_LIBRARY_KEY) throw new Error('quota')
        storage.setItem(k, v)
      },
    }
    expect(loadHobbyLibrary(() => failing).hobbies).toHaveLength(1)
    expect(storage.data.has(GENERATED_TREE_KEY)).toBe(true)
  })
})

describe('pickHobby and setActiveHobby', () => {
  const storage = memoryStorage()
  addHobby(() => storage, { tree: bouldering, model: 'm' }, 1)
  addHobby(() => storage, { tree: guitar, model: 'm' }, 2)

  it('prefers the requested id, then the active one, then the last added', () => {
    const library = loadHobbyLibrary(() => storage)
    expect(pickHobby(library, 'bouldering')?.id).toBe('bouldering')
    expect(pickHobby(library, 'unknown')?.id).toBe('guitar')
    expect(pickHobby(library, ['bouldering'])?.id).toBe('guitar')
    expect(pickHobby({ ...library, activeId: null }, undefined)?.id).toBe('guitar')
    expect(pickHobby({ hobbies: [], activeId: null }, 'guitar')).toBeNull()
  })

  it('remembers the active hobby and ignores unknown ids', () => {
    setActiveHobby(() => storage, 'bouldering')
    expect(loadHobbyLibrary(() => storage).activeId).toBe('bouldering')
    setActiveHobby(() => storage, 'unknown')
    expect(loadHobbyLibrary(() => storage).activeId).toBe('bouldering')
  })
})

describe('lastActivePath', () => {
  it('opens the active hobby, else the last added one, else nothing', () => {
    const storage = memoryStorage()
    expect(lastActivePath(loadHobbyLibrary(() => storage))).toBeNull()
    addHobby(() => storage, { tree: bouldering, model: 'm' }, 1)
    addHobby(() => storage, { tree: guitar, model: 'm' }, 2)
    setActiveHobby(() => storage, 'bouldering')
    const library = loadHobbyLibrary(() => storage)
    expect(lastActivePath(library)).toBe('/path?hobby=bouldering')
    expect(lastActivePath({ ...library, activeId: null })).toBe('/path?hobby=guitar')
  })
})

describe('hobbyEntries', () => {
  it('reports each hobby with its own stored percent and link', () => {
    const storage = memoryStorage()
    addHobby(() => storage, { tree: bouldering, model: 'm' }, 1)
    addHobby(() => storage, { tree: guitar, model: 'm' }, 2)
    storage.setItem(hobbyProgressKey('guitar'), progressJson([firstId]))
    const total = bouldering.sections.reduce((n, s) => n + s.nodes.length, 0)
    expect(hobbyEntries(() => storage, loadHobbyLibrary(() => storage))).toEqual([
      { id: 'bouldering', hobby: 'Bouldering', percent: 0, to: '/path?hobby=bouldering' },
      { id: 'guitar', hobby: 'Guitar', percent: Math.round(100 / total), to: '/path?hobby=guitar' },
    ])
  })
})
