import type { SkillTree } from '#shared/types/skill-tree'
import { normalizeHobby } from '#shared/utils/llm'
import { completionPercent } from '#shared/utils/progress-engine'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY, loadGeneratedTree } from './generated-tree'
import { createProgressStore, PROGRESS_SCHEMA_VERSION, type StorageLike } from './progress-store'

export const HOBBY_LIBRARY_KEY = 'pursio-hobbies:v1'

export interface HobbyRecord {
  id: string
  tree: SkillTree
  model: string
  /** Epoch ms when the hobby was first added. */
  addedAt: number
}

export interface HobbyLibrary {
  /** In the order added (Req 4.1). */
  hobbies: HobbyRecord[]
  activeId: string | null
}

/** One row of the sidebar and Hobby_Switcher list. `to: null` renders a no-op demo entry. */
export interface HobbyEntry {
  id: string
  hobby: string
  percent: number
  to: string | null
}

const emptyLibrary = (): HobbyLibrary => ({ hobbies: [], activeId: null })

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Hobby_Id: the tree's hobby, normalized like the Tree_Cache key. */
export function hobbyId(tree: SkillTree): string {
  return normalizeHobby(tree.hobby)
}

/** Progress key of one Hobby_Library entry (Req 3.3). */
export function hobbyProgressKey(id: string): string {
  return `pursio-progress:v${PROGRESS_SCHEMA_VERSION}:hobby:${id}`
}

/** `/path` URL that opens one entry (Req 4.4). */
export function hobbyPath(id: string): string {
  return `/path?hobby=${encodeURIComponent(id)}`
}

function parseEntry(value: unknown): HobbyRecord | null {
  if (!isRecord(value)) return null
  const { model, addedAt } = value
  if (typeof model !== 'string' || model.length === 0) return null
  if (typeof addedAt !== 'number' || !Number.isFinite(addedAt)) return null
  const loaded = loadSkillTree(value.tree)
  if (!loaded.ok) return null
  // The id is recomputed from the tree, so it always matches its Progress key.
  return { id: hobbyId(loaded.value), tree: loaded.value, model, addedAt }
}

/**
 * `null` gives an empty library. Bad JSON or a wrong top-level shape gives `invalid: true`.
 * Entries the Tree_Loader rejects or without a model are dropped, as are repeated ids (Req 3.5).
 */
export function parseHobbyLibrary(raw: string | null): { library: HobbyLibrary; invalid: boolean } {
  if (raw === null) return { library: emptyLibrary(), invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { library: emptyLibrary(), invalid: true }
  }
  if (!isRecord(json) || !Array.isArray(json.hobbies)) return { library: emptyLibrary(), invalid: true }

  const hobbies: HobbyRecord[] = []
  const seen = new Set<string>()
  for (const value of json.hobbies) {
    const entry = parseEntry(value)
    if (entry && !seen.has(entry.id)) {
      seen.add(entry.id)
      hobbies.push(entry)
    }
  }
  const activeId = typeof json.activeId === 'string' && seen.has(json.activeId) ? json.activeId : null
  return { library: { hobbies, activeId }, invalid: false }
}

export function serializeHobbyLibrary(library: HobbyLibrary): string {
  return JSON.stringify({
    hobbies: library.hobbies.map(({ id, tree, model, addedAt }) => ({ id, tree, model, addedAt })),
    activeId: library.activeId,
  })
}

function safeStorage(getStorage: () => StorageLike | null): StorageLike | null {
  try {
    return getStorage()
  } catch {
    return null
  }
}

/** Returns false when the write failed, so callers can keep data they would otherwise remove. */
function write(s: StorageLike, library: HobbyLibrary): boolean {
  try {
    s.setItem(HOBBY_LIBRARY_KEY, serializeHobbyLibrary(library))
    return true
  } catch {
    return false
  }
}

function remove(s: StorageLike, key: string): void {
  try {
    s.removeItem(key)
  } catch {
    // Ignore: a stale value is skipped or pruned on load.
  }
}

