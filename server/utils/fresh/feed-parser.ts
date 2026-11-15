/**
 * Feed_Parser (spec: fresh, Req 4.8 to 4.10, 18.4). A small single-pass XML scanner
 * for YouTube channel Atom feeds. It is not a general XML parser: it accepts the
 * subset YouTube feeds use and the Feed_Printer writes, and anything outside that
 * subset is an error, which only makes that one feed count as failed.
 *
 * Rejected as `not_xml`: `<!DOCTYPE` (so no entity expansion is possible), any
 * other `<!` markup except comments and CDATA, unknown named entities, bad numeric
 * references, mismatched or unclosed tags, text or a second element outside the
 * root, `<` in an attribute value, duplicate attributes and unbound prefixes.
 * Rejected as `not_atom`: a root that is not Atom `feed`.
 */
import type { FeedEntry } from '../../../shared/types/fresh'

export type FeedError = { error: 'not_xml' | 'not_atom' }

const ATOM_NS = 'http://www.w3.org/2005/Atom'
const YT_NS = 'http://www.youtube.com/xml/schemas/2015'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

const NAME_START = 'A-Za-z_\\u00C0-\\uFFFD'
const NAME_CHAR = `${NAME_START}0-9.\\-\\u00B7`
const QNAME_RE = new RegExp(`[${NAME_START}][${NAME_CHAR}]*(?::[${NAME_START}][${NAME_CHAR}]*)?`, 'y')
const PI_TARGET_RE = new RegExp(`^[${NAME_START}][${NAME_CHAR}:]*`)
const END_TAG_TAIL_RE = /[ \t\r\n]*>/y
const XML_DECL_RE = /^<\?xml\s+version\s*=\s*(["'])1\.[0-9]+\1/
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
const RFC3339_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/
// Characters XML 1.0 never allows, even as literal text.
const BAD_CHAR_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/
const PREDEFINED: Readonly<Record<string, string>> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

const NOT_XML: FeedError = { error: 'not_xml' }
const NOT_ATOM: FeedError = { error: 'not_atom' }

type Field = 'videoId' | 'channelId' | 'title' | 'published'

interface OpenElement {
  qname: string
  /** Prefix bindings in scope ('' is the default namespace). */
  ns: ReadonlyMap<string, string>
}

interface EntryDraft {
  fields: Partial<Record<Field, string>>
}

function isXmlChar(code: number): boolean {
  return code === 0x9 || code === 0xa || code === 0xd
    || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd)
    || (code >= 0x10000 && code <= 0x10ffff)
}

/** Decodes the five predefined entities and numeric references. Returns null for a bad or unknown reference. */
function decodeReferences(raw: string): string | null {
  let out = ''
  let from = 0
  for (;;) {
    const amp = raw.indexOf('&', from)
    if (amp < 0) return out + raw.slice(from)
    const semi = raw.indexOf(';', amp + 1)
    if (semi < 0) return null
    const ref = raw.slice(amp + 1, semi)
    let decoded: string
    if (ref.startsWith('#')) {
      const hex = /^#x[0-9A-Fa-f]{1,6}$/.test(ref)
      if (!hex && !/^#[0-9]{1,7}$/.test(ref)) return null
      const code = hex ? Number.parseInt(ref.slice(2), 16) : Number.parseInt(ref.slice(1), 10)
      if (!isXmlChar(code)) return null
      decoded = String.fromCodePoint(code)
    } else {
      const named = PREDEFINED[ref]
      if (named === undefined) return null
      decoded = named
    }
    out += raw.slice(from, amp) + decoded
    from = semi + 1
  }
}

/** XML end-of-line handling: literal CRLF and CR become LF (references such as `&#13;` are kept). */
function normalizeNewlines(raw: string): string {
  return raw.replace(/\r\n?/g, '\n')
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** RFC 3339 date-time to epoch ms, or null. */
function parsePublished(text: string): number | null {
  const m = RFC3339_RE.exec(text)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number]
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  if (m[9] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) return null
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : null
}

function toFeedEntry(draft: EntryDraft): FeedEntry | null {
  const videoId = draft.fields.videoId?.trim() ?? ''
  const channelId = draft.fields.channelId?.trim() ?? ''
  const published = draft.fields.published?.trim() ?? ''
  if (!VIDEO_ID_RE.test(videoId) || channelId === '') return null
  const publishedMs = parsePublished(published)
  if (publishedMs === null) return null
  return { videoId, title: draft.fields.title ?? '', channelId, publishedMs }
}

function splitQName(qname: string): { prefix: string; local: string } {
  const colon = qname.indexOf(':')
  return colon < 0 ? { prefix: '', local: qname } : { prefix: qname.slice(0, colon), local: qname.slice(colon + 1) }
}

/** Parses a YouTube channel Atom feed into its valid entries, in document order. */
export function parseChannelFeed(xml: string): FeedEntry[] | FeedError {
  const doc = xml.startsWith('\uFEFF') ? xml.slice(1) : xml
  if (BAD_CHAR_RE.test(doc)) return NOT_XML

  const stack: OpenElement[] = []
  const entries: FeedEntry[] = []
  let rootSeen = false
  let isAtom = false
  let entry: EntryDraft | null = null
  /** Field being captured and the stack depth of its element. */
  let capture: { field: Field; depth: number } | null = null
  let i = 0

  const appendText = (text: string): void => {
    if (entry && capture) entry.fields[capture.field] = (entry.fields[capture.field] ?? '') + text
  }

  const fieldOf = (uri: string, local: string): Field | null => {
    if (uri === ATOM_NS && (local === 'title' || local === 'published')) return local
    if (uri === YT_NS && (local === 'videoId' || local === 'channelId')) return local
    return null
  }

  while (i < doc.length) {
    const lt = doc.indexOf('<', i)
    const textEnd = lt < 0 ? doc.length : lt
    if (textEnd > i) {
      const raw = doc.slice(i, textEnd)
      if (stack.length === 0) {
        if (!/^[ \t\r\n]*$/.test(raw)) return NOT_XML
      } else {
        if (raw.includes(']]>')) return NOT_XML
        const text = decodeReferences(normalizeNewlines(raw))
        if (text === null) return NOT_XML
        appendText(text)
      }
    }
    if (lt < 0) break
    i = lt

    if (doc.startsWith('<?', i)) {
      const end = doc.indexOf('?>', i + 2)
      if (end < 0) return NOT_XML
      const target = PI_TARGET_RE.exec(doc.slice(i + 2, end))?.[0]
      if (!target) return NOT_XML
      if (target.toLowerCase() === 'xml') {
        if (i !== 0 || !XML_DECL_RE.test(doc.slice(0, end + 2))) return NOT_XML
      }
      i = end + 2
      continue
    }

    if (doc.startsWith('<!--', i)) {
      const end = doc.indexOf('-->', i + 4)
      if (end < 0) return NOT_XML
      const body = doc.slice(i + 4, end)
      if (body.includes('--') || body.endsWith('-')) return NOT_XML
      i = end + 3
      continue
    }

    if (doc.startsWith('<![CDATA[', i)) {
      if (stack.length === 0) return NOT_XML
      const end = doc.indexOf(']]>', i + 9)
      if (end < 0) return NOT_XML
      appendText(normalizeNewlines(doc.slice(i + 9, end)))
      i = end + 3
      continue
    }

    // `<!DOCTYPE` and every other markup declaration.
    if (doc.startsWith('<!', i)) return NOT_XML

    if (doc.startsWith('</', i)) {
      QNAME_RE.lastIndex = i + 2
      const name = QNAME_RE.exec(doc)?.[0]
      if (!name) return NOT_XML
      END_TAG_TAIL_RE.lastIndex = i + 2 + name.length
      const close = END_TAG_TAIL_RE.exec(doc)
      if (!close) return NOT_XML
      const top = stack.pop()
      if (!top || top.qname !== name) return NOT_XML
      const depth = stack.length + 1
      if (capture && capture.depth === depth) capture = null
      if (entry && depth === 2) {
        const done = toFeedEntry(entry)
        if (done) entries.push(done)
        entry = null
      }
      i += 2 + name.length + close[0].length
      continue
    }

    // Start or empty-element tag.
    QNAME_RE.lastIndex = i + 1
    const qname = QNAME_RE.exec(doc)?.[0]
    if (!qname) return NOT_XML
    let j = i + 1 + qname.length
    const attrs = new Map<string, string>()
    let selfClosing = false
    for (;;) {
      const wsStart = j
      while (j < doc.length && ' \t\r\n'.includes(doc.charAt(j))) j++
      if (doc.startsWith('/>', j)) { selfClosing = true; j += 2; break }
      if (doc.charAt(j) === '>') { j += 1; break }
      if (j === wsStart || j >= doc.length) return NOT_XML
      QNAME_RE.lastIndex = j
      const attrName = QNAME_RE.exec(doc)?.[0]
      if (!attrName || attrs.has(attrName)) return NOT_XML
      j += attrName.length
      while (' \t\r\n'.includes(doc.charAt(j)) && j < doc.length) j++
      if (doc.charAt(j) !== '=') return NOT_XML
      j++
      while (' \t\r\n'.includes(doc.charAt(j)) && j < doc.length) j++
      const quote = doc.charAt(j)
      if (quote !== '"' && quote !== "'") return NOT_XML
      const valueEnd = doc.indexOf(quote, j + 1)
      if (valueEnd < 0) return NOT_XML
      const rawValue = doc.slice(j + 1, valueEnd)
      if (rawValue.includes('<')) return NOT_XML
      const value = decodeReferences(rawValue.replace(/\r\n|[\t\n\r]/g, ' '))
      if (value === null) return NOT_XML
      attrs.set(attrName, value)
      j = valueEnd + 1
    }

    // Namespace scope for this element.
    const parentNs = stack.at(-1)?.ns ?? new Map<string, string>([['xml', XML_NS]])
    let ns: Map<string, string> | null = null
    for (const [name, value] of attrs) {
      if (name === 'xmlns') {
        ns ??= new Map(parentNs)
        ns.set('', value)
      } else if (name.startsWith('xmlns:')) {
        const prefix = name.slice(6)
        if (value === '' || prefix === 'xmlns' || prefix === 'xml') return NOT_XML
        ns ??= new Map(parentNs)
        ns.set(prefix, value)
      }
    }
    const scope: ReadonlyMap<string, string> = ns ?? parentNs
    for (const name of attrs.keys()) {
      const { prefix } = splitQName(name)
      if (prefix !== '' && prefix !== 'xmlns' && !scope.has(prefix)) return NOT_XML
    }
    const { prefix, local } = splitQName(qname)
    const uri = scope.get(prefix) ?? ''
    if (prefix !== '' && !scope.has(prefix)) return NOT_XML

    const depth = stack.length + 1
    if (depth === 1) {
      if (rootSeen) return NOT_XML
      rootSeen = true
      isAtom = local === 'feed' && uri === ATOM_NS
    } else if (isAtom) {
      if (depth === 2 && local === 'entry' && uri === ATOM_NS) {
        entry = { fields: {} }
      } else if (depth === 3 && entry && !capture) {
        const field = fieldOf(uri, local)
        if (field && entry.fields[field] === undefined) {
          entry.fields[field] = ''
          capture = { field, depth }
        }
      }
    }

    if (selfClosing) {
      if (capture && capture.depth === depth) capture = null
      if (entry && depth === 2) {
        const done = toFeedEntry(entry)
        if (done) entries.push(done)
        entry = null
      }
    } else {
      stack.push({ qname, ns: scope })
    }
    i = j
  }

  if (!rootSeen || stack.length > 0) return NOT_XML
  return isAtom ? entries : NOT_ATOM
}
