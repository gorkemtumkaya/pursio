import { describe, expect, it } from 'vitest'

describe('test runner', () => {
  it('runs unit tests in node', () => {
    expect(typeof process.versions.node).toBe('string')
  })
})
