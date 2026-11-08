import { z } from 'zod'
import type { Progress } from '../../shared/types/progress'
import type { QuestTriple, SkillTree } from '../../shared/types/skill-tree'

export const PROGRESS_SCHEMA_VERSION = 1

/** Shape of the JSON saved in localStorage. */
export const storedProgressSchema = z.object({
  completed: z.array(z.string()),
  quests: z.record(z.string(), z.tuple([z.boolean(), z.boolean(), z.boolean()])),
})

export type StoredProgress = z.infer<typeof storedProgressSchema>

export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export interface ProgressStore {
  load(): Progress
  save(progress: Progress): void
}

function emptyProgress(): Progress {
  return { completed: [], quests: {} }
}

/** Key holding the schema version and the hobby (Req 10.1). */
export function progressStorageKey(hobby: string): string {
  return `pursio-progress:v${PROGRESS_SCHEMA_VERSION}:${hobby}`
}

export function serializeProgress(progress: Progress): string {
  const stored: StoredProgress = { completed: progress.completed, quests: progress.quests }
  return JSON.stringify(stored)
}

/**
 * `null` gives an empty Progress (Req 10.3). Invalid JSON or a schema mismatch gives
 * an empty Progress with `invalid: true` (Req 10.4). Duplicate completed ids collapse.
 */
export function parseStoredProgress(raw: string | null): { progress: Progress; invalid: boolean } {
  if (raw === null) return { progress: emptyProgress(), invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { progress: emptyProgress(), invalid: true }
  }
  const parsed = storedProgressSchema.safeParse(json)
  if (!parsed.success) return { progress: emptyProgress(), invalid: true }

  // Rebuild quests from the validated raw entries with Object.fromEntries, so keys
  // such as "__proto__" stay own properties instead of touching the prototype.
  const rawQuests = (json as { quests: Record<string, QuestTriple<boolean>> }).quests
  const quests = Object.fromEntries(
    Object.entries(rawQuests).map(([id, [a, b, c]]): [string, QuestTriple<boolean>] => [id, [a, b, c]]),
  )
  return {
    progress: { completed: [...new Set(parsed.data.completed)], quests },
    invalid: false,
  }
}

/** Drops completed ids and quest entries for ids not in the tree (Req 10.5). */
export function pruneProgress(progress: Progress, tree: SkillTree): Progress {
  const ids = new Set(tree.sections.flatMap((s) => s.nodes.map((n) => n.id)))
  return {
    completed: progress.completed.filter((id) => ids.has(id)),
    quests: Object.fromEntries(Object.entries(progress.quests).filter(([id]) => ids.has(id))),
  }
}

/**
 * Storage failures never surface: a `null` storage or a throw gives an empty
 * Progress on load and a silent no-op on save (Req 10.6). `key` defaults to the
 * hobby key; a Generated_Tree passes its own fixed key.
 */
export function createProgressStore(
  getStorage: () => StorageLike | null,
  tree: SkillTree,
  key: string = progressStorageKey(tree.hobby),
): ProgressStore {
  function storage(): StorageLike | null {
    try {
      return getStorage()
    } catch {
      return null
    }
  }

  return {
    load(): Progress {
      const s = storage()
      if (!s) return emptyProgress()
      let raw: string | null
      try {
        raw = s.getItem(key)
      } catch {
        return emptyProgress()
      }
      const { progress, invalid } = parseStoredProgress(raw)
      if (invalid) {
        try {
          s.removeItem(key)
        } catch {
          // Ignore: the bad value is skipped either way.
        }
      }
      return pruneProgress(progress, tree)
    },
    save(progress: Progress): void {
      const s = storage()
      if (!s) return
      try {
        s.setItem(key, serializeProgress(progress))
      } catch {
        // Quota or privacy errors: keep progress in memory only.
      }
    },
  }
}

/** `window.localStorage`, or null when reading it throws (privacy modes, sandboxed frames). */
export function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
