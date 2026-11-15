// Feature: fresh, Property 31: Chip scope
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshPath, SkillMatch } from '../../shared/types/fresh'
import { buildFreshView, type FilterChip } from '../../shared/utils/fresh-view'
import { arbChip, arbViewInput, expectedChip, expectedSelected, NOW_MS, WEEK_MS } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 300 }

/** Skills shown under the chip (Req 14.3 to 14.5). */
function freshInScope(chip: FilterChip, paths: readonly FreshPath[], selected: FreshPath, m: SkillMatch): boolean {
  const path = paths.find((p) => p.id === m.pathId)
  if (!path || !path.skills.some((s) => s.id === m.skillId)) return false
  if (chip.kind === 'current') return m.pathId === selected.id && m.skillId === selected.currentSkillId
  if (chip.kind === 'path') return m.pathId === chip.pathId
  return true
}

/** Pool Skills in scope: the Current_Skill, every Current_Window, or the chip path's Current_Window. */
function poolInScope(chip: FilterChip, paths: readonly FreshPath[], selected: FreshPath, m: SkillMatch): boolean {
  if (chip.kind === 'current') return m.pathId === selected.id && m.skillId === selected.currentSkillId
  const path = paths.find((p) => p.id === m.pathId)
  if (!path) return false
  if (chip.kind === 'path' && path.id !== chip.pathId) return false
  return path.windowSkillIds.includes(m.skillId)
}

describe('Feature: fresh, Property 31: Chip scope', () => {
  it('shows only in-scope Fresh_Items under 7 days old and only in-scope pool videos', () => {
    /** **Validates: Requirements 8.10, 14.3, 14.4, 14.5** */
    fc.assert(
      fc.property(arbViewInput, (input) => {
        const view = buildFreshView(input)
        const chip = expectedChip(input)
        expect(view.chip).toEqual(chip)
        if (chip.kind === 'saved') return
        const { paths, items, pools } = input.response
        const selected = expectedSelected(paths, input.selectedPathId)

        const fresh = [
          ...view.newCards.map((c) => ({ card: c.card, match: c.match })),
          ...(view.hero?.kind === 'fresh' ? [{ card: view.hero.card, match: view.hero.match }] : []),
        ]
        for (const { card, match } of fresh) {
          const original = items.find((i) => i.videoId === card.videoId)
          expect(original).toBeDefined()
          // The chosen match is one of the item's own Path_Matches and lies in scope.
          expect(original!.matches).toContainEqual(match)
          expect(freshInScope(chip, paths, selected, match)).toBe(true)
          // Req 8.10, 12.1, 13.1: published less than 7 days before the response time.
          expect(NOW_MS - original!.publishedMs).toBeLessThan(WEEK_MS)
        }

        const poolShown = [
          ...view.bestCards.map((c) => ({ card: c.card, match: c.match })),
          ...(view.hero?.kind === 'pool' ? [{ card: view.hero.card, match: view.hero.match }] : []),
        ]
        for (const { card, match } of poolShown) {
          expect(poolInScope(chip, paths, selected, match)).toBe(true)
          const pool = pools.find((p) => p.pathId === match.pathId && p.skillId === match.skillId)
          expect(pool?.videos.map((v) => v.videoId)).toContain(card.videoId)
        }
        // The Hero_Card fallback comes from the Hero_Path's Current_Skill (Req 12.3, 14.4, 14.5).
        if (view.hero?.kind === 'pool') {
          const heroPath = chip.kind === 'path' ? paths.find((p) => p.id === chip.pathId)! : selected
          expect(view.hero.match).toEqual({ pathId: heroPath.id, skillId: heroPath.currentSkillId })
        }
      }),
      RUNS,
    )
  })

  it('is a pure function: another chip and back gives the same view and leaves the input unchanged', () => {
    /** **Validates: Requirements 14.11** */
    const arbCase = arbViewInput.chain((input) =>
      fc.array(arbChip(input.response.paths), { minLength: 1, maxLength: 4 }).map((others) => ({ input, others })),
    )
    fc.assert(
      fc.property(arbCase, ({ input, others }) => {
        const before = structuredClone(input)
        const first = buildFreshView(input)
        for (const chip of others) buildFreshView({ ...input, chip })
        const back = buildFreshView(input)
        expect(back).toEqual(first)
        expect(input).toEqual(before)
      }),
      RUNS,
    )
  })
})
