import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ChannelMute } from '../../shared/types/fresh'
import { mergeMute, mergeMuteLists } from '../../shared/utils/channel-mutes'
import { compareCodePoints } from '../../shared/utils/fresh-keys'

const RUNS = { numRuns: 300 }

// Few small times so equal changedAt values occur often, mixed with wide ones.
const arbTime = fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2_000_000_000_000 }))
const arbChannelId = fc.string({ minLength: 1, maxLength: 64 })

function arbMute(channelId: fc.Arbitrary<string> = arbChannelId): fc.Arbitrary<ChannelMute> {
  return fc.record({ channelId, muted: fc.boolean(), changedAt: arbTime })
}

/** Three records of one channel id. */
const arbSameChannel = arbChannelId.chain(id =>
  fc.tuple(arbMute(fc.constant(id)), arbMute(fc.constant(id)), arbMute(fc.constant(id))),
)

// A small pool of ids (including a code point order edge) so lists share channels.
const arbPoolId = fc.constantFrom('UCa', 'UCb', 'UCB', 'Z', 'é', '\u{1F600}', 'UCa-long-channel-id')
const arbList = fc.array(arbMute(fc.oneof(arbPoolId, arbChannelId)), { maxLength: 12 })

describe('fresh channel mutes', () => {
  // Feature: fresh, Property 3: Channel_Mute merge
  // **Validates: Requirements 2.3, 2.6, 2.8**
  it('mergeMute is commutative, associative, idempotent and keeps the later change', () => {
    fc.assert(
      fc.property(arbSameChannel, ([a, b, c]) => {
        const ab = mergeMute(a, b)
        expect(ab).toEqual(mergeMute(b, a))
        expect(mergeMute(mergeMute(a, b), c)).toEqual(mergeMute(a, mergeMute(b, c)))
        expect(mergeMute(a, a)).toEqual(a)

        expect(ab.channelId).toBe(a.channelId)
        if (a.changedAt !== b.changedAt) {
          const later = a.changedAt > b.changedAt ? a : b
          expect(ab).toEqual(later)
        } else {
          expect(ab).toEqual({ channelId: a.channelId, muted: a.muted || b.muted, changedAt: a.changedAt })
        }
      }),
      RUNS,
    )
  })

  // Feature: fresh, Property 3: Channel_Mute merge
  // **Validates: Requirements 2.3, 2.6, 2.8**
  it('mergeMuteLists holds one merged record per channel id present in either list', () => {
    fc.assert(
      fc.property(arbList, arbList, (a, b) => {
        const merged = mergeMuteLists(a, b)
        const all = [...a, ...b]
        const ids = new Set(all.map(r => r.channelId))

        // Exactly one record per channel id, no extra ids, sorted by code point order.
        expect(merged.map(r => r.channelId)).toEqual([...ids].sort(compareCodePoints))

        for (const rec of merged) {
          const group = all.filter(r => r.channelId === rec.channelId)
          const expected = group.reduce((acc, r) => mergeMute(acc, r))
          expect(rec).toEqual(expected)
        }

        // Input order does not matter.
        expect(mergeMuteLists(b, a)).toEqual(merged)
        expect(mergeMuteLists([...all].reverse(), [])).toEqual(merged)
      }),
      RUNS,
    )
  })
})
