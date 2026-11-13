import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_HOBBY_KEY,
  clearActiveHobbyId,
  clearSavePromptDismissed,
  dismissSavePrompt,
  getActiveHobbyId,
  isSavePromptDismissed,
  SAVE_PROMPT_DISMISSED_KEY,
  setActiveHobbyId,
} from '../../app/utils/active-hobby'
import type { StorageLike } from '../../app/utils/progress-store'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  }
}

/** Every call throws, like localStorage in some privacy modes. */
const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

/** Reads work, writes throw, like a full or read-only storage. */
function readOnlyStorage(initial: Record<string, string>): StorageLike {
  const data = new Map(Object.entries(initial))
  return {
    getItem: k => data.get(k) ?? null,
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {
      throw new Error('quota')
    },
  }
}

const noStorage = (): null => null
const brokenAccess = (): StorageLike => {
  throw new Error('no storage here')
}

beforeEach(() => {
  // The dismissed flag is also held in module memory.
  clearSavePromptDismissed(noStorage)
})

describe('Active_Hobby preference', () => {
  it('uses fixed keys', () => {
    expect(ACTIVE_HOBBY_KEY).toBe('pursio-active-hobby:v1')
    expect(SAVE_PROMPT_DISMISSED_KEY).toBe('pursio-save-prompt-dismissed:v1')
  })

  it('is unset at first', () => {
    const storage = memoryStorage()
    expect(getActiveHobbyId(() => storage)).toBeNull()
  })

  it('set then get returns the Hobby_Id, and the last set wins', () => {
    const storage = memoryStorage()
    setActiveHobbyId('film photography', () => storage)
    expect(storage.data.get(ACTIVE_HOBBY_KEY)).toBe('film photography')
    expect(getActiveHobbyId(() => storage)).toBe('film photography')

    setActiveHobbyId('guitar', () => storage)
    expect(getActiveHobbyId(() => storage)).toBe('guitar')
  })

  it('clear removes it and leaves other keys alone', () => {
    const storage = memoryStorage({ [ACTIVE_HOBBY_KEY]: 'guitar', [SAVE_PROMPT_DISMISSED_KEY]: '1', other: 'kept' })
    clearActiveHobbyId(() => storage)
    expect(getActiveHobbyId(() => storage)).toBeNull()
    expect(Object.fromEntries(storage.data)).toEqual({ [SAVE_PROMPT_DISMISSED_KEY]: '1', other: 'kept' })
    // Clearing again is harmless.
    clearActiveHobbyId(() => storage)
    expect(getActiveHobbyId(() => storage)).toBeNull()
  })

  it('reads an empty stored value as unset', () => {
    const storage = memoryStorage({ [ACTIVE_HOBBY_KEY]: '' })
    expect(getActiveHobbyId(() => storage)).toBeNull()
  })

  it.each([
    ['a storage whose calls throw', () => throwingStorage],
    ['no storage', noStorage],
    ['a storage that cannot be reached', brokenAccess],
  ])('with %s: reads as unset and ignores writes', (_, getStorage) => {
    expect(getActiveHobbyId(getStorage)).toBeNull()
    expect(() => setActiveHobbyId('guitar', getStorage)).not.toThrow()
    expect(getActiveHobbyId(getStorage)).toBeNull()
    expect(() => clearActiveHobbyId(getStorage)).not.toThrow()
  })

  it('a failed write keeps the stored value readable', () => {
    const getStorage = () => readOnlyStorage({ [ACTIVE_HOBBY_KEY]: 'guitar' })
    expect(() => setActiveHobbyId('chess', getStorage)).not.toThrow()
    expect(() => clearActiveHobbyId(getStorage)).not.toThrow()
    expect(getActiveHobbyId(getStorage)).toBe('guitar')
  })
})

describe('Save_Prompt dismissed flag', () => {
  it('is not set at first, and only the value "1" counts', () => {
    expect(isSavePromptDismissed(() => memoryStorage())).toBe(false)
    expect(isSavePromptDismissed(() => memoryStorage({ [SAVE_PROMPT_DISMISSED_KEY]: '1' }))).toBe(true)
    expect(isSavePromptDismissed(() => memoryStorage({ [SAVE_PROMPT_DISMISSED_KEY]: 'true' }))).toBe(false)
    expect(isSavePromptDismissed(() => memoryStorage({ [ACTIVE_HOBBY_KEY]: '1' }))).toBe(false)
  })

  it('dismiss stores the flag and clear forgets it', () => {
    const storage = memoryStorage({ [ACTIVE_HOBBY_KEY]: 'guitar' })
    dismissSavePrompt(() => storage)
    expect(storage.data.get(SAVE_PROMPT_DISMISSED_KEY)).toBe('1')
    expect(isSavePromptDismissed(() => storage)).toBe(true)

    clearSavePromptDismissed(() => storage)
    expect(storage.data.has(SAVE_PROMPT_DISMISSED_KEY)).toBe(false)
    expect(isSavePromptDismissed(() => storage)).toBe(false)
    expect(storage.data.get(ACTIVE_HOBBY_KEY)).toBe('guitar')
  })

  it('a stored flag survives a new page: it is read from storage, not only from memory', () => {
    const storage = memoryStorage()
    dismissSavePrompt(() => storage)
    // Forget the in-memory copy only.
    clearSavePromptDismissed(noStorage)
    expect(isSavePromptDismissed(() => storage)).toBe(true)
  })

  it.each([
    ['a storage whose calls throw', () => throwingStorage],
    ['no storage', noStorage],
    ['a storage that cannot be reached', brokenAccess],
  ])('with %s: reads as not set, and a dismissal still holds for this page (Req 10.8)', (_, getStorage) => {
    expect(isSavePromptDismissed(getStorage)).toBe(false)
    expect(() => dismissSavePrompt(getStorage)).not.toThrow()
    expect(isSavePromptDismissed(getStorage)).toBe(true)

    expect(() => clearSavePromptDismissed(getStorage)).not.toThrow()
    expect(isSavePromptDismissed(getStorage)).toBe(false)
  })
})
