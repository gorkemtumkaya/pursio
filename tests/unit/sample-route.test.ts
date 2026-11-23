// Route of the sample pages and the /new handoff (spec: sample-path, Requirement 1; acceptance check 2).
import { describe, expect, it } from 'vitest'
import { hobbyTextFromSlug, unknownSlugTarget } from '../../shared/utils/sample-slugs'
import { sampleRedirect } from '../../app/utils/sample-route'
import { hobbyHandoffStep, withoutHobbyQuery } from '../../app/utils/landing'

describe('sampleRedirect', () => {
  it.each(['photography', 'guitar', 'birdwatching'])('shows the sample page for %s, whatever the query', (slug) => {
    expect(sampleRedirect(slug, {})).toBeNull()
    expect(sampleRedirect(slug, { utm_source: 'reddit', hobby: 'chess', start: '1' })).toBeNull()
  })

  it('sends /try/unknown to /new with the hobby prefilled and nothing started (acceptance check 2)', () => {
    expect(sampleRedirect('unknown', {})).toEqual({ path: '/new', query: { hobby: 'unknown', start: '0' } })
    expect(sampleRedirect('calligraphy', { utm_source: 'reddit', utm_campaign: 'nov' })).toEqual({
      path: '/new',
      query: { utm_source: 'reddit', utm_campaign: 'nov', hobby: 'calligraphy', start: '0' },
    })
  })

  it('treats near misses as unknown slugs', () => {
    expect(sampleRedirect('Guitar', {})?.query.hobby).toBe('Guitar')
    expect(sampleRedirect('film-photography', {})?.query.hobby).toBe('film photography')
  })
})

describe('hobbyTextFromSlug (Req 1.3)', () => {
  it.each([
    ['calligraphy', 'calligraphy'],
    ['film-photography', 'film photography'],
    ['trail_running', 'trail running'],
    ['--sour--dough__', 'sour dough'],
    ['Guitar', 'Guitar'],
    ['rock%20climbing', 'rock climbing'],
    ["d%26d", 'd&d'],
    ['ölçüm', 'ölçüm'],
  ])('%s gives %s', (slug, text) => {
    expect(hobbyTextFromSlug(slug)).toBe(text)
  })

  it.each(['', '---', '___', '%3Cb%3E', 'a%2Fb', 'emoji%F0%9F%98%80', '%E0%A4%A'])('%s gives no hobby', (slug) => {
    expect(hobbyTextFromSlug(slug)).toBeNull()
  })

  it('cuts to 60 characters and trims the cut', () => {
    const text = hobbyTextFromSlug(`${'a'.repeat(59)}-bbbb`)
    expect(text).toBe('a'.repeat(59))
  })

  it('an unusable slug goes to /new without hobby or start, keeping campaign params', () => {
    expect(unknownSlugTarget('---', { gclid: 'abc' })).toEqual({ path: '/new', query: { gclid: 'abc' } })
  })

  it('copies only campaign params of 1 to 200 characters, taking the first of a list', () => {
    const query = { utm_source: ['reddit', 'x'], utm_medium: '', utm_term: 'a'.repeat(201), ref: 'friend', note: 'secret' }
    expect(unknownSlugTarget('x', query).query).toEqual({ utm_source: 'reddit', hobby: 'x', start: '0' })
  })
})

describe('hobbyHandoffStep on /new (Req 1.5)', () => {
  it('with start=0, fills the hobby at once, before any session', () => {
    expect(hobbyHandoffStep({ hobby: 'calligraphy', start: '0' }, false)).toEqual({ kind: 'fill', hobby: 'calligraphy' })
    expect(hobbyHandoffStep({ hobby: 'calligraphy', start: '0' }, true)).toEqual({ kind: 'fill', hobby: 'calligraphy' })
  })

  it('without start=0, waits for the session and then starts, as before', () => {
    expect(hobbyHandoffStep({ hobby: 'chess' }, false)).toEqual({ kind: 'wait' })
    expect(hobbyHandoffStep({ hobby: 'chess' }, true)).toEqual({ kind: 'start', hobby: 'chess' })
    expect(hobbyHandoffStep({ hobby: 'chess', start: '1' }, true)).toEqual({ kind: 'start', hobby: 'chess' })
  })

  it('does nothing without a usable hobby, with or without start', () => {
    expect(hobbyHandoffStep({}, true)).toEqual({ kind: 'none' })
    expect(hobbyHandoffStep({ hobby: '   ', start: '0' }, true)).toEqual({ kind: 'none' })
  })

  it('removes hobby and start from the URL and keeps the rest', () => {
    expect(withoutHobbyQuery({ hobby: 'x', start: '0', utm_source: 'reddit', landing: '1' })).toEqual({
      utm_source: 'reddit',
      landing: '1',
    })
  })
})
