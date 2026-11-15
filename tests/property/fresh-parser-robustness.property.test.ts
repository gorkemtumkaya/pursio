import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../shared/types/fresh'
import { parseChannelFeed } from '../../server/utils/fresh/feed-parser'
import { escapeFeedText, printChannelFeed } from '../support/feed-printer'

const RUNS = { numRuns: 300 }

const ATOM_NS = 'http://www.w3.org/2005/Atom'
const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const arbIdChar = fc.constantFrom(...ID_CHARS.split(''))
const arbVideoId = fc.string({ unit: arbIdChar, minLength: 11, maxLength: 11 })
const arbChannelId = fc.string({ unit: arbIdChar, minLength: 1, maxLength: 64 })
const arbTitle = fc.string({ maxLength: 40 })
  // Keep to characters XML 1.0 allows; the printer does not escape C0 controls.
  .map(s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF\uD800-\uDFFF]/g, ''))
const arbPublishedMs = fc.integer({ min: 0, max: 4_102_444_800 }).map(s => s * 1000)

const arbEntry: fc.Arbitrary<FeedEntry> = fc
  .record({ videoId: arbVideoId, title: arbTitle, channelId: arbChannelId, publishedMs: arbPublishedMs })
  .map(e => ({ ...e }))

// ---------- Invalid entries (Req 4.10) ----------

/** A video id that is not 11 characters from letters, digits, `-` and `_`. */
const arbBadVideoId = fc.oneof(
  fc.string({ unit: arbIdChar, maxLength: 20 }).filter(s => s.length !== 11),
  fc.tuple(arbVideoId, fc.integer({ min: 0, max: 10 }), fc.constantFrom('!', '.', '+', '/', '=', 'é', '🧗', '&amp;'))
    .map(([id, at, bad]) => id.slice(0, at) + bad + id.slice(at + 1)),
)

/** Published texts that are not RFC 3339 or do not name a real instant. */
const arbBadPublished = fc.constantFrom(
  '',
  '   ',
  'yesterday',
  '2026-11-08',
  '2026-11-08 09:30:00Z',
  '2026-11-08T09:30:00',
  '2026-11-08T09:30Z',
  '26-11-08T09:30:00Z',
  '2026-13-01T00:00:00Z',
  '2026-00-10T00:00:00Z',
  '2026-02-30T00:00:00Z',
  '2025-02-29T00:00:00Z',
  '2026-11-08T24:00:00Z',
  '2026-11-08T09:60:00Z',
  '2026-11-08T09:30:61Z',
  '2026-11-08T09:30:00+25:00',
  '2026-11-08T09:30:00+05:60',
  '2026-11-08T09:30:00+0500',
  '1762594200',
  'Sun, 08 Nov 2026 09:30:00 GMT',
)

type Field = 'videoId' | 'channelId' | 'title' | 'published'

/** An entry's element text by field; a missing key means the element is left out. */
type RawEntry = Partial<Record<Field, string>>

const arbInvalidRaw: fc.Arbitrary<RawEntry> = fc
  .record({
    base: arbEntry,
    defect: fc.oneof(
      fc.constant({ kind: 'noVideoId' as const }),
      arbBadVideoId.map(id => ({ kind: 'badVideoId' as const, id })),
      fc.constant({ kind: 'noChannelId' as const }),
      fc.constantFrom('', ' ', '\n  ').map(text => ({ kind: 'emptyChannelId' as const, text })),
      fc.constant({ kind: 'noPublished' as const }),
      arbBadPublished.map(text => ({ kind: 'badPublished' as const, text })),
    ),
  })
  .map(({ base, defect }) => {
    const raw: RawEntry = {
      videoId: base.videoId,
      channelId: escapeFeedText(base.channelId),
      title: escapeFeedText(base.title),
      published: new Date(base.publishedMs).toISOString(),
    }
    switch (defect.kind) {
      case 'noVideoId': delete raw.videoId; break
      // Ids with `&amp;` are already escaped; the others hold no XML specials.
      case 'badVideoId': raw.videoId = defect.id; break
      case 'noChannelId': delete raw.channelId; break
      case 'emptyChannelId': raw.channelId = defect.text; break
      case 'noPublished': delete raw.published; break
      case 'badPublished': raw.published = defect.text; break
    }
    return raw
  })

function printRawEntry(raw: RawEntry): string {
  const lines = ['  <entry>']
  if (raw.videoId !== undefined) lines.push(`    <yt:videoId>${raw.videoId}</yt:videoId>`)
  if (raw.channelId !== undefined) lines.push(`    <yt:channelId>${raw.channelId}</yt:channelId>`)
  if (raw.title !== undefined) lines.push(`    <title>${raw.title}</title>`)
  if (raw.published !== undefined) lines.push(`    <published>${raw.published}</published>`)
  lines.push('  </entry>')
  return lines.join('\n') + '\n'
}

const ENTRY_OPEN = '  <entry>\n'
const FEED_CLOSE = '</feed>\n'

/** The `<entry>` block the Feed_Printer writes for one entry. */
function printedEntryBlock(entry: FeedEntry): string {
  const doc = printChannelFeed([entry])
  return doc.slice(doc.indexOf(ENTRY_OPEN), doc.lastIndexOf(FEED_CLOSE))
}

/** Valid entries in order, with invalid ones inserted at random positions. */
const arbMixed = fc
  .tuple(fc.array(arbEntry, { maxLength: 8 }), fc.array(fc.tuple(fc.nat(), arbInvalidRaw), { maxLength: 8 }))
  .map(([valid, invalid]) => {
    const items: Array<{ valid: FeedEntry } | { invalid: RawEntry }> = valid.map(v => ({ valid: v }))
    for (const [pos, raw] of invalid) items.splice(pos % (items.length + 1), 0, { invalid: raw })
    return { valid, items }
  })

