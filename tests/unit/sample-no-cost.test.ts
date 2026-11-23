// No cost before intent (spec: sample-path, Requirement 3; acceptance checks 1 and 3).
// The static guard over the page's own files is added in task 11.1, once those files exist.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { startsSession } from '../../app/utils/session-start'

const arbQuery = fc.dictionary(fc.string({ maxLength: 10 }), fc.oneof(fc.string({ maxLength: 10 }), fc.constant(null)), { maxKeys: 5 })

describe('startsSession', () => {
  it('starts no session on any /try/ path, whatever the query (acceptance checks 1 and 3)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 40 }), arbQuery, (rest, query) => {
        expect(startsSession(`/try/${rest}`, query)).toBe(false)
      }),
      { numRuns: 100 },
    )
    expect(startsSession('/try', {})).toBe(false)
    expect(startsSession('/try/guitar', { demo: '0', landing: '1' })).toBe(false)
  })

  it('keeps Demo_Mode as before', () => {
    expect(startsSession('/path', { demo: '1' })).toBe(false)
    expect(startsSession('/fresh', { demo: '1' })).toBe(false)
    expect(startsSession('/path', {})).toBe(true)
    expect(startsSession('/fresh', { demo: '0' })).toBe(true)
  })

  it('starts a session everywhere else, /new included, so the handoff gets one', () => {
    for (const path of ['/', '/new', '/path', '/quests', '/settings', '/pricing', '/trying', '/tryout']) {
      expect(startsSession(path, {}), path).toBe(true)
    }
  })
})

describe('the global middleware uses the rule', () => {
  it('starts a session only through startsSession', () => {
    const source = readFileSync(fileURLToPath(new URL('../../app/middleware/auth.global.ts', import.meta.url)), 'utf8')
    expect(source).toMatch(/if \(!startsSession\(to\.path, to\.query\)\) return\s*\n\s*void useAuth\(\)\.ensure\(\)/)
  })
})

describe('sample videos record nothing (Req 3.4, 8.4)', () => {
  const source = readFileSync(fileURLToPath(new URL('../../app/components/sample/SampleVideoList.vue', import.meta.url)), 'utf8')

  it('listens to no play, progress, pause, end or skip signal of the player or the card', () => {
    expect(source).not.toMatch(/@(playing|progress|paused|ended|skipped)\b/)
  })

  it('uses neither the event recorder nor the Watch section that calls it', () => {
    expect(source).not.toMatch(/useVideoEvents|WatchSection|recordPlay|recordSkip|recordProgress/)
  })
})
