// Handoff from the sample page to /new (spec: sample-path, Requirement 10; acceptance check 5).
import { beforeEach, describe, expect, it } from 'vitest'
import { HANDOFF_MAX_AGE_MS, handoffTarget, setSampleHandoff, takeSampleHandoff } from '../../app/utils/sample-handoff'
import { hobbyHandoffStep, withoutHobbyQuery } from '../../app/utils/landing'

const NOTE = 'I shoot on auto with a mirrorless camera. I want portraits with a soft background.'
const T0 = 1_000_000

beforeEach(() => {
  // Clear anything a previous test left.
  takeSampleHandoff('', T0)
})

/**
 * What /new does on load with the handoff, as `new.vue` does it: the step, then the note for a
 * `start`. Returns the note intake would read and whether intake starts.
 */
function newPageLoad(query: Record<string, string>, sessionReady = true): { hobby: string | null; note: string; starts: boolean } {
  const step = hobbyHandoffStep(query, sessionReady)
  if (step.kind === 'none' || step.kind === 'wait') return { hobby: null, note: '', starts: false }
  if (step.kind === 'fill') return { hobby: step.hobby, note: '', starts: false }
  return { hobby: step.hobby, note: takeSampleHandoff(step.hobby, T0 + 2_000) ?? '', starts: true }
}

describe('acceptance check 5: Build my path with a note', () => {
  it('lands on /new with the hobby and the note, starts intake, and the URL holds no part of the note', () => {
    const pageQuery = { utm_source: 'reddit', utm_campaign: 'nov' }
    setSampleHandoff('Photography', NOTE, T0)
    const target = handoffTarget('Photography', pageQuery)

    expect(target).toEqual({ path: '/new', query: { utm_source: 'reddit', utm_campaign: 'nov', hobby: 'Photography' } })
    const url = `${target.path}?${new URLSearchParams(target.query).toString()}`
    for (const word of NOTE.split(' ').filter((w) => w.length > 4)) expect(url).not.toContain(word)

    expect(newPageLoad(target.query)).toEqual({ hobby: 'Photography', note: NOTE, starts: true })
    // After the hobby is removed, utm stays in the URL of /new (Req 10.6).
    expect(withoutHobbyQuery(target.query)).toEqual({ utm_source: 'reddit', utm_campaign: 'nov' })
  })

  it('a refresh or a second load finds no note (Req 10.5)', () => {
    setSampleHandoff('Photography', NOTE, T0)
    expect(newPageLoad({ hobby: 'Photography' }).note).toBe(NOTE)
    expect(newPageLoad({ hobby: 'Photography' }).note).toBe('')
  })

  it('waits for the session without using the note up', () => {
    setSampleHandoff('Guitar', NOTE, T0)
    expect(newPageLoad({ hobby: 'Guitar' }, false)).toEqual({ hobby: null, note: '', starts: false })
    expect(newPageLoad({ hobby: 'Guitar' }, true)).toEqual({ hobby: 'Guitar', note: NOTE, starts: true })
  })
})

describe('Skip and an empty note (Req 10.2, 10.9)', () => {
  it('Skip hands over an empty note, as the landing page handoff does', () => {
    setSampleHandoff('Guitar', '', T0)
    expect(newPageLoad({ hobby: 'Guitar' })).toEqual({ hobby: 'Guitar', note: '', starts: true })
  })

  it('a note of spaces is an empty note', () => {
    setSampleHandoff('Guitar', '   \n  ', T0)
    expect(takeSampleHandoff('Guitar', T0)).toBe('')
  })
})

describe('takeSampleHandoff', () => {
  it('matches the hobby after normalizing it', () => {
    setSampleHandoff('Bird Watching ', NOTE, T0)
    expect(takeSampleHandoff('bird  watching', T0)).toBe(NOTE)
  })

  it('gives nothing for another hobby, and clears the handoff anyway (Req 10.4)', () => {
    setSampleHandoff('Photography', NOTE, T0)
    expect(takeSampleHandoff('chess', T0)).toBeNull()
    expect(takeSampleHandoff('Photography', T0)).toBeNull()
  })

  it('gives nothing after 60 s, or for a clock that went back', () => {
    setSampleHandoff('Photography', NOTE, T0)
    expect(takeSampleHandoff('Photography', T0 + HANDOFF_MAX_AGE_MS)).toBe(NOTE)
    setSampleHandoff('Photography', NOTE, T0)
    expect(takeSampleHandoff('Photography', T0 + HANDOFF_MAX_AGE_MS + 1)).toBeNull()
    setSampleHandoff('Photography', NOTE, T0)
    expect(takeSampleHandoff('Photography', T0 - 1)).toBeNull()
  })

  it('cuts the note to 800 characters', () => {
    setSampleHandoff('Guitar', 'a'.repeat(900), T0)
    expect(takeSampleHandoff('Guitar', T0)).toHaveLength(800)
  })

  it('start=0 never takes the note', () => {
    setSampleHandoff('Guitar', NOTE, T0)
    expect(newPageLoad({ hobby: 'Guitar', start: '0' })).toEqual({ hobby: 'Guitar', note: '', starts: false })
    expect(takeSampleHandoff('Guitar', T0)).toBe(NOTE)
  })
})
