import { describe, expect, it } from 'vitest'
import {
  checkKey,
  checkKeyId,
  checkKeysForPath,
  compareCodePoints,
  freshLeaseKey,
} from '../../shared/utils/fresh-keys'

describe('checkKey', () => {
  it('normalizes the hobby and reduces the language', () => {
    expect(checkKey('  Film  Photography! ', 'de-DE')).toEqual({ hobby: 'film photography', language: 'de' })
  })

  it.each([null, undefined, '', '   '])('gives en for a missing language (%j)', (language) => {
    expect(checkKey('Bouldering', language).language).toBe('en')
  })

  it('gives und only for non-empty text without a valid subtag', () => {
    expect(checkKey('Bouldering', '123').language).toBe('und')
  })
})

describe('checkKeyId and freshLeaseKey', () => {
  it('builds JSON text of hobby and language', () => {
    const key = { hobby: 'chess', language: 'en' }
    expect(checkKeyId(key)).toBe('["chess","en"]')
    expect(freshLeaseKey(key)).toBe('fresh:["chess","en"]')
  })

  it('is injective where plain joining would not be', () => {
    expect(checkKeyId({ hobby: 'a","b', language: 'en' })).not.toBe(checkKeyId({ hobby: 'a', language: 'b","en' }))
  })
})

describe('checkKeysForPath', () => {
  it('gives the user-language key, then en', () => {
    expect(checkKeysForPath('Guitar', 'tr')).toEqual([
      { hobby: 'guitar', language: 'tr' },
      { hobby: 'guitar', language: 'en' },
    ])
  })

  it.each([null, undefined, '', ' ', 'en', 'EN-us'])('gives only the en key for %j', (language) => {
    expect(checkKeysForPath('Guitar', language)).toEqual([{ hobby: 'guitar', language: 'en' }])
  })
})

describe('compareCodePoints', () => {
  it('returns 0 for equal strings and orders prefixes first', () => {
    expect(compareCodePoints('abc', 'abc')).toBe(0)
    expect(compareCodePoints('ab', 'abc')).toBeLessThan(0)
    expect(compareCodePoints('abc', 'ab')).toBeGreaterThan(0)
    expect(compareCodePoints('', '')).toBe(0)
  })

  it('orders by code point, not locale', () => {
    expect(compareCodePoints('Z', 'a')).toBeLessThan(0)
    expect(compareCodePoints('é', 'z')).toBeGreaterThan(0)
  })

  it('puts an astral character after a BMP character above the surrogate range', () => {
    // UTF-16 code units would put U+1F600 (0xD83D...) before U+FF5E.
    expect(compareCodePoints('\u{1F600}', '\uFF5E')).toBeGreaterThan(0)
    expect(compareCodePoints('\uFF5E', '\u{1F600}')).toBeLessThan(0)
  })

  it('matches UTF-8 byte order', () => {
    const bytes = (s: string): number[] => Array.from(new TextEncoder().encode(s))
    const byByte = (a: string, b: string): number => {
      const x = bytes(a)
      const y = bytes(b)
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        const d = (x[i] ?? 0) - (y[i] ?? 0)
        if (d !== 0) return d
      }
      return x.length - y.length
    }
    const samples = ['', 'a', 'ab', 'Z', 'é', '\uFF5E', '\u{1F600}', '\u{10FFFF}', '中文', 'a\u{1F600}']
    for (const a of samples) {
      for (const b of samples) {
        expect(Math.sign(compareCodePoints(a, b))).toBe(Math.sign(byByte(a, b)))
      }
    }
  })
})
