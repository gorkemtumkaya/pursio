// Feature: fresh, Property 33: Header text and time labels
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshPath, FreshResponseOk } from '../../shared/types/fresh'
import { buildFreshView, relativeTime, type FilterChip } from '../../shared/utils/fresh-view'
import { normalizeText } from '../../shared/utils/video-normalize'
import { arbViewInput, DAY_MS, expectedChip, expectedSelected, NOW_MS } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

/** Req 11.4. */
function expectedLabel(chip: FilterChip, paths: readonly FreshPath[], selected: FreshPath): string {
  if (chip.kind === 'current') return selected.hobby
  if (chip.kind === 'saved') return 'Saved'
  if (chip.kind === 'path') return paths.find((p) => p.id === chip.pathId)!.hobby
  return paths.length === 1 ? paths[0]!.hobby : 'All hobbies'
}

/**
 * Req 11.5, 11.6: latest check time over the Check_Keys of the paths in scope. A path's keys are
 * (hobby, user language) and, for a language other than `en`, (hobby, `en`).
 */
function expectedUpdated(response: FreshResponseOk, scope: readonly FreshPath[]): number | null {
  const keys = new Set<string>()
  for (const p of scope) {
    const hobby = normalizeText(p.hobby)
    keys.add(`${hobby}\n${response.language}`)
    keys.add(`${hobby}\nen`)
  }
  const times = response.checkTimes
    .filter((t) => keys.has(`${normalizeText(t.hobby)}\n${t.language}`))
    .map((t) => t.lastSuccessMs)
  return times.length === 0 ? null : Math.max(...times)
}

describe('Feature: fresh, Property 33: Header text and time labels', () => {
  it('relativeTime follows the bounds of Req 11.5 for any elapsed seconds', () => {
    /** **Validates: Requirements 11.5** */
    const arbSeconds = fc.oneof(
      fc.constantFrom(-1, 0, 59, 60, 3599, 3600, 86399, 86400, 172800),
      fc.integer({ min: -10 * 86400, max: 400 * 86400 }),
    )
    const arbExtraMs = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 999 }))
    fc.assert(
      fc.property(arbSeconds, arbExtraMs, (s, extraMs) => {
        // Elapsed time is s seconds plus a fraction; labels round down to whole units.
        const elapsedMs = s * 1000 + (s >= 0 ? extraMs : -extraMs)
        const label = relativeTime(NOW_MS, NOW_MS - elapsedMs)
        if (s < 60) expect(label).toBe('just now')
        else if (s < 3600) expect(label).toBe(`${Math.floor(s / 60)}m ago`)
        else if (s < 86400) expect(label).toBe(`${Math.floor(s / 3600)}h ago`)
        else expect(label).toBe(`${Math.floor(s / 86400)}d ago`)
      }),
      { numRuns: 500 },
    )
  })

  it('sets the header label and the "Updated" time from the selected chip', () => {
    /** **Validates: Requirements 11.4, 11.5, 11.6** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const view = buildFreshView(input)
        const { paths } = input.response
        const selected = expectedSelected(paths, input.selectedPathId)
        const chip = expectedChip(input)
        expect(view.headerLabel).toBe(expectedLabel(chip, paths, selected))
        const scope =
          chip.kind === 'current' ? [selected] : chip.kind === 'path' ? paths.filter((p) => p.id === chip.pathId) : paths
        expect(view.updatedMs).toBe(expectedUpdated(input.response, scope))
      }),
      RUNS,
    )
  })

  it('shows the "New" badge only for Fresh_Items published less than 24 hours before the response', () => {
    /** **Validates: Requirements 13.12** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const view = buildFreshView(input)
        for (const card of view.newCards) expect(card.isNew).toBe(NOW_MS - card.card.publishedMs < DAY_MS)
        if (view.hero?.kind === 'fresh') expect(view.hero.isNew).toBe(NOW_MS - view.hero.card.publishedMs < DAY_MS)
      }),
      RUNS,
    )
  })
})
