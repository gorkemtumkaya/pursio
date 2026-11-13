// Per-device preferences that are not stored in the account (spec: accounts-cloud-save, Req 5.3, 10.3).
import { browserStorage, type StorageLike } from './progress-store'

/** Holds the Hobby_Id last opened on this device. */
export const ACTIVE_HOBBY_KEY = 'pursio-active-hobby:v1'
export const SAVE_PROMPT_DISMISSED_KEY = 'pursio-save-prompt-dismissed:v1'

type GetStorage = () => StorageLike | null

function read(getStorage: GetStorage, key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(getStorage: GetStorage, key: string, value: string | null): void {
  try {
    const storage = getStorage()
    if (!storage) return
    if (value === null) storage.removeItem(key)
    else storage.setItem(key, value)
  } catch {
    // A failed write is ignored: the preference lasts for this page only.
  }
}

/** The Active_Hobby's Hobby_Id, or `null` when unset or unreadable. */
export function getActiveHobbyId(getStorage: GetStorage = browserStorage): string | null {
  const value = read(getStorage, ACTIVE_HOBBY_KEY)
  return value === null || value === '' ? null : value
}

export function setActiveHobbyId(id: string, getStorage: GetStorage = browserStorage): void {
  write(getStorage, ACTIVE_HOBBY_KEY, id)
}

export function clearActiveHobbyId(getStorage: GetStorage = browserStorage): void {
  write(getStorage, ACTIVE_HOBBY_KEY, null)
}

/** Kept in memory too, so a dismissed prompt stays closed when storage cannot be written (Req 10.8). */
let dismissedThisPage = false

export function isSavePromptDismissed(getStorage: GetStorage = browserStorage): boolean {
  return dismissedThisPage || read(getStorage, SAVE_PROMPT_DISMISSED_KEY) === '1'
}

export function dismissSavePrompt(getStorage: GetStorage = browserStorage): void {
  dismissedThisPage = true
  write(getStorage, SAVE_PROMPT_DISMISSED_KEY, '1')
}

/** Forgets the dismissal, in memory and in storage (after the account is deleted). */
export function clearSavePromptDismissed(getStorage: GetStorage = browserStorage): void {
  dismissedThisPage = false
  write(getStorage, SAVE_PROMPT_DISMISSED_KEY, null)
}
