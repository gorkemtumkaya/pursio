import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { parseChannelFeed } from '../../server/utils/fresh/feed-parser'
import { printChannelFeed } from '../support/feed-printer'

const RUNS = { numRuns: 300 }

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const arbIdChar = fc.constantFrom(...ID_CHARS.split(''))
const arbVideoId = fc.string({ unit: arbIdChar, minLength: 11, maxLength: 11 })
const arbChannelId = fc.string({ unit: arbIdChar, minLength: 1, maxLength: 64 })

/** True for code points XML 1.0 allows (surrogates are only produced as whole pairs). */
function isXmlCodePoint(code: number): boolean {
  return code === 0x9 || code === 0xa || code === 0xd
    || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd)
    || (code >= 0x10000 && code <= 0x10ffff)
}

const arbAnyLegalChar = fc
  .integer({ min: 0, max: 0x10ffff })
  .filter(isXmlCodePoint)
  .map(code => String.fromCodePoint(code))

/** One title piece: XML specials, whitespace and line breaks, non-ASCII, or any legal character. */
const arbTitleUnit = fc.oneof(
  fc.constantFrom('&', '<', '>', '"', "'", '&amp;', ']]>', ' ', '\t', '\n', '\r', '\r\n'),
  fc.constantFrom('é', 'ß', 'ç', 'ğ', 'İ', '日本', '🧗', '🎸', '\u00A0', '\u2028'),
  fc.string({ unit: 'grapheme-ascii', minLength: 1, maxLength: 5 }),
  arbAnyLegalChar,
)

/** Titles of 0 to 100 characters (UTF-16 units), including leading and trailing whitespace. */
const arbTitle = fc.array(arbTitleUnit, { maxLength: 60 }).map((units) => {
  let title = ''
  for (const u of units) {
    if (title.length + u.length > 100) break
    title += u
  }
  return title
})

// Whole seconds in years 0000 to 9999, UTC.
const YEAR_0_START_MS = new Date('0000-01-01T00:00:00Z').getTime()
const YEAR_9999_END_MS = new Date('9999-12-31T23:59:59Z').getTime()
const arbPublishedMs = fc
  .integer({ min: YEAR_0_START_MS / 1000, max: YEAR_9999_END_MS / 1000 })
  .map(s => s * 1000)

const arbEntry: fc.Arbitrary<FeedEntry> = fc
  .record({ videoId: arbVideoId, title: arbTitle, channelId: arbChannelId, publishedMs: arbPublishedMs })
  .map(e => ({ ...e }))

describe('Feature: fresh, Property 14: Feed print and parse round trip', () => {
  // **Validates: Requirements 4.8, 4.11, 4.12**
  it('parsing the printed feed returns the same entries in the same order', () => {
    fc.assert(
      fc.property(fc.array(arbEntry, { maxLength: 15 }), (entries) => {
        const parsed = parseChannelFeed(printChannelFeed(entries))
        expect(parsed).toStrictEqual(entries)
      }),
      RUNS,
    )
  })

  it('keeps the edge years, an empty title and only-whitespace titles', () => {
    const entries: FeedEntry[] = [
      { videoId: 'AAAAAAAAAAA', title: '', channelId: 'c', publishedMs: YEAR_0_START_MS },
      { videoId: '-_-_-_-_-_-', title: ' \r\n\r \t ', channelId: 'UC_x-1', publishedMs: YEAR_9999_END_MS },
      { videoId: 'abcDEF12345', title: ' <a href="x">Tom & Jerry\'s</a> ', channelId: 'Z', publishedMs: 0 },
    ]
    expect(parseChannelFeed(printChannelFeed(entries))).toStrictEqual(entries)
  })
})
