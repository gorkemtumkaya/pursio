import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FreshItemCard, FreshPath, SkillMatch } from '../../shared/types/fresh'
import type { GoalClass, VideoStyle } from '../../shared/types/video'
import {
  bestMatch,
  closenessFactor,
  freshScore,
  FRESH_WINDOW_S,
  recencyFactor,
} from '../../shared/utils/fresh-rank'
import { goalAdjustment } from '../../shared/utils/video-ranking'

const RUNS = { numRuns: 300 }
const TEN_YEARS_MS = 10 * 365 * 86400 * 1000

const arbGoal: fc.Arbitrary<GoalClass> = fc.constantFrom('targeted', 'casual', 'none')
const arbStyle: fc.Arbitrary<VideoStyle> = fc.constantFrom('drill', 'technique', 'explainer', 'approachable')

/**
 * One path. Skill ids reuse a small pool (`s0`..`s5`) across paths, so the same Skill id
 * can sit on several paths and closeness must come from the match's own path.
 * The window is the Current_Skill first, then some later-or-earlier Skills in path order;
 * a path with no Current_Skill has an empty window.
 */
function arbPath(id: string): fc.Arbitrary<FreshPath> {
  return fc
    .shuffledSubarray(['s0', 's1', 's2', 's3', 's4', 's5'], { minLength: 1 })
    .chain(skillIds =>
      fc.record({
        current: fc.option(fc.integer({ min: 0, max: skillIds.length - 1 }), { nil: null }),
        inWindow: fc.array(fc.boolean(), { minLength: skillIds.length, maxLength: skillIds.length }),
        goalClass: arbGoal,
      }).map(({ current, inWindow, goalClass }): FreshPath => {
        const currentSkillId = current === null ? null : skillIds[current]!
        const windowSkillIds = currentSkillId === null
          ? []
          : [currentSkillId, ...skillIds.filter((s, i) => s !== currentSkillId && inWindow[i])]
        return {
          id,
          hobbyId: null,
          hobby: `hobby-${id}`,
          goalClass,
          currentSkillId,
          windowSkillIds,
          skills: skillIds.map(s => ({ id: s, title: s, level: 'beginner' })),
          activeAt: null,
        }
      }),
    )
}

/** 1 to 3 paths in response order. */
const arbPaths: fc.Arbitrary<FreshPath[]> = fc
  .integer({ min: 1, max: 3 })
  .chain(n => fc.tuple(...Array.from({ length: n }, (_, i) => arbPath(`p${i}`))))

/** Paths, a Selected_Path and matches (mostly valid, some pointing at unknown paths or Skills). */
const arbScene = arbPaths.chain(paths =>
  fc.record({
    paths: fc.constant(paths),
    selectedPathId: fc.constantFrom(...paths.map(p => p.id)),
    matches: fc.array(
      fc.oneof(
        { weight: 6, arbitrary: fc.record({
          pathId: fc.constantFrom(...paths.map(p => p.id)),
          skillId: fc.constantFrom('s0', 's1', 's2', 's3', 's4', 's5'),
        }) },
        { weight: 1, arbitrary: fc.record({ pathId: fc.constant('missing'), skillId: fc.constant('s0') }) },
      ),
      { maxLength: 8 },
    ),
  }),
)

/** Independent oracle of Req 9.3. */
function expectedCloseness(match: SkillMatch, path: FreshPath): number {
  if (path.currentSkillId === null) return 0.6
  if (match.skillId === path.currentSkillId) return 1.0
  if (path.windowSkillIds.includes(match.skillId)) return 0.8
  return 0.6
}

function toMap(paths: readonly FreshPath[]): Map<string, FreshPath> {
  return new Map(paths.map(p => [p.id, p]))
}

const arbItem: fc.Arbitrary<FreshItemCard> = fc.record({
  kind: fc.constant('fresh' as const),
  videoId: fc.string({ minLength: 11, maxLength: 11 }),
  title: fc.string(),
  channel: fc.string(),
  channelId: fc.option(fc.string({ minLength: 1 }), { nil: null }),
  thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
  durationSeconds: fc.integer({ min: 0, max: 7200 }),
  style: arbStyle,
  poolLanguage: fc.constant('en'),
  matches: fc.constant([]),
  why: fc.string(),
  publishedMs: fc.integer({ min: 0, max: 2_000_000_000_000 }),
  teachesThisSkill: fc.double({ min: 0, max: 1, noNaN: true }),
  levelFit: fc.double({ min: 0, max: 1, noNaN: true }),
  level: fc.constantFrom('beginner', 'intermediate', 'advanced'),
})

