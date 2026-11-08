import { z } from 'zod'
import { COMPLETION_LOG_LIMIT } from '#shared/utils/streak'
import type { StorageLike } from './progress-store'

export const ACTIVITY_STORAGE_KEY = 'pursio-activity:v1'

const storedLogSchema = z.object({ completions: z.array(z.number().finite()) })

export interface ActivityStore {
  load(): number[]
  save(completions: readonly number[]): void
}

/** `null` gives an empty log; bad JSON or a shape mismatch gives an empty log with `invalid: true` (Req 1.3). */
export function parseCompletionLog(raw: string | null): { completions: number[]; invalid: boolean } {
  if (raw === null) return { completions: [], invalid: false }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { completions: [], invalid: true }
  }
  const parsed = storedLogSchema.safeParse(json)
  if (!parsed.success) return { completions: [], invalid: true }
  return { completions: parsed.data.completions.slice(-COMPLETION_LOG_LIMIT), invalid: false }
}

/** Storage failures are silent, like the Progress_Store; an unreadable value is removed (Req 1.3). */
export function createActivityStore(getStorage: () => StorageLike | null): ActivityStore {
  function storage(): StorageLike | null {
    try {
      return getStorage()
    } catch {
      return null
    }
  }

  return {
    load(): number[] {
      const s = storage()
      if (!s) return []
      let raw: string | null
      try {
        raw = s.getItem(ACTIVITY_STORAGE_KEY)
      } catch {
        return []
      }
      const { completions, invalid } = parseCompletionLog(raw)
      if (invalid) {
        try {
          s.removeItem(ACTIVITY_STORAGE_KEY)
        } catch {
          // Ignore: the bad value is skipped either way.
        }
      }
      return completions
    },
    save(completions: readonly number[]): void {
      const s = storage()
      if (!s) return
      try {
        s.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify({ completions }))
      } catch {
        // Quota or privacy errors: the log stays in memory only.
      }
    },
  }
}
