import type { CheckKey } from '../types/fresh'
import { languageCode, normalizeText } from './video-normalize'

/**
 * Compares two strings by Unicode code point (not UTF-16 code unit, not locale).
 * Equal to UTF-8 byte order and to Postgres `collate "C"`. Returns negative, 0 or positive.
 */
export function compareCodePoints(a: string, b: string): number {
  const ia = a[Symbol.iterator]()
  const ib = b[Symbol.iterator]()
  for (;;) {
    const na = ia.next()
    const nb = ib.next()
    if (na.done) return nb.done ? 0 : -1
    if (nb.done) return 1
    const ca = na.value.codePointAt(0) ?? 0
    const cb = nb.value.codePointAt(0) ?? 0
    if (ca !== cb) return ca - cb
  }
}

/**
 * Builds a key from raw texts: normalizeText(hobby), languageCode(language).
 * A null, undefined, empty or whitespace-only language gives 'en' (decision D15).
 */
export function checkKey(hobby: string, language: string | null | undefined): CheckKey {
  return { hobby: normalizeText(hobby), language: languageCode(language) }
}

/** JSON text ["hobby","language"], injective like poolKey. */
export function checkKeyId(key: CheckKey): string {
  return JSON.stringify([key.hobby, key.language])
}

/** Lease key in video_leases. Cannot collide with a Pool_Key (a 4-element JSON array). */
export function freshLeaseKey(key: CheckKey): string {
  return `fresh:${checkKeyId(key)}`
}

/**
 * The user-language key, plus the 'en' key when that language is not 'en'.
 * A missing language gives only the 'en' key.
 */
export function checkKeysForPath(hobby: string, language: string | null | undefined): CheckKey[] {
  const own = checkKey(hobby, language)
  return own.language === 'en' ? [own] : [own, { hobby: own.hobby, language: 'en' }]
}
