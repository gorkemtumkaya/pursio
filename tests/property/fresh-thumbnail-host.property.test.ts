// Feature: fresh, Property 36: Snapshot thumbnail host
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isAllowedThumbnail } from '../../shared/utils/fresh-view'

const RUNS = { numRuns: 500 }

const SCHEMES = ['https', 'HTTPS', 'Https', 'http', 'ftp', 'javascript', 'data', 'blob', 'wss'] as const
const HOSTS = [
  'i.ytimg.com',
  'I.YTIMG.COM',
  'i.ytimg.com.evil.com',
  'i.ytimg.com.',
  'xi.ytimg.com',
  'i-ytimg.com',
  'i.ytimg.co',
  'ytimg.com',
  'img.youtube.com',
  'evil.com',
  'i.ytimg.com%2eevil.com',
] as const
const USERINFO = ['', 'user@', 'i.ytimg.com@', 'a:b@'] as const
const PORTS = ['', ':443', ':8443', ':80'] as const
const PATHS = ['', '/', '/vi/abc/hqdefault.jpg', '/vi/abc/hq.jpg?x=1#y', '/@evil.com/x'] as const

describe('Feature: fresh, Property 36: Snapshot thumbnail host', () => {
  it('allows a thumbnail iff it is an https: URL on host i.ytimg.com', () => {
    /** **Validates: Requirements 18.3** */
    const arbParts = fc.record({
      scheme: fc.constantFrom(...SCHEMES),
      userinfo: fc.constantFrom(...USERINFO),
      host: fc.constantFrom(...HOSTS),
      port: fc.constantFrom(...PORTS),
      path: fc.constantFrom(...PATHS),
    })
    fc.assert(
      fc.property(arbParts, ({ scheme, userinfo, host, port, path }) => {
        const url = `${scheme}://${userinfo}${host}${port}${path}`
        // Scheme and host compare case-insensitively; 443 is the https default port, so the host stays i.ytimg.com.
        const expected =
          scheme.toLowerCase() === 'https' && host.toLowerCase() === 'i.ytimg.com' && (port === '' || port === ':443')
        expect(isAllowedThumbnail(url)).toBe(expected)
      }),
      RUNS,
    )
  })

  it('never allows a URL that is not https on i.ytimg.com, for any text', () => {
    /** **Validates: Requirements 18.3** */
    const arbText = fc.oneof(
      fc.string({ maxLength: 60 }),
      fc.webUrl({ withQueryParameters: true, withFragments: true }),
      fc.webPath().map((p) => `https://i.ytimg.com${p}`),
    )
    fc.assert(
      fc.property(arbText, (text) => {
        const allowed = isAllowedThumbnail(text)
        if (!allowed) return
        const parsed = new URL(text)
        expect(parsed.protocol).toBe('https:')
        expect(parsed.hostname).toBe('i.ytimg.com')
        expect(parsed.port).toBe('')
      }),
      RUNS,
    )
  })
})
