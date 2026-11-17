// Feature: fresh-v2, Property 4: Section composition
// For any 1 to 5 paths (some with no Current_Skill), 0 to 50 Fresh_Items, 0 to 30 pool videos
// per Skill and random mutes, under "All hobbies" and every Hobby_Chip:
// - every section holds at most 12 cards;
// - no video id appears twice on the page, the hero included;
// - no Skill has more than 3 cards across the hero and the sections;
// - no card or hero has a muted channel;
// - the Fresh_Items of a section keep their rank order;
// - before the variety step every Fresh_Item comes ahead of every pool card;
// - every Variety_Window before the first card placed at the end holds at most 2 cards of one
//   channel;
// - a path with no Current_Skill has state `finished` and no cards, and none of its
//   Fresh_Items appear anywhere.
// Validates: Requirements 3.5, 4.8, 5.1, 5.5, 5.6, 12.5
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  MAX_PER_SKILL,
  SECTION_MAX,
  VARIETY_MAX_PER_CHANNEL,
  VARIETY_WINDOW,
  arrangeVariety,
} from '../../shared/utils/fresh-rank'
import { buildFreshViewDetails, type FilterChip, type FreshViewInput } from '../../shared/utils/fresh-view'
import { arbSectionInput, expectedRanked, isMuted } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 120 }

function checkComposition(input: FreshViewInput, chip: FilterChip): void {
  const { view, builds } = buildFreshViewDetails({ ...input, chip })
  const { response, mutes } = input
  const pathById = new Map(response.paths.map((p) => [p.id, p]))
  const rankOf = new Map(expectedRanked(input).map((r, index) => [r.item.videoId, { index, pathId: r.match.pathId }]))

  expect(builds.map((b) => b.section)).toEqual(view.sections)

  const ids: string[] = view.hero ? [view.hero.card.videoId] : []
  const perSkill = new Map<string, number>()
  const count = (pathId: string, skillId: string): void => {
    const key = JSON.stringify([pathId, skillId])
    perSkill.set(key, (perSkill.get(key) ?? 0) + 1)
  }
  if (view.hero) {
    count(view.hero.match.pathId, view.hero.match.skillId)
    expect(isMuted(mutes, view.hero.card.channelId)).toBe(false)
    // The hero never belongs to a finished path.
    expect(pathById.get(view.hero.match.pathId)?.currentSkillId).not.toBeNull()
  }

  for (const build of builds) {
    const { section, beforeVariety, tailStart } = build
    const path = pathById.get(section.pathId)!

    // At most 12 cards; a finished path has none.
    expect(section.cards.length).toBeLessThanOrEqual(SECTION_MAX)
    if (path.currentSkillId === null) {
      expect(section.state).toBe('finished')
      expect(section.cards).toEqual([])
    } else {
      expect(section.state).toBe(section.cards.length === 0 ? 'empty' : 'cards')
    }

    for (const card of section.cards) {
      ids.push(card.card.videoId)
      count(card.match.pathId, card.match.skillId)
      expect(isMuted(mutes, card.card.channelId)).toBe(false)
      // Every card belongs to its section's path and to one of its Skills.
      expect(card.match.pathId).toBe(section.pathId)
      expect(path.skills.some((s) => s.id === card.match.skillId)).toBe(true)
      // A pool card comes from the Current_Window only.
      if (card.kind === 'pool') expect(path.windowSkillIds).toContain(card.match.skillId)
    }

    // Before the variety rule: Fresh_Items in rank order, all ahead of every pool card.
    const kinds = beforeVariety.map((c) => c.kind)
    const firstPool = kinds.indexOf('pool')
    if (firstPool !== -1) expect(kinds.slice(firstPool).every((k) => k === 'pool')).toBe(true)
    const ranks = beforeVariety.filter((c) => c.kind === 'fresh').map((c) => rankOf.get(c.card.videoId))
    for (const rank of ranks) {
      expect(rank).toBeDefined()
      expect(rank!.pathId).toBe(section.pathId)
    }
    const indexes = ranks.map((r) => r!.index)
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b))
    // Pool cards keep the Current_Window order, Current_Skill first.
    const windowIndexes = beforeVariety
      .filter((c) => c.kind === 'pool')
      .map((c) => path.windowSkillIds.indexOf(c.match.skillId))
    expect(windowIndexes).toEqual([...windowIndexes].sort((a, b) => a - b))

    // The variety rule over the whole section (D-B): the same cards, rearranged.
    const arranged = arrangeVariety(beforeVariety, (c) => c.card.channelId)
    expect(section.cards).toEqual(arranged.cards)
    expect(tailStart).toBe(arranged.tailStart)
    for (let start = 0; start < tailStart; start += 1) {
      const window = section.cards.slice(start, Math.min(start + VARIETY_WINDOW, tailStart))
      const perChannel = new Map<string, number>()
      for (const c of window) {
        if (c.card.channelId === null) continue
        perChannel.set(c.card.channelId, (perChannel.get(c.card.channelId) ?? 0) + 1)
      }
      for (const n of perChannel.values()) expect(n).toBeLessThanOrEqual(VARIETY_MAX_PER_CHANNEL)
    }
  }

  // No video id twice on the page, the hero included.
  expect(new Set(ids).size).toBe(ids.length)
  // No Skill with more than 3 cards across the hero and all sections.
  for (const [key, n] of perSkill) expect(n, key).toBeLessThanOrEqual(MAX_PER_SKILL)

  // A Fresh_Item matched only to finished paths shows nowhere as a new video.
  const shownFresh = new Set<string>()
  if (view.hero?.kind === 'fresh') shownFresh.add(view.hero.card.videoId)
  for (const s of view.sections) for (const c of s.cards) if (c.kind === 'fresh') shownFresh.add(c.card.videoId)
  for (const item of response.items) {
    const onlyFinished = item.matches.every((m) => (pathById.get(m.pathId)?.currentSkillId ?? null) === null)
    if (onlyFinished) expect(shownFresh.has(item.videoId)).toBe(false)
  }
  // A shown Fresh_Item is always a Shown_Item: in scope, not muted, under 7 days old.
  for (const id of shownFresh) expect(rankOf.has(id)).toBe(true)

  // Nothing is dropped without a reason: with room left in a section, each Shown_Item of its
  // path is the hero, a card, or its Skill already holds 3 cards.
  if (chip.kind === 'all') {
    for (const section of view.sections) {
      if (section.cards.length >= SECTION_MAX || section.state === 'finished') continue
      for (const r of expectedRanked(input)) {
        if (r.match.pathId !== section.pathId || shownFresh.has(r.item.videoId)) continue
        expect(perSkill.get(JSON.stringify([r.match.pathId, r.match.skillId]))).toBe(MAX_PER_SKILL)
      }
    }
  }
}

describe('Feature: fresh-v2, Property 4: Section composition', () => {
  it('keeps the caps, the order and one card per video under "All hobbies" and every Hobby_Chip', () => {
    fc.assert(
      fc.property(arbSectionInput({ minPaths: 1, maxPaths: 5, maxItems: 50, maxPool: 30 }), (input) => {
        checkComposition(input, { kind: 'all' })
        if (input.response.paths.length >= 2) {
          for (const p of input.response.paths) checkComposition(input, { kind: 'path', pathId: p.id })
        }
      }),
      RUNS,
    )
  })
})
