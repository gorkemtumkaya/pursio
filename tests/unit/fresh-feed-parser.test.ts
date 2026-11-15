// Feed_Parser examples (spec: fresh, task 5.4, Req 4.8 to 4.10, 19.2).
import { describe, expect, it } from 'vitest'
import { parseChannelFeed } from '../../server/utils/fresh/feed-parser'

const FEED_OPEN = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">\n'

function entry(fields: { videoId?: string; channelId?: string; title?: string; published?: string }): string {
  return '<entry>'
    + (fields.videoId === undefined ? '' : `<yt:videoId>${fields.videoId}</yt:videoId>`)
    + (fields.channelId === undefined ? '' : `<yt:channelId>${fields.channelId}</yt:channelId>`)
    + (fields.title === undefined ? '' : `<title>${fields.title}</title>`)
    + (fields.published === undefined ? '' : `<published>${fields.published}</published>`)
    + '</entry>\n'
}

function feed(...entries: string[]): string {
  return FEED_OPEN + entries.join('') + '</feed>\n'
}

const CH = 'UCabcdefghijklmnopqrstuv'
const good = (videoId: string, published = '2026-11-10T12:00:00+00:00'): string =>
  entry({ videoId, channelId: CH, title: `t ${videoId}`, published })

describe('parseChannelFeed', () => {
  it('reads every valid entry in document order', () => {
    const xml = feed(
      entry({ videoId: 'aaaaaaaaaaa', channelId: CH, title: 'Fish &amp; <![CDATA[chips]]>', published: '2026-11-10T12:00:00+02:00' }),
      entry({ videoId: 'b-b_b-b_b-b', channelId: CH, published: '2026-11-10T12:00:00.500Z' }),
    )
    expect(parseChannelFeed(xml)).toEqual([
      { videoId: 'aaaaaaaaaaa', title: 'Fish & chips', channelId: CH, publishedMs: Date.UTC(2026, 10, 10, 10, 0, 0) },
      { videoId: 'b-b_b-b_b-b', title: '', channelId: CH, publishedMs: Date.UTC(2026, 10, 10, 12, 0, 0, 500) },
    ])
  })

  it('returns an empty list for a valid feed with no entries', () => {
    expect(parseChannelFeed(feed())).toEqual([])
  })

  describe('unparseable documents give an error', () => {
    it.each([
      ['empty string', ''],
      ['plain text', 'not a feed'],
      ['HTML error page', '<html><body>500</body>'],
      ['unclosed root', FEED_OPEN + good('aaaaaaaaaaa')],
      ['mismatched tag', feed('<entry><title>x</published></entry>')],
      ['DOCTYPE', '<!DOCTYPE feed [<!ENTITY x "y">]>' + feed()],
      ['unknown entity', feed(entry({ videoId: 'aaaaaaaaaaa', channelId: CH, title: '&nbsp;', published: '2026-11-10T12:00:00Z' }))],
      ['bad numeric reference', feed(entry({ videoId: 'aaaaaaaaaaa', channelId: CH, title: '&#0;', published: '2026-11-10T12:00:00Z' }))],
      ['text after the root', feed() + 'trailing'],
      ['second root element', feed() + '<feed xmlns="http://www.w3.org/2005/Atom"></feed>'],
      ['< in an attribute value', '<feed xmlns="http://www.w3.org/2005/Atom" a="<"></feed>'],
    ])('%s is not_xml', (_label, xml) => {
      expect(parseChannelFeed(xml)).toEqual({ error: 'not_xml' })
    })

    it.each([
      ['RSS root', '<rss version="2.0"><channel></channel></rss>'],
      ['feed without the Atom namespace', '<feed><entry></entry></feed>'],
      ['feed in another namespace', '<feed xmlns="http://example.com/atom"></feed>'],
    ])('%s is not_atom', (_label, xml) => {
      expect(parseChannelFeed(xml)).toEqual({ error: 'not_atom' })
    })
  })

  describe('invalid entries are skipped, others kept', () => {
    it('skips entries with a missing or malformed video id', () => {
      const xml = feed(
        good('aaaaaaaaaaa'),
        entry({ channelId: CH, title: 'no id', published: '2026-11-10T12:00:00Z' }),
        good('short'),
        good('aaaaaaaaaaaa'),
        good('aaaaa aaaaa'),
        good('ccccccccccc'),
      )
      const result = parseChannelFeed(xml)
      expect(Array.isArray(result) && result.map((e) => e.videoId)).toEqual(['aaaaaaaaaaa', 'ccccccccccc'])
    })

    it('skips entries with a missing or unparseable published time', () => {
      const xml = feed(
        good('aaaaaaaaaaa'),
        entry({ videoId: 'nopublished', channelId: CH, title: 'x' }),
        good('notadateeee', 'yesterday'),
        good('noofffseett', '2026-11-10T12:00:00'),
        good('badmonthhhh', '2026-13-10T12:00:00Z'),
        good('feb30thhhhh', '2026-02-30T12:00:00Z'),
        good('badhourrrrr', '2026-11-10T24:00:00Z'),
        good('dateonlyyyy', '2026-11-10'),
        good('ccccccccccc'),
      )
      const result = parseChannelFeed(xml)
      expect(Array.isArray(result) && result.map((e) => e.videoId)).toEqual(['aaaaaaaaaaa', 'ccccccccccc'])
    })

    it('skips entries with no channel id', () => {
      const xml = feed(entry({ videoId: 'bbbbbbbbbbb', title: 'x', published: '2026-11-10T12:00:00Z' }), good('aaaaaaaaaaa'))
      const result = parseChannelFeed(xml)
      expect(Array.isArray(result) && result.map((e) => e.videoId)).toEqual(['aaaaaaaaaaa'])
    })

    it('returns an empty list when every entry is invalid', () => {
      expect(parseChannelFeed(feed(good('bad'), good('aaaaaaaaaaa', 'never')))).toEqual([])
    })
  })
})
