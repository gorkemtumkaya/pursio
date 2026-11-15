// Feed_Printer (spec: fresh, Req 4.11): formats Feed_Entries as a YouTube-style Atom
// channel feed, one <entry> per Feed_Entry in list order. Test helper only.
import type { FeedEntry } from '../../shared/types/fresh'

/**
 * Escapes `& < > " '`. A literal CR is written as `&#13;` because XML parsers turn
 * it into LF, which would change the title on a round trip. Titles must not hold
 * characters XML 1.0 forbids (C0 controls other than tab, LF and CR).
 */
export function escapeFeedText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r/g, '&#13;')
}

/** ISO text in UTC with whole seconds, e.g. `2026-11-08T09:30:00Z`. Years must be 0000 to 9999. */
export function formatFeedTime(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function printChannelFeed(entries: readonly FeedEntry[]): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">',
  ]
  for (const e of entries) {
    lines.push(
      '  <entry>',
      `    <yt:videoId>${escapeFeedText(e.videoId)}</yt:videoId>`,
      `    <yt:channelId>${escapeFeedText(e.channelId)}</yt:channelId>`,
      `    <title>${escapeFeedText(e.title)}</title>`,
      `    <published>${formatFeedTime(e.publishedMs)}</published>`,
      '  </entry>',
    )
  }
  lines.push('</feed>', '')
  return lines.join('\n')
}
