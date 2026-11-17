// Feature: fresh-v2, Property 3: New counts agree
// For any generated response and mutes:
// - each Hobby_Chip's `newCount` equals its section's `newCount` under "All hobbies" and under
//   that chip;
// - a section's `newCount` equals its `isNew` cards plus 1 when the hero is a New_Item of that
//   path;
// - `newToday.videos` equals the distinct ids among the hero (when new) and the shown `isNew`
//   cards;
// - `newToday.hobbies` equals the shown sections with `newCount > 0`;
// - `newToday` is null exactly when that count is 0 or the chip is "Saved";
// - no muted channel and no item published 86400 s or more before `nowMs` is counted.
// Validates: Requirements 1.4, 1.5, 2.4, 4.4, 12.3
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath } from '../../shared/types/fresh'
import { buildFreshView, type FreshView, type FreshViewInput } from '../../shared/utils/fresh-view'
import { DAY_MS, HOUR_MS, NOW_MS, arbSectionInput, isMuted, makeResponse } from '../support/fresh-arbitraries'

const RUNS = { numRuns: 150 }

/** The New_Items a view shows, per path: the hero (when "New today") and the `isNew` cards. */
function shownNew(view: FreshView): Map<string, string[]> {
  const byPath = new Map<string, string[]>()
  const add = (pathId: string, id: string): void => {
    byPath.set(pathId, [...(byPath.get(pathId) ?? []), id])
  }
  if (view.hero?.kind === 'fresh' && view.hero.badge === 'today') add(view.hero.path.pathId, view.hero.card.videoId)
  for (const section of view.sections) {
    for (const c of section.cards) if (c.kind === 'fresh' && c.isNew) add(section.pathId, c.card.videoId)
  }
  return byPath
}

function checkCounts(view: FreshView, input: FreshViewInput): void {
  const { nowMs } = input.response
  const byPath = shownNew(view)

  // A "new" card is under 24 h old and not muted; an older Fresh_Item is never marked new.
  if (view.hero?.kind === 'fresh') {
    expect(view.hero.badge === 'today').toBe(nowMs - view.hero.card.publishedMs < DAY_MS)
    expect(isMuted(input.mutes, view.hero.card.channelId)).toBe(false)
  }
  for (const section of view.sections) {
    for (const c of section.cards) {
      if (c.kind !== 'fresh') continue
      expect(c.isNew).toBe(nowMs - c.card.publishedMs < DAY_MS)
      expect(isMuted(input.mutes, c.card.channelId)).toBe(false)
    }
    // The badge is the number of new videos of this path that the page shows.
    expect(section.newCount, `newCount of ${section.pathId}`).toBe(byPath.get(section.pathId)?.length ?? 0)
  }

  const ids = new Set([...byPath.values()].flat())
  if (ids.size === 0) {
    expect(view.newToday).toBeNull()
  } else {
    expect(view.newToday).toEqual({
      videos: ids.size,
      hobbies: view.sections.filter((s) => s.newCount > 0).length,
    })
  }
}

