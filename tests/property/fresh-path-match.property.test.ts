// Feature: fresh, Property 22: Path_Match and language fallback
// For any paths (random Skill titles and Levels), language and Fresh_Items of the user-language
// and en keys, composeFreshItems returns each video id at most once; an item matches a Skill iff
// the Normalized hobby and Normalized Skill title are equal, whatever the Levels; en items are
// included for a Skill iff the language is not en and the Skill has fewer than 3 user-language
// items; user-language items come first and keep the user copy of an id found in both; each
// item's poolLanguage is the kept copy's language and `matches` lists every matching Skill.
// Validates: Requirements 6.13, 8.1, 8.11, 8.12
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Level } from '../../shared/types/skill-tree'
import { normalizeText } from '../../shared/utils/video-normalize'
import type { FreshItemRow } from '../../server/utils/fresh/check-store'
import { composeFreshItems, type PathScope } from '../../server/utils/fresh/compose'
import { fakeFreshItem } from '../support/fresh-fakes'

const LEVELS: readonly Level[] = ['beginner', 'intermediate', 'advanced']
const HOBBY_TEXTS = ['Bouldering', 'bouldering!', ' Yoga ', 'yoga']
const TITLE_TEXTS = ['Footwork', 'footwork.', 'Grip  Strength', 'grip strength', 'Balance']
const ITEM_SKILLS = ['footwork', 'grip strength', 'balance', 'other']
const VIDEO_IDS = Array.from({ length: 8 }, (_v, i) => `vid${String(i).padStart(8, '0')}`)

const pathsArb: fc.Arbitrary<PathScope[]> = fc
  .array(
    fc.record({
      hobby: fc.constantFrom(...HOBBY_TEXTS),
      skills: fc.array(fc.record({ title: fc.constantFrom(...TITLE_TEXTS), level: fc.constantFrom(...LEVELS) }), {
        minLength: 1,
        maxLength: 4,
      }),
    }),
    { minLength: 1, maxLength: 3 },
  )
  .map((paths) =>
    paths.map((p, i) => ({
      pathId: `path-${i}`,
      hobby: p.hobby,
      skills: p.skills.map((s, j) => ({ id: `skill-${i}-${j}`, title: s.title, level: s.level })),
    })),
  )

function itemsArb(language: string): fc.Arbitrary<FreshItemRow[]> {
  const languages = language === 'en' ? ['en'] : [language, 'en']
  return fc
    .uniqueArray(
      fc.record({
        hobby: fc.constantFrom('bouldering', 'yoga'),
        language: fc.constantFrom(...languages),
        videoId: fc.constantFrom(...VIDEO_IDS),
        skillNorm: fc.constantFrom(...ITEM_SKILLS),
        level: fc.constantFrom(...LEVELS),
        title: fc.string({ maxLength: 6 }),
      }),
      // One row per (hobby, language, video id), like the primary key of fresh_items.
      { selector: (r) => `${r.hobby}|${r.language}|${r.videoId}`, maxLength: 24 },
    )
    .map((rows) =>
      rows.map((r) =>
        fakeFreshItem(r.videoId, {
          hobby: r.hobby,
          language: r.language,
          skillNorm: r.skillNorm,
          level: r.level,
          video: { ...fakeFreshItem(r.videoId).video, title: r.title },
        }),
      ),
    )
}

interface SkillRef {
  pathId: string
  skillId: string
  hobby: string
  title: string
}

describe('Property 22: Path_Match and language fallback', () => {
  it('matches by Normalized hobby and title only, with the per-Skill en fallback and one copy per id', () => {
    fc.assert(
      fc.property(
        pathsArb,
        fc.constantFrom('en', 'de').chain((l) => fc.tuple(fc.constant(l), itemsArb(l))),
        (paths, [language, items]) => {
          const cards = composeFreshItems({ language, paths, items })

          const skills: SkillRef[] = paths.flatMap((p) =>
            p.skills.map((s) => ({ pathId: p.pathId, skillId: s.id, hobby: normalizeText(p.hobby), title: normalizeText(s.title) })),
          )
          const matches = (row: FreshItemRow, s: SkillRef): boolean => row.hobby === s.hobby && row.skillNorm === s.title
          const userRows = items.filter((r) => r.language === language)
          const enRows = language === 'en' ? [] : items.filter((r) => r.language === 'en')
          const userIdsOf = (s: SkillRef): Set<string> => new Set(userRows.filter((r) => matches(r, s)).map((r) => r.videoId))
          const enIncluded = (s: SkillRef): boolean => language !== 'en' && userIdsOf(s).size < 3

          // Expected kept copy and matches per id.
          const expected = new Map<string, { language: string; matches: Set<string> }>()
          for (const s of skills) {
            for (const r of userRows) {
              if (!matches(r, s)) continue
              const e = expected.get(r.videoId) ?? { language, matches: new Set<string>() }
              e.matches.add(`${s.pathId}/${s.skillId}`)
              expected.set(r.videoId, e)
            }
          }
          for (const s of skills) {
            if (!enIncluded(s)) continue
            const own = userIdsOf(s)
            for (const r of enRows) {
              if (!matches(r, s) || own.has(r.videoId)) continue
              const e = expected.get(r.videoId)
              if (e && e.language !== 'en') continue // the user copy wins
              const next = e ?? { language: 'en', matches: new Set<string>() }
              next.matches.add(`${s.pathId}/${s.skillId}`)
              expected.set(r.videoId, next)
            }
          }

          // Each id once.
          const ids = cards.map((c) => c.videoId)
          expect(new Set(ids).size).toBe(ids.length)
          expect(new Set(ids)).toEqual(new Set(expected.keys()))
          for (const card of cards) {
            const e = expected.get(card.videoId)!
            expect(card.poolLanguage).toBe(e.language)
            expect(new Set(card.matches.map((m) => `${m.pathId}/${m.skillId}`))).toEqual(e.matches)
            expect(card.matches.length).toBe(e.matches.size)
            // The card's data comes from a stored copy in its language.
            const copies = items.filter((r) => r.videoId === card.videoId && r.language === card.poolLanguage)
            expect(copies.map((r) => r.video.title)).toContain(card.title)
          }
          // User-language items first.
          const firstEn = cards.findIndex((c) => c.poolLanguage === 'en')
          if (language !== 'en' && firstEn >= 0) {
            expect(cards.slice(firstEn).every((c) => c.poolLanguage === 'en')).toBe(true)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
