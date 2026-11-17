// Feature: fresh-v2, Property 5: Hero choice
// For any generated response, the hero is:
// - the top-ranked Shown_Item among the paths in Scope with a Current_Skill, with badge `today`
//   exactly when it was published under 86400 s before, else `week`;
// - else the first non-muted pool video of the Current_Skill of the first path in Path_Order
//   (within Scope) that has one, with badge `best`;
// - else null.
// It is null under "Saved". After muting the hero's channel, the hero is the result of the same
// rule on the new mutes.
// Validates: Requirements 3.1, 3.2, 3.4, 3.6, 3.7, 12.4
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshPath } from '../../shared/types/fresh'
import { buildFreshView, type FilterChip, type FreshViewInput } from '../../shared/utils/fresh-view'
import { DAY_MS, arbSectionInput, expectedPathOrder, expectedRanked, isMuted } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 200 }

interface ExpectedHero {
  kind: 'fresh' | 'pool'
  videoId: string
  pathId: string
  skillId: string
  badge: 'today' | 'week' | 'best'
}

/** The rule of Req 3.1, 3.2 and 3.4, written from the requirement. `scope` is in Path_Order. */
function expectedHero(input: FreshViewInput, scope: readonly FreshPath[]): ExpectedHero | null {
  const { response, mutes } = input
  const withCurrent = scope.filter((p) => p.currentSkillId !== null)
  const ids = new Set(withCurrent.map((p) => p.id))
  const top = expectedRanked(input).find((r) => ids.has(r.match.pathId))
  if (top) {
    return {
      kind: 'fresh',
      videoId: top.item.videoId,
      pathId: top.match.pathId,
      skillId: top.match.skillId,
      badge: response.nowMs - top.item.publishedMs < DAY_MS ? 'today' : 'week',
    }
  }
  for (const path of withCurrent) {
    const pool = response.pools.find((p) => p.pathId === path.id && p.skillId === path.currentSkillId)
    const card = pool?.videos.find((v) => !isMuted(mutes, v.channelId))
    if (card) return { kind: 'pool', videoId: card.videoId, pathId: path.id, skillId: path.currentSkillId!, badge: 'best' }
  }
  return null
}

function checkHero(input: FreshViewInput, chip: FilterChip): void {
  const view = buildFreshView({ ...input, chip })
  const ordered = expectedPathOrder(input.response.paths)
  const scope = chip.kind === 'path' ? ordered.filter((p) => p.id === chip.pathId) : ordered
  const expected = expectedHero(input, scope)
  if (expected === null) {
    expect(view.hero).toBeNull()
    return
  }
  const hero = view.hero
  expect(hero).not.toBeNull()
  if (!hero) return
  expect({
    kind: hero.kind,
    videoId: hero.card.videoId,
    pathId: hero.match.pathId,
    skillId: hero.match.skillId,
    badge: hero.badge,
  }).toEqual(expected)

  // The tag: the path's avatar letter, hobby and color, the Skill, and "your current skill".
  const path = input.response.paths.find((p) => p.id === expected.pathId)!
  expect(hero.path).toEqual({
    pathId: path.id,
    hobby: path.hobby,
    letter: [...path.hobby.trim()][0]!.toLocaleUpperCase(),
    colorSlot: path.colorSlot,
  })
  expect(hero.skillTitle).toBe(path.skills.find((s) => s.id === expected.skillId)?.title)
  expect(hero.isCurrentSkill).toBe(expected.skillId === path.currentSkillId)
  if (hero.kind === 'pool') expect(hero.isCurrentSkill).toBe(true)

  // Its video shows in no Hobby_Section (Req 3.5), and it is not muted.
  expect(view.sections.some((s) => s.cards.some((c) => c.card.videoId === expected.videoId))).toBe(false)
  expect(isMuted(input.mutes, hero.card.channelId)).toBe(false)
}

describe('Feature: fresh-v2, Property 5: Hero choice', () => {
  it('picks the top Shown_Item in Scope, else the first Current_Skill pool video, else nothing', () => {
    fc.assert(
      fc.property(arbSectionInput({ maxItems: 12, maxPool: 4 }), (input) => {
        checkHero(input, { kind: 'all' })
        if (input.response.paths.length >= 2) {
          for (const p of input.response.paths) checkHero(input, { kind: 'path', pathId: p.id })
        }
        // Hidden under "Saved" (Req 3.6).
        expect(buildFreshView({ ...input, chip: { kind: 'saved' } }).hero).toBeNull()
      }),
      RUNS,
    )
  })

  it('walks on when the hero channel is muted, until no video is left, with no change to the response', () => {
    fc.assert(
      fc.property(arbSectionInput({ maxItems: 8, maxPool: 3 }), (input) => {
        const frozen = JSON.stringify(input.response)
        const mutes = new Map(input.mutes)
        const seen: string[] = []
        // Each step mutes the current hero's channel; the next hero follows the same rule.
        for (let step = 0; step < 12; step += 1) {
          const current: FreshViewInput = { ...input, mutes: new Map(mutes) }
          checkHero(current, { kind: 'all' })
          const hero = buildFreshView({ ...current, chip: { kind: 'all' } }).hero
          if (!hero || hero.card.channelId === null) break
          seen.push(hero.card.videoId)
          mutes.set(hero.card.channelId, true)
          const next = buildFreshView({ ...input, mutes: new Map(mutes), chip: { kind: 'all' } }).hero
          expect(next?.card.videoId).not.toBe(hero.card.videoId)
          if (next) expect(next.card.channelId).not.toBe(hero.card.channelId)
        }
        expect(new Set(seen).size).toBe(seen.length)
        expect(JSON.stringify(input.response)).toBe(frozen)
      }),
      RUNS,
    )
  })
})
