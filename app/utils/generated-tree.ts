import type { SkillTree } from '#shared/types/skill-tree'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import type { StorageLike } from './progress-store'

export const GENERATED_TREE_KEY = 'pursio-generated-tree:v1'
/** Fixed Progress key for the Generated_Tree, separate from the hobby keys (Req 10.2). */
export const GENERATED_PROGRESS_KEY = 'pursio-progress:v1:generated'

export interface GeneratedTree {
  tree: SkillTree
  model: string
}

export function serializeGeneratedTree(g: GeneratedTree): string {
  const stored: GeneratedTree = { tree: g.tree, model: g.model }
  return JSON.stringify(stored)
}

/**
 * `null` gives no tree. Invalid JSON, a missing or empty `model`, or a `tree` the
 * Tree_Loader rejects gives `{ value: null, invalid: true }` (Req 10.6, 10.8).
 */
export function parseStoredGeneratedTree(raw: string | null): { value: GeneratedTree | null; invalid: boolean } {
  if (raw === null) return { value: null, invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { value: null, invalid: true }
  }
  if (typeof json !== 'object' || json === null) return { value: null, invalid: true }
  const record = json as Record<string, unknown>
  const model = record.model
  if (typeof model !== 'string' || model.length === 0) return { value: null, invalid: true }
  const loaded = loadSkillTree(record.tree)
  if (!loaded.ok) return { value: null, invalid: true }
  return { value: { tree: loaded.value, model }, invalid: false }
}

function safeStorage(getStorage: () => StorageLike | null): StorageLike | null {
  try {
    return getStorage()
  } catch {
    return null
  }
}

/** Storage failures give `null`; an unusable stored value is removed (Req 10.6). */
export function loadGeneratedTree(getStorage: () => StorageLike | null): GeneratedTree | null {
  const s = safeStorage(getStorage)
  if (!s) return null
  let raw: string | null
  try {
    raw = s.getItem(GENERATED_TREE_KEY)
  } catch {
    return null
  }
  const { value, invalid } = parseStoredGeneratedTree(raw)
  if (invalid) {
    try {
      s.removeItem(GENERATED_TREE_KEY)
    } catch {
      // Ignore: the bad value is skipped either way.
    }
  }
  return value
}

/**
 * Replaces the Generated_Tree and clears only its own Progress; Sample_Tree and
 * other hobby Progress keys stay untouched (Req 10.1, 10.2). Storage failures are silent.
 */
export function saveGeneratedTree(getStorage: () => StorageLike | null, g: GeneratedTree): void {
  const s = safeStorage(getStorage)
  if (!s) return
  try {
    s.setItem(GENERATED_TREE_KEY, serializeGeneratedTree(g))
  } catch {
    // Quota or privacy errors: nothing is persisted.
  }
  try {
    s.removeItem(GENERATED_PROGRESS_KEY)
  } catch {
    // Ignore: a stale Progress is pruned against the new tree on load.
  }
}
