import type { Provider, StartLevel } from '../../shared/types/llm'
import type { SkillTree } from '../../shared/types/skill-tree'
import { normalizeHobby } from '../../shared/utils/llm'

/**
 * Cache key for a generated tree. JSON array encoding keeps the key injective
 * over (Normalized_Hobby, level, provider, model), even when the model id contains
 * separators such as commas or quotes (Req 6.5).
 */
export function cacheKey(hobby: string, level: StartLevel, provider: Provider, model: string): string {
  return JSON.stringify([normalizeHobby(hobby), level, provider, model])
}

/** A cache entry. It has no key field, so an API key can never be stored (Req 2.6). */
export interface CachedTree {
  tree: SkillTree
  model: string
}

export interface TreeCache {
  /** Returns the entry and marks it as most recently used. */
  get(key: string): CachedTree | undefined
  /** Stores the entry as most recent and evicts the least recent past the limit. */
  set(key: string, value: CachedTree): void
  readonly size: number
}

/** In-memory LRU backed by a `Map`'s insertion order (Req 6.3, 6.4). */
export function createTreeCache(limit = 200): TreeCache {
  const entries = new Map<string, CachedTree>()

  return {
    get(key) {
      const value = entries.get(key)
      if (value === undefined) return undefined
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key, value) {
      entries.delete(key)
      entries.set(key, { tree: value.tree, model: value.model })
      while (entries.size > limit) {
        const oldest = entries.keys().next()
        if (oldest.done) break
        entries.delete(oldest.value)
      }
    },
    get size() {
      return entries.size
    },
  }
}
