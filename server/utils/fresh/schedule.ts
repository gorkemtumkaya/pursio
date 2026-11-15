/**
 * Fresh check scheduling (Req 3): which Check_Keys are active, which are due, and in which
 * order the Check_Route runs them. Pure functions, no clock and no store access.
 */
import type { CheckKey } from '../../../shared/types/fresh'
import { checkKeyId, checkKeysForPath, compareCodePoints } from '../../../shared/utils/fresh-keys'

/** Fresh_Checks started per Check_Route call at most (Req 3.3). */
export const CHECKS_PER_CALL = 3
/** New Fresh_Checks start only within this many ms of the call start (Req 3.8). */
export const START_WINDOW_MS = 10_000
/** A Check_Key is due this many seconds after its last successful Fresh_Check (Req 3.5). */
export const CHECK_INTERVAL_S = 86400
/** A path is active when opened or saved within this many seconds (Req 3.7). */
export const ACTIVE_PATH_S = 1209600
/** Call_Deadline: ms after the call start when in-flight work is aborted (Req 3.15). */
export const CALL_DEADLINE_MS = 117_000
/** Time kept before the Call_Deadline for the store transaction. */
export const STORE_RESERVE_MS = 3_000

/** Schedule state of one Check_Key. Times are epoch ms (db clock); null means never. */
export interface DueState { key: CheckKey; lastSuccessMs: number | null; lastAttemptMs: number | null }

/**
 * Active_Check_Keys from active path rows (raw hobby, raw profile language).
 * Normalizes the hobby, reduces the language with languageCode (missing or empty gives 'en',
 * Req 3.16), adds the 'en' key, and removes duplicates keeping first-seen order.
 * A hobby that normalizes to the empty string forms no key.
 */
export function activeCheckKeys(rows: readonly { hobby: string; language: string | null }[]): CheckKey[] {
  const seen = new Set<string>()
  const keys: CheckKey[] = []
  for (const row of rows) {
    for (const key of checkKeysForPath(row.hobby, row.language)) {
      if (key.hobby === '') continue
      const id = checkKeyId(key)
      if (seen.has(id)) continue
      seen.add(id)
      keys.push(key)
    }
  }
  return keys
}

/** Due when never successful, or the last success finished 86400 s or more before the call start (Req 3.5). */
export function isDue(state: DueState, callStartMs: number): boolean {
  return state.lastSuccessMs === null || callStartMs - state.lastSuccessMs >= CHECK_INTERVAL_S * 1000
}

/**
 * Never attempted first, then Last_Attempt_Time ascending, then hobby ascending, then language
 * ascending, both in code point order (Req 3.6). Returns a new array.
 */
export function dueOrder(states: readonly DueState[]): DueState[] {
  return [...states].sort((a, b) => {
    if (a.lastAttemptMs !== b.lastAttemptMs) {
      if (a.lastAttemptMs === null) return -1
      if (b.lastAttemptMs === null) return 1
      return a.lastAttemptMs - b.lastAttemptMs
    }
    return compareCodePoints(a.key.hobby, b.key.hobby) || compareCodePoints(a.key.language, b.key.language)
  })
}
