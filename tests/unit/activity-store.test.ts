import { describe, expect, it } from 'vitest'
import { ACTIVITY_STORAGE_KEY, createActivityStore, parseCompletionLog } from '../../app/utils/activity-store'
import type { StorageLike } from '../../app/utils/progress-store'
import { COMPLETION_LOG_LIMIT } from '../../shared/utils/streak'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

describe('parseCompletionLog', () => {
  it('treats a missing value as an empty, valid log', () => {
    expect(parseCompletionLog(null)).toEqual({ completions: [], invalid: false })
  })

  it.each(['not json', '[]', '{"completions":"x"}', '{"completions":[1,"2"]}', '{"completions":[1e999]}'])(
    'marks %s invalid',
    (raw) => {
      expect(parseCompletionLog(raw)).toEqual({ completions: [], invalid: true })
    },
  )

  it('trims an oversized log to the most recent entries', () => {
    const raw = JSON.stringify({ completions: Array.from({ length: COMPLETION_LOG_LIMIT + 5 }, (_, i) => i) })
    const { completions } = parseCompletionLog(raw)
    expect(completions).toHaveLength(COMPLETION_LOG_LIMIT)
    expect(completions[0]).toBe(5)
  })
})

describe('createActivityStore', () => {
  it('round-trips the log', () => {
    const storage = memoryStorage()
    const store = createActivityStore(() => storage)
    store.save([10, 20])
    expect(store.load()).toEqual([10, 20])
  })

  it('removes an unreadable value', () => {
    const storage = memoryStorage({ [ACTIVITY_STORAGE_KEY]: '{oops' })
    expect(createActivityStore(() => storage).load()).toEqual([])
    expect(storage.data.has(ACTIVITY_STORAGE_KEY)).toBe(false)
  })

  it('stays silent when storage is missing or throws', () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    for (const getStorage of [() => null, () => throwing, (): StorageLike => {
      throw new Error('no access')
    }]) {
      const store = createActivityStore(getStorage)
      expect(store.load()).toEqual([])
      expect(() => store.save([1])).not.toThrow()
    }
  })
})
