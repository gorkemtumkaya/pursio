import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { PoolVideo, VideoStyle } from '../../shared/types/video'
import { compareCodePoints } from '../../shared/utils/fresh-keys'
import {
  QUALIFYING_MIN,
  SOURCES_PER_KEY,
  type ChannelSourceRow,
  refreshSources,
} from '../../server/utils/fresh/sources'

const RUNS = { numRuns: 300 }

// A small id space so channels repeat across pools and the 15-row cut is reached.
const CHANNEL_POOL = Array.from({ length: 20 }, (_, i) => `UC${String(i).padStart(2, '0')}`)
const ID_64 = 'C'.repeat(64)
const ID_65 = 'D'.repeat(65)
const arbKnownChannelId = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...CHANNEL_POOL) },
  { weight: 1, arbitrary: fc.constantFrom('UCb', 'UCB', 'é', '\u{1F600}', ID_64) },
  { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 64 }) },
)
// null, empty and over-64 ids are not known channel ids (Req 1.7, SQL char_length 1..64).
const arbChannelId: fc.Arbitrary<string | null> = fc.oneof(
  { weight: 8, arbitrary: arbKnownChannelId },
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 1, arbitrary: fc.constantFrom('', ID_65, 'E'.repeat(100)) },
)
// Scores around the 0.7 threshold, exactly 0.7 and 0.69 included.
const arbScore = fc.oneof(
  fc.constantFrom(0.69, 0.7, 0.71, 0, 0.5, 1),
  fc.double({ min: 0, max: 1, noNaN: true }),
)
const arbVideoId = fc.constantFrom(...Array.from({ length: 30 }, (_, i) => `vid${String(i).padStart(8, '0')}`))
const arbStyle: fc.Arbitrary<VideoStyle> = fc.constantFrom<VideoStyle>('drill', 'technique', 'explainer', 'approachable')

const arbVideo: fc.Arbitrary<PoolVideo> = fc.record({
  id: arbVideoId,
  title: fc.string({ maxLength: 8 }),
  channel: fc.string({ maxLength: 8 }),
  channelId: arbChannelId,
  thumbnailUrl: fc.constant('https://i.ytimg.com/vi/x/hqdefault.jpg'),
  durationSeconds: fc.integer({ min: 60, max: 3600 }),
  viewCount: fc.constant(null),
  likeCount: fc.constant(null),
  publishedAt: fc.constant(null),
  defaultAudioLanguage: fc.constant(null),
  hasCaptions: fc.constant(null),
  teachesThisSkill: arbScore,
  levelFit: fc.double({ min: 0, max: 1, noNaN: true }),
  style: arbStyle,
  matchedQuestText: fc.constant(null),
})
const arbPool = fc.array(arbVideo, { maxLength: 12 })

// Few small times so ties on latest qualifying time occur.
const arbTime = fc.oneof(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 2_000_000_000_000 }))
const arbRow: fc.Arbitrary<ChannelSourceRow> = fc.record({
  channelId: arbKnownChannelId,
  channelName: fc.string({ maxLength: 8 }),
  qualifyingCount: fc.integer({ min: 1, max: 20 }),
  latestQualifyingMs: arbTime,
  lastCheckedMs: fc.option(arbTime, { nil: null }),
})
const arbExisting = fc.uniqueArray(arbRow, { selector: r => r.channelId, maxLength: 18 })

function isKnownId(id: string | null): id is string {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64
}
function qualifies(v: PoolVideo): v is PoolVideo & { channelId: string } {
  return v.teachesThisSkill >= QUALIFYING_MIN && isKnownId(v.channelId)
}

/** The model of Property 1, written independently of `refreshSources`. */
function model(
  existing: readonly ChannelSourceRow[],
  storedPools: readonly (readonly PoolVideo[])[],
  newPool: readonly PoolVideo[],
  nowMs: number,
): ChannelSourceRow[] {
  const ids = new Map<string, Set<string>>()
  for (const v of [...storedPools, newPool].flat()) {
    if (!qualifies(v)) continue
    const set = ids.get(v.channelId) ?? new Set<string>()
    set.add(v.id)
    ids.set(v.channelId, set)
  }
  const firstName = new Map<string, string>()
  for (const v of newPool) if (qualifies(v) && !firstName.has(v.channelId)) firstName.set(v.channelId, v.channel)

  const prior = new Map(existing.map(r => [r.channelId, r]))
  const channels = new Set([...prior.keys(), ...firstName.keys()])
  const rows: ChannelSourceRow[] = []
  for (const channelId of channels) {
    const count = ids.get(channelId)?.size ?? 0
    if (count === 0) continue
    const old = prior.get(channelId)
    const name = firstName.get(channelId)
    rows.push(
      name !== undefined
        ? { channelId, channelName: name, qualifyingCount: count, latestQualifyingMs: nowMs, lastCheckedMs: old?.lastCheckedMs ?? null }
        : // count > 0 and not in the new pool, so the channel came from `existing`.
          { ...(old as ChannelSourceRow), qualifyingCount: count },
    )
  }
  rows.sort((a, b) => {
    if (a.qualifyingCount !== b.qualifyingCount) return a.qualifyingCount > b.qualifyingCount ? -1 : 1
    if (a.latestQualifyingMs !== b.latestQualifyingMs) return a.latestQualifyingMs > b.latestQualifyingMs ? -1 : 1
    return compareCodePoints(a.channelId, b.channelId)
  })
  return rows.slice(0, 15)
}

describe('fresh Channel_Source refresh', () => {
  // Feature: fresh, Property 1: Channel_Source refresh matches the model
  // **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8**
  it('refreshSources returns the first 15 rows of the model in ranking order', () => {
    fc.assert(
      fc.property(
        arbExisting,
        fc.array(arbPool, { maxLength: 4 }),
        arbPool,
        arbTime,
        fc.boolean(),
        (existing, otherPools, newPool, nowMs, newPoolAlsoStored) => {
          // The stored pools of the key at store time hold the new pool; passing it in
          // both places must not change the counts.
          const poolsOfKey = newPoolAlsoStored ? [...otherPools, newPool] : otherPools
          const existingCopy = structuredClone(existing)
          const result = refreshSources(existing, poolsOfKey, newPool, nowMs)

          expect(SOURCES_PER_KEY).toBe(15)
          expect(QUALIFYING_MIN).toBe(0.7)
          expect(result).toEqual(model(existing, otherPools, newPool, nowMs))
          // Inputs are not mutated.
          expect(existing).toEqual(existingCopy)
        },
      ),
      RUNS,
    )
  })
})
