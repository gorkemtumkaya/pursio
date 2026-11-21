import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FREE_HOBBY_LIMIT, countedHobbies, hobbyLimitBlocks, isRebuild, type LimitHobby } from '../../shared/utils/hobby-limit'
import { normalizeHobby } from '../../shared/utils/llm'

const RUNS = { numRuns: 300 }

/** A hobby name with free casing and spacing, so normalizing matters. */
const arbName: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom('chess', 'guitar', 'film photography', 'pottery', 'bouldering', 'sourdough baking', 'origami'), fc.boolean(), fc.boolean())
  .map(([name, upper, padded]) => {
    const cased = upper ? name.toUpperCase() : name
    return padded ? `  ${cased.replace(' ', '   ')} ` : cased
  })

const arbHobby: fc.Arbitrary<LimitHobby> = fc.record({
  name: arbName,
  typed: fc.option(arbName, { nil: undefined }),
  archived: fc.boolean(),
  demo: fc.option(fc.boolean(), { nil: undefined }),
}).map(({ name, typed, archived, demo }) => ({ hobbyId: normalizeHobby(name), hobby: typed, archived, demo }))

const arbHobbies = fc.array(arbHobby, { maxLength: 12 })

/** The count the limit must use, written without the code under test. */
function expectedCount(hobbies: readonly LimitHobby[]): number {
  let count = 0
  for (const hobby of hobbies) if (hobby.archived === false && hobby.demo !== true) count += 1
  return count
}

// Feature: hobby-limit. The free plan allows 3 active hobbies.
describe('hobby limit: what counts', () => {
  it('counts only hobbies that are neither archived nor the demo path', () => {
    fc.assert(
      fc.property(arbHobbies, (hobbies) => {
        expect(countedHobbies(hobbies)).toHaveLength(expectedCount(hobbies))
        // A new hobby is stopped exactly when the count has reached the limit.
        expect(hobbyLimitBlocks({ hobbies, requested: null, unlimited: false })).toBe(expectedCount(hobbies) >= FREE_HOBBY_LIMIT)
      }),
      RUNS,
    )
  })

  it('is not changed by any number of archived or demo hobbies', () => {
    fc.assert(
      fc.property(arbHobbies, fc.array(arbHobby, { maxLength: 8 }), fc.option(arbName, { nil: null }), (hobbies, extra, requested) => {
        const ignored = extra.map((hobby, index) => (index % 2 === 0 ? { ...hobby, archived: true } : { ...hobby, demo: true }))
        const before = hobbyLimitBlocks({ hobbies, requested, unlimited: false })
        expect(hobbyLimitBlocks({ hobbies: [...hobbies, ...ignored], requested, unlimited: false })).toBe(before)
      }),
      RUNS,
    )
  })

  it('frees a slot when a counted hobby is archived', () => {
    fc.assert(
      fc.property(fc.uniqueArray(arbName, { minLength: FREE_HOBBY_LIMIT, maxLength: FREE_HOBBY_LIMIT, selector: normalizeHobby }), fc.nat(), (names, pick) => {
        const hobbies: LimitHobby[] = names.map((name) => ({ hobbyId: normalizeHobby(name), archived: false }))
        expect(hobbyLimitBlocks({ hobbies, requested: null, unlimited: false })).toBe(true)
        const index = pick % hobbies.length
        const archived = hobbies.map((hobby, i) => (i === index ? { ...hobby, archived: true } : hobby))
        expect(hobbyLimitBlocks({ hobbies: archived, requested: null, unlimited: false })).toBe(false)
      }),
      RUNS,
    )
  })
})

describe('hobby limit: who is never blocked', () => {
  it('never blocks a founder or any other unlimited account', () => {
    fc.assert(
      fc.property(arbHobbies, fc.option(arbName, { nil: null }), (hobbies, requested) => {
        expect(hobbyLimitBlocks({ hobbies, requested, unlimited: true })).toBe(false)
      }),
      RUNS,
    )
  })

  it('never blocks a rebuild of a counted hobby, by its id or by the typed hobby, however it is written', () => {
    fc.assert(
      fc.property(arbHobbies, fc.nat(), fc.boolean(), fc.boolean(), (hobbies, pick, byTyped, shout) => {
        const counted = countedHobbies(hobbies)
        fc.pre(counted.length > 0)
        const target = counted[pick % counted.length] as LimitHobby
        const source = byTyped && target.hobby !== undefined ? target.hobby : target.hobbyId
        const requested = shout ? `  ${source.toUpperCase()}  ` : source
        expect(isRebuild(hobbies, requested)).toBe(true)
        expect(hobbyLimitBlocks({ hobbies, requested, unlimited: false })).toBe(false)
      }),
      RUNS,
    )
  })

  it('never blocks below the limit', () => {
    fc.assert(
      fc.property(arbHobbies, fc.option(arbName, { nil: null }), (hobbies, requested) => {
        fc.pre(expectedCount(hobbies) < FREE_HOBBY_LIMIT)
        expect(hobbyLimitBlocks({ hobbies, requested, unlimited: false })).toBe(false)
      }),
      RUNS,
    )
  })
})

describe('hobby limit: who is blocked', () => {
  it('blocks a hobby that is not counted yet once the limit is reached, also above it', () => {
    fc.assert(
      fc.property(arbHobbies, arbName, (hobbies, requested) => {
        fc.pre(expectedCount(hobbies) >= FREE_HOBBY_LIMIT)
        const wanted = normalizeHobby(requested)
        const matchesCounted = hobbies.some(
          (hobby) => !hobby.archived && hobby.demo !== true && (hobby.hobbyId === wanted || (hobby.hobby !== undefined && normalizeHobby(hobby.hobby) === wanted)),
        )
        expect(hobbyLimitBlocks({ hobbies, requested, unlimited: false })).toBe(!matchesCounted)
      }),
      RUNS,
    )
  })

  it('treats building an archived hobby again as a new hobby', () => {
    const active: LimitHobby[] = ['chess', 'guitar', 'pottery'].map((hobbyId) => ({ hobbyId, archived: false }))
    const hobbies = [...active, { hobbyId: 'origami', archived: true }]
    expect(hobbyLimitBlocks({ hobbies, requested: 'Origami', unlimited: false })).toBe(true)
    expect(hobbyLimitBlocks({ hobbies, requested: 'Chess', unlimited: false })).toBe(false)
  })
})
