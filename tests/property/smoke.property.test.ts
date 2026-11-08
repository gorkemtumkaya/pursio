import fc from 'fast-check'
import { describe, it } from 'vitest'

describe('property runner', () => {
  it('runs fast-check properties', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 100 },
    )
  })
})