describe('Feature: fresh-v2, Property 3: New counts agree', () => {
  it('gives the same count to the chip badge, the section badge and the header, under every chip', () => {
    fc.assert(
      fc.property(arbSectionInput({ maxPool: 8 }), (input) => {
        const all = buildFreshView({ ...input, chip: { kind: 'all' } })
        checkCounts(all, input)
        const allNew = shownNew(all)

        // Every Hobby_Chip badge is its section's badge under "All hobbies".
        for (const chip of all.chips) {
          if (chip.chip.kind !== 'path') continue
          const pathId = chip.chip.pathId
          const section = all.sections.find((s) => s.pathId === pathId)
          expect(chip.newCount).toBe(section?.newCount)

          // Under that chip: the same count, and the same new videos on the page.
          const narrowed = buildFreshView({ ...input, chip: chip.chip })
          expect(narrowed.chip).toEqual(chip.chip)
          expect(narrowed.sections).toHaveLength(1)
          expect(narrowed.sections[0]!.newCount).toBe(chip.newCount)
          expect(narrowed.chips.map((c) => c.newCount)).toEqual(all.chips.map((c) => c.newCount))
          checkCounts(narrowed, input)
          expect([...(shownNew(narrowed).get(pathId) ?? [])].sort()).toEqual([...(allNew.get(pathId) ?? [])].sort())
          // The header narrows to that hobby (Req 1.4).
          if (chip.newCount > 0) expect(narrowed.newToday).toEqual({ videos: chip.newCount, hobbies: 1 })
          else expect(narrowed.newToday).toBeNull()
        }

        // "Saved" shows no count at all (Req 1.5), and the chip badges stay.
        const saved = buildFreshView({ ...input, chip: { kind: 'saved' } })
        expect(saved.newToday).toBeNull()
        expect(saved.chips.map((c) => c.newCount)).toEqual(all.chips.map((c) => c.newCount))
      }),
      RUNS,
    )
  })

  it('keeps the count equal when a hobby has more new videos than its section holds (D-A)', () => {
    // "big" has 5 Skills and 13 to 40 new videos, so the 12-card and 3-per-Skill caps both
    // bind. "top" owns the best video, so under "All hobbies" the hero belongs to "top" and
    // "big" shows only its section; under the "big" chip its own hero is added on top.
    const skills = (id: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${id}-s${i}`, title: `${id} skill ${i}`, level: 'beginner' as const }))
    const path = (id: string, n: number, activeAt: number): FreshPath => ({
      id,
      hobbyId: null,
      hobby: id,
      goalClass: 'none',
      currentSkillId: `${id}-s0`,
      windowSkillIds: [`${id}-s0`, `${id}-s1`].slice(0, n),
      skills: skills(id, n),
      activeAt,
      colorSlot: 1,
      completedCount: 0,
    })
    const item = (videoId: string, pathId: string, skill: number, over: Partial<FreshItemCard>): FreshItemCard => ({
      kind: 'fresh',
      videoId,
      title: videoId,
      channel: 'c',
      channelId: null,
      thumbnailUrl: '',
      durationSeconds: 60,
      style: 'technique',
      poolLanguage: 'en',
      matches: [{ pathId, skillId: `${pathId}-s${skill}` }],
      why: 'why',
      publishedMs: NOW_MS - HOUR_MS,
      teachesThisSkill: 0.5,
      levelFit: 0.5,
      level: 'beginner',
      ...over,
    })
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ skill: fc.nat({ max: 4 }), ageHours: fc.integer({ min: 0, max: 47 }), factor: fc.constantFrom(0.3, 0.5, 0.8) }),
          { minLength: 13, maxLength: 40 },
        ),
        fc.boolean(),
        (rows, bigFirst) => {
          const paths = [path('big', 5, bigFirst ? NOW_MS : NOW_MS - DAY_MS), path('top', 2, NOW_MS - HOUR_MS)]
          const items = [
            item('best', 'top', 0, { teachesThisSkill: 1, levelFit: 1, publishedMs: NOW_MS }),
            ...rows.map((r, i) =>
              item(`big${String(i).padStart(2, '0')}`, 'big', r.skill, {
                teachesThisSkill: r.factor,
                publishedMs: NOW_MS - r.ageHours * HOUR_MS,
              }),
            ),
          ]
          const input: FreshViewInput = {
            response: makeResponse({ paths, items }),
            chip: { kind: 'all' },
            mutes: new Map(),
            events: [],
            demo: false,
          }
          const all = buildFreshView(input)
          expect(all.hero?.card.videoId).toBe('best')
          checkCounts(all, input)
          const big = buildFreshView({ ...input, chip: { kind: 'path', pathId: 'big' } })
          expect(big.hero?.path.pathId).toBe('big')
          checkCounts(big, input)
          const badge = all.chips.find((c) => c.key === 'path:big')?.newCount
          expect(big.sections[0]!.newCount).toBe(badge)
          expect([...(shownNew(big).get('big') ?? [])].sort()).toEqual([...(shownNew(all).get('big') ?? [])].sort())
          expect(big.newToday?.videos ?? 0).toBe(badge)
        },
      ),
      RUNS,
    )
  })

  it('counts nothing from a muted channel: muting every channel of the new videos removes them', () => {
    fc.assert(
      fc.property(arbSectionInput({ maxPool: 4 }), (input) => {
        const all = buildFreshView({ ...input, chip: { kind: 'all' } })
        const channels = new Set<string>()
        if (all.hero?.kind === 'fresh' && all.hero.card.channelId !== null) channels.add(all.hero.card.channelId)
        for (const s of all.sections) {
          for (const c of s.cards) if (c.kind === 'fresh' && c.isNew && c.card.channelId !== null) channels.add(c.card.channelId)
        }
        const mutes = new Map(input.mutes)
        for (const id of channels) mutes.set(id, true)
        const muted = buildFreshView({ ...input, mutes, chip: { kind: 'all' } })
        checkCounts(muted, { ...input, mutes })
        for (const s of muted.sections) {
          for (const c of s.cards) expect(c.card.channelId === null || !channels.has(c.card.channelId)).toBe(true)
        }
      }),
      RUNS,
    )
  })
})
