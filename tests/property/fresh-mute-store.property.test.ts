import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ChannelMute } from '../../shared/types/fresh'
import { readLocalMutes, writeLocalMutes } from '../../app/utils/channel-mutes-store'
import { memoryStorage } from '../support/fresh-client'

const arbMute: fc.Arbitrary<ChannelMute> = fc.record({
  channelId: fc.string({ minLength: 1, maxLength: 64 }),
  muted: fc.boolean(),
  changedAt: fc.oneof(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 2_000_000_000_000 })),
})

const arbUniqueMutes = fc.uniqueArray(arbMute, { selector: (m) => m.channelId, maxLength: 20 })

describe('fresh local mute store', () => {
  // Feature: fresh, Property 5: Local mute store round trip
  // **Validates: Requirements 2.5**
  it('reads back exactly the mutes it wrote', () => {
    fc.assert(
      fc.property(arbUniqueMutes, (mutes) => {
        const storage = memoryStorage()
        writeLocalMutes(storage, new Map(mutes.map((m) => [m.channelId, m])))
        const read = readLocalMutes(storage)
        expect(read).toEqual(new Map(mutes.map((m) => [m.channelId, m])))
      }),
      { numRuns: 200 },
    )
  })
})