function printMixed(items: ReadonlyArray<{ valid: FeedEntry } | { invalid: RawEntry }>): string {
  const empty = printChannelFeed([])
  const head = empty.slice(0, empty.lastIndexOf(FEED_CLOSE))
  const body = items.map(it => ('valid' in it ? printedEntryBlock(it.valid) : printRawEntry(it.invalid))).join('')
  return head + body + FEED_CLOSE
}

// ---------- Broken documents (Req 4.9) ----------

/** Positions just after a `>` inside the root element, where character data may start. */
function contentPositions(doc: string): number[] {
  const rootOpen = doc.indexOf('<feed')
  const start = doc.indexOf('>', rootOpen) + 1
  const end = doc.lastIndexOf('</feed>')
  const out: number[] = []
  for (let k = start - 1; k < end; k++) if (doc.charAt(k) === '>') out.push(k + 1)
  return out
}

function endTags(doc: string): Array<{ at: number; name: string }> {
  return [...doc.matchAll(/<\/([^>\s]+)>/g)].map(m => ({ at: m.index, name: m[1] ?? '' }))
}

function pick<T>(list: readonly T[], n: number): T {
  const item = list[n % list.length]
  if (item === undefined) throw new Error('empty list')
  return item
}

type Break = (doc: string, n: number) => string

const NOT_XML_EDITS: Record<string, fc.Arbitrary<Break>> = {
  dropEndTag: fc.constant<Break>((doc, n) => {
    const tag = pick(endTags(doc), n)
    return doc.slice(0, tag.at) + doc.slice(tag.at + tag.name.length + 3)
  }),
  mismatchEndTag: fc.constantFrom('x', 'Z', ':y').map((suffix): Break => (doc, n) => {
    const tag = pick(endTags(doc), n)
    return `${doc.slice(0, tag.at)}</${tag.name}${suffix}>${doc.slice(tag.at + tag.name.length + 3)}`
  }),
  unclosedStartTag: fc.constantFrom('<foo>', '<entry>', '<title>', '<yt:videoId>').map((tag): Break => (doc, n) => {
    const at = pick(contentPositions(doc), n)
    return doc.slice(0, at) + tag + doc.slice(at)
  }),
  unknownEntity: fc.constantFrom('&nbsp;', '&copy;', '&foo;', '&AMP;', '&Lt;', '&#0;', '&#xD800;', '&#;', '&amp')
    .map((ref): Break => (doc, n) => {
      const at = pick(contentPositions(doc), n)
      return doc.slice(0, at) + ref + doc.slice(at)
    }),
  doctype: fc.constantFrom(
    '<!DOCTYPE feed>',
    '<!DOCTYPE feed [<!ENTITY x "boom">]>',
    '<!DOCTYPE feed SYSTEM "http://example.com/feed.dtd">',
  ).map((decl): Break => (doc) => {
    const at = doc.indexOf('?>') + 2
    return `${doc.slice(0, at)}\n${decl}${doc.slice(at)}`
  }),
  secondRoot: fc.constantFrom(`<feed xmlns="${ATOM_NS}"/>`, '<x/>', '<extra></extra>', 'trailing text')
    .map((tail): Break => doc => doc + tail),
}

type RootEdit = (doc: string) => string

const NOT_ATOM_EDITS: Record<string, fc.Arbitrary<RootEdit>> = {
  renameRoot: fc.constantFrom('rss', 'Feed', 'channel', 'atom:feed2').map((name): RootEdit => doc =>
    doc.replace('<feed ', `<${name} `).replace('</feed>', `</${name}>`)
      .replace(`<${name} `, name.includes(':') ? `<${name} xmlns:atom="${ATOM_NS}" ` : `<${name} `)),
  changeNamespace: fc.constantFrom('http://www.w3.org/2005/atom', 'http://www.w3.org/2005/Atom/', 'http://purl.org/rss/1.0/', '')
    .map((uri): RootEdit => doc => doc.replace(`xmlns="${ATOM_NS}"`, `xmlns="${uri}"`)),
  dropNamespace: fc.constant<RootEdit>(doc => doc.replace(` xmlns="${ATOM_NS}"`, '')),
}

const arbFeedDoc = fc.array(arbEntry, { maxLength: 5 }).map(printChannelFeed)

describe('Feature: fresh, Property 15: Parser robustness', () => {
  // **Validates: Requirements 4.9, 4.10**
  it('returns exactly the valid entries in document order when invalid entries are mixed in', () => {
    fc.assert(
      fc.property(arbMixed, ({ valid, items }) => {
        expect(parseChannelFeed(printMixed(items))).toStrictEqual(valid)
      }),
      RUNS,
    )
  })

  it('returns not_xml for any edit that breaks well-formedness', () => {
    fc.assert(
      fc.property(arbFeedDoc, fc.oneof(...Object.values(NOT_XML_EDITS)), fc.nat(), (doc, edit, n) => {
        expect(parseChannelFeed(edit(doc, n))).toStrictEqual({ error: 'not_xml' })
      }),
      RUNS,
    )
  })

  it('returns not_atom when the root element or its namespace changes', () => {
    fc.assert(
      fc.property(arbFeedDoc, fc.oneof(...Object.values(NOT_ATOM_EDITS)), (doc, edit) => {
        expect(parseChannelFeed(edit(doc))).toStrictEqual({ error: 'not_atom' })
      }),
      RUNS,
    )
  })
})
