// No cost before intent (spec: sample-path, Requirement 3; acceptance checks 1 and 3).
import { readdirSync, readFileSync } from 'node:fs'
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

describe('the page\u2019s own files reach no session, account, video recorder, API or storage (Req 3.1, 3.4, 3.5)', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const files = [
    ...readdirSync(`${root}app/components/sample`).map((name) => `app/components/sample/${name}`),
    'app/pages/try/[hobby].vue',
    ...readdirSync(`${root}app/utils`).filter((name) => name.startsWith('sample-')).map((name) => `app/utils/${name}`),
  ]
  /** Code only: comments may name what the code must not use. */
  const code = (path: string): string =>
    readFileSync(`${root}${path}`, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const FORBIDDEN = [
    'useAuth', 'useCloudStore', 'useSkillVideos', 'useVideoEvents', 'useHobbyBuilder', 'useBillingStatus',
    'useFoundingCheckout', 'useAuthDialog', 'getSupabase', 'WatchSection', 'AuthSessionGate', '$fetch', 'fetch(',
    '/api/', 'localStorage', 'sessionStorage', 'document.cookie',
  ]

  it('covers the page, its components and its helpers', () => {
    expect(files).toContain('app/components/sample/SampleView.vue')
    expect(files).toContain('app/utils/sample-handoff.ts')
    expect(files.length).toBeGreaterThanOrEqual(15)
  })

  it.each(FORBIDDEN)('no file uses %s', (name) => {
    expect(files.filter((path) => code(path).includes(name))).toEqual([])
  })
})

describe('every control of the sample components shows the pointer (Req 14.4)', () => {
  const dir = fileURLToPath(new URL('../../app/components/sample/', import.meta.url))
  const tags = readdirSync(dir)
    .filter((name) => name.endsWith('.vue'))
    .flatMap((name) =>
      [...readFileSync(`${dir}${name}`, 'utf8').matchAll(/<(button|a|NuxtLink|AppButton)\b[^>]*>/g)].map((m) => ({ name, tag: m[0] })),
    )

  it('finds the controls', () => {
    expect(tags.length).toBeGreaterThanOrEqual(8)
  })

  it('each one has cursor-pointer', () => {
    expect(tags.filter(({ tag }) => !tag.includes('cursor-pointer')).map(({ name, tag }) => `${name}: ${tag.slice(0, 60)}`)).toEqual([])
  })
})