describe('fresh score parts', () => {
  // Feature: fresh, Property 24: Fresh_Score parts
  // **Validates: Requirements 9.2**
  it('recencyFactor is 1 at age 0 and in the future, decreases strictly, and lies in (0.5, 1] under 7 days', () => {
    expect(recencyFactor(0)).toBe(1)
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: TEN_YEARS_MS }),
        fc.integer({ min: 0, max: TEN_YEARS_MS }),
        fc.integer({ min: 1, max: TEN_YEARS_MS }),
        (futureMs, ageMs, deltaMs) => {
          // A future published time counts as age 0.
          expect(recencyFactor(-futureMs / 1000)).toBe(1)
          // Strictly decreasing with age.
          const a = ageMs / 1000
          const b = (ageMs + deltaMs) / 1000
          expect(recencyFactor(a)).toBeGreaterThan(recencyFactor(b))
          // Matches 1 − 0.5 × age ÷ 604800.
          expect(recencyFactor(a)).toBeCloseTo(1 - 0.5 * (a / 604800), 12)
          if (a < FRESH_WINDOW_S) {
            expect(recencyFactor(a)).toBeGreaterThan(0.5)
            expect(recencyFactor(a)).toBeLessThanOrEqual(1)
          }
        },
      ),
      RUNS,
    )
  })

  // Feature: fresh, Property 24: Fresh_Score parts
  // **Validates: Requirements 9.3**
  it('closenessFactor scores each match against its own path: 1.0, 0.8 or 0.6', () => {
    fc.assert(
      fc.property(arbScene, ({ paths, matches }) => {
        const byId = toMap(paths)
        for (const match of matches) {
          const path = byId.get(match.pathId)
          if (!path || !path.skills.some(s => s.id === match.skillId)) continue
          const value = closenessFactor(match, path)
          expect([1.0, 0.8, 0.6]).toContain(value)
          expect(value).toBe(expectedCloseness(match, path))
          if (path.currentSkillId === null) expect(value).toBe(0.6)
        }
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 24: Fresh_Score parts
  // **Validates: Requirements 9.3, 9.4**
  it('bestMatch picks the highest closeness, then Selected_Path, earlier Skill, earlier path', () => {
    fc.assert(
      fc.property(arbScene, ({ paths, selectedPathId, matches }) => {
        const byId = toMap(paths)
        const pathIndex = new Map(paths.map((p, i) => [p.id, i]))
        const valid = matches
          .filter(m => byId.get(m.pathId)?.skills.some(s => s.id === m.skillId))
          .map(m => {
            const path = byId.get(m.pathId)!
            return {
              match: m,
              closeness: expectedCloseness(m, path),
              selected: m.pathId === selectedPathId,
              skillIndex: path.skills.findIndex(s => s.id === m.skillId),
              pathIndex: pathIndex.get(m.pathId)!,
            }
          })
        const result = bestMatch(matches, byId, selectedPathId)
        if (valid.length === 0) {
          expect(result).toBeNull()
          return
        }
        const top = Math.max(...valid.map(v => v.closeness))
        const expected = valid
          .filter(v => v.closeness === top)
          .sort((a, b) =>
            Number(b.selected) - Number(a.selected)
            || a.skillIndex - b.skillIndex
            || a.pathIndex - b.pathIndex,
          )[0]!
        expect(result).not.toBeNull()
        expect(result!.closeness).toBe(top)
        expect(result!.match).toEqual(expected.match)
        // The closeness value never depends on the Selected_Path.
        for (const other of paths) {
          expect(bestMatch(matches, byId, other.id)!.closeness).toBe(top)
        }
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 24: Fresh_Score parts
  // **Validates: Requirements 9.1, 9.2**
  it('freshScore equals recency × teaches × levelFit × closeness + goal adjustment + taste', () => {
    fc.assert(
      fc.property(
        arbItem,
        fc.integer({ min: -TEN_YEARS_MS, max: TEN_YEARS_MS }),
        fc.constantFrom(1.0, 0.8, 0.6),
        arbGoal,
        fc.constantFrom(-0.2, -0.1, 0, 0.1, 0.2),
        (item, offsetMs, closeness, goal, taste) => {
          const nowMs = item.publishedMs + offsetMs
          const age = Math.max(0, (nowMs - item.publishedMs) / 1000)
          const recency = 1 - 0.5 * (age / 604800)
          const expected = recency * item.teachesThisSkill * item.levelFit * closeness
            + goalAdjustment(item, goal)
            + taste
          expect(freshScore(item, { nowMs, closeness, goal, taste })).toBeCloseTo(expected, 12)
        },
      ),
      RUNS,
    )
  })
})
