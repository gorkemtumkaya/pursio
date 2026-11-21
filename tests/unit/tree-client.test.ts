import { describe, expect, it } from 'vitest'
import type { FinalProfile } from '../../shared/types/learner-profile'
import { emptySettings, type LlmSettings } from '../../app/utils/llm-settings'
import { buildTreeRequest, friendlyMessage } from '../../app/utils/tree-client'

const withKey: LlmSettings = { ...emptySettings(), apiKey: 'test-key-placeholder' }

const PROFILE: FinalProfile = {
  level: 'returning',
  goal: null,
  avoid: ['performing'],
  taste: [],
  known: [],
  goalOptions: [
    { id: 'a', label: 'A', finishLine: 'Finish A' },
    { id: 'b', label: 'B', finishLine: 'Finish B' },
  ],
}

describe('buildTreeRequest (spec: path-intake, Req 6.5)', () => {
  it('sends the hobby and the level new without a profile, as a build worked before intake', () => {
    const request = buildTreeRequest('guitar', null, emptySettings())
    expect(request.body).toEqual({ hobby: 'guitar', level: 'new' })
    expect(request.usesOwnKey).toBe(false)
  })

  it('sends the profile and no level with a profile', () => {
    const request = buildTreeRequest('guitar', PROFILE, emptySettings(), ' play at home ')
    expect(request.body).toEqual({ hobby: 'guitar', profile: PROFILE, goal: 'play at home' })
  })

  it('adds provider and model with an own key', () => {
    const request = buildTreeRequest('guitar', PROFILE, withKey)
    expect(request.body.profile).toBe(PROFILE)
    expect(request.body.provider).toBe(withKey.provider)
    expect(request.body.model).toBeTruthy()
    expect(request.usesOwnKey).toBe(true)
  })
})

// spec: accounts-cloud-save, Req 9.11
describe('friendlyMessage for the account codes', () => {
  it.each([{ usesOwnKey: false }, { usesOwnKey: true }])('gives the session sentence for unauthorized (%o)', (context) => {
    expect(friendlyMessage('unauthorized', context)).toBe('Your session ended. Reload the page and try again.')
  })

  it.each([{ usesOwnKey: false }, { usesOwnKey: true }])('gives the save sentence for save_failed (%o)', (context) => {
    expect(friendlyMessage('save_failed', context)).toBe("We built your tree but couldn't save it. Try again.")
  })
})

// spec: tree-api-502-on-new-path, Req 2.4
describe('friendlyMessage for provider codes', () => {
  it('tells the learner what to do next for provider_auth on the default key', () => {
    expect(friendlyMessage('provider_auth', { usesOwnKey: false })).toBe(
      "The AI service isn't available right now. Try again later, or add your own API key in Settings.",
    )
  })

  it('keeps the own-key sentence for provider_auth', () => {
    expect(friendlyMessage('provider_auth', { usesOwnKey: true })).toBe(
      'Your API key was not accepted. Check it in Settings.',
    )
  })

  it.each([{ usesOwnKey: false }, { usesOwnKey: true }])('gives the retry or own-key sentence for provider_error (%o)', (context) => {
    expect(friendlyMessage('provider_error', context)).toBe(
      'The AI service had a problem. Try again in a moment, or add your own API key in Settings.',
    )
  })
})
