import { describe, expect, it } from 'vitest'
import { emptySettings, type LlmSettings } from '../../app/utils/llm-settings'
import { buildTreeRequest } from '../../app/utils/tree-client'

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
