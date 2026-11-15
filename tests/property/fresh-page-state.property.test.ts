// Feature: fresh, Property 35: Page state
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { buildFreshView } from '../../shared/utils/fresh-view'
import { arbViewInput, expectedChip } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

describe('Feature: fresh, Property 35: Page state', () => {
  it('is quiet, empty or content as Req 16.2 and 16.3 define, and saved-empty only on "Saved"', () => {
    /** **Validates: Requirements 14.7, 16.2, 16.3** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const view = buildFreshView(input)
        const chip = expectedChip(input)
        if (chip.kind === 'saved') {
          // Req 14.7: the saved-empty line iff the saved list is empty, and no other section.
          expect(view.state === 'saved_empty').toBe(view.saved.length === 0)
          expect(view.hero).toBeNull()
          expect(view.newCards).toEqual([])
          expect(view.bestCards).toEqual([])
          expect(view.quietLine).toBe(false)
          return
        }
        expect(view.state).not.toBe('saved_empty')
        const freshShown = view.hero?.kind === 'fresh' || view.newCards.length > 0
        const poolShown = view.hero?.kind === 'pool' || view.bestCards.length > 0
        // Req 16.2: quiet line (New_Section heading hidden) iff nothing fresh and some pool video shown.
        expect(view.quietLine).toBe(!freshShown && poolShown)
        // Req 16.3: Wick line iff no Hero_Card and both sections empty.
        const nothing = view.hero === null && view.newCards.length === 0 && view.bestCards.length === 0
        expect(view.state === 'empty').toBe(nothing)
        expect(view.state === 'content').toBe(!nothing)
        // The quiet line and the empty state never show together.
        if (view.quietLine) expect(view.state).toBe('content')
      }),
      RUNS,
    )
  })
})
