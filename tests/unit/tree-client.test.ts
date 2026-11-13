import { describe, expect, it } from 'vitest'
import { emptySettings, type LlmSettings } from '../../app/utils/llm-settings'
import { buildTreeRequest, friendlyMessage } from '../../app/utils/tree-client'

const withKey: LlmSettings = { ...emptySettings(), apiKey: 'test-key-placeholder' }

describe('buildTreeRequest level', () => {
  it('sends hobby and level without an own key', () => {
    const request = buildTreeRequest('guitar', 'some', emptySettings())
    expect(request.body.hobby).toBe('guitar')
    expect(request.body.level).toBe('some')
    expect(request.usesOwnKey).toBe(false)
  })

  it('keeps the level and adds provider and model with an own key', () => {
    const request = buildTreeRequest('guitar', 'some', withKey)
    expect(request.body.level).toBe('some')
    expect(request.body.hobby).toBe('guitar')
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