/**
 * Imports the `ai-skill-tree-generation` Generated_Tree and its Progress as the
 * first entry, then removes the old keys (Req 3.4). The old keys stay when the
 * new library could not be written.
 */
function migrateLegacy(s: StorageLike, now: number): HobbyLibrary {
  const legacy = loadGeneratedTree(() => s)
  if (!legacy) return emptyLibrary()
  const id = hobbyId(legacy.tree)
  const library: HobbyLibrary = {
    hobbies: [{ id, tree: legacy.tree, model: legacy.model, addedAt: now }],
    activeId: id,
  }
  try {
    const progress = s.getItem(GENERATED_PROGRESS_KEY)
    if (progress !== null) s.setItem(hobbyProgressKey(id), progress)
  } catch {
    return library
  }
  if (write(s, library)) {
    remove(s, GENERATED_TREE_KEY)
    remove(s, GENERATED_PROGRESS_KEY)
  }
  return library
}

/** Storage failures give an empty library; an unreadable value is removed. */
export function loadHobbyLibrary(getStorage: () => StorageLike | null, now: number = Date.now()): HobbyLibrary {
  const s = safeStorage(getStorage)
  if (!s) return emptyLibrary()
  let raw: string | null
  try {
    raw = s.getItem(HOBBY_LIBRARY_KEY)
  } catch {
    return emptyLibrary()
  }
  if (raw === null) return migrateLegacy(s, now)
  const { library, invalid } = parseHobbyLibrary(raw)
  if (invalid) remove(s, HOBBY_LIBRARY_KEY)
  return library
}

/**
 * Adds a Generated_Tree and makes it the Active_Hobby (Req 3.1). An entry with
 * the same Hobby_Id gets the new tree and model, keeps its place, and only its
 * own Progress is reset (Req 3.2, 3.3). Returns the Hobby_Id.
 */
export function addHobby(
  getStorage: () => StorageLike | null,
  generated: { tree: SkillTree; model: string },
  now: number = Date.now(),
): string {
  const id = hobbyId(generated.tree)
  const s = safeStorage(getStorage)
  if (!s) return id
  const library = loadHobbyLibrary(() => s, now)
  const existing = library.hobbies.find((h) => h.id === id)
  const hobbies = existing
    ? library.hobbies.map((h) => (h.id === id ? { ...h, tree: generated.tree, model: generated.model } : h))
    : [...library.hobbies, { id, tree: generated.tree, model: generated.model, addedAt: now }]
  write(s, { hobbies, activeId: id })
  remove(s, hobbyProgressKey(id))
  return id
}

/** Remembers the entry last opened on `/path` (Req 3.6). Unknown ids are ignored. */
export function setActiveHobby(getStorage: () => StorageLike | null, id: string): void {
  const s = safeStorage(getStorage)
  if (!s) return
  const library = loadHobbyLibrary(() => s)
  if (library.activeId === id || !library.hobbies.some((h) => h.id === id)) return
  write(s, { ...library, activeId: id })
}

/** The requested entry, else the Active_Hobby, else the last added entry, else null (Req 3.6, 3.7). */
export function pickHobby(library: HobbyLibrary, requestedId: unknown): HobbyRecord | null {
  const byId = (id: unknown) => (typeof id === 'string' ? library.hobbies.find((h) => h.id === id) : undefined)
  return byId(requestedId) ?? byId(library.activeId) ?? library.hobbies.at(-1) ?? null
}

/** Sidebar rows with each entry's stored Progress as a percent (Req 4.1). */
export function hobbyEntries(getStorage: () => StorageLike | null, library: HobbyLibrary): HobbyEntry[] {
  return library.hobbies.map(({ id, tree }) => ({
    id,
    hobby: tree.hobby,
    percent: completionPercent(tree, createProgressStore(getStorage, tree, hobbyProgressKey(id)).load()),
    to: hobbyPath(id),
  }))
}
