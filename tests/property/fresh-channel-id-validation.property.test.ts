import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { ChannelMute } from '../../shared/types/fresh'
import { isValidChannelId } from '../../shared/utils/channel-mutes'
import { CHANNEL_MUTES_KEY, readLocalMutes } from '../../app/utils/channel-mutes-store'
import { createMuteController } from '../../app/composables/useChannelMutes'
import { memoryStorage } from '../support/fresh-client'

// Ids of length 0 to 70, so both bounds and both sides of them occur.
const arbId = fc.oneof(
  fc.string({ minLength: 0, maxLength: 70 }),
  fc.constantFrom('', 'a', 'x'.repeat(64), 'x'.repeat(65), 'UCa', 'UCb'),
)
const arbWrites = fc.array(fc.record({ channelId: arbId, muted: fc.boolean() }), { maxLength: 25 })

describe('fresh channel id validation', () => {
  // Feature: fresh, Property 4: Channel id validation
  // **Validates: Requirements 2.10**
  it('accepts exactly the ids of 1 to 64 characters', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 70 }), (id) => {
        expect(isValidChannelId(id)).toBe(id.length >= 1 && id.length <= 64)
      }),
      { numRuns: 200 },
    )
  })

  // Feature: fresh, Property 4: Channel id validation
  // **Validates: Requirements 2.10**
  it('stores the result of the valid writes only', () => {
    fc.assert(
      fc.property(arbWrites, (writes) => {
        const storage = memoryStorage()
        let clock = 1000
        const controller = createMuteController({ storage: () => storage, now: () => ++clock, sender: () => null })
        const accepted: boolean[] = writes.map((w) => controller.setMuted(w.channelId, w.muted))

        const expected = new Map<string, ChannelMute>()
        let modelClock = 1000
        writes.forEach((w, i) => {
          if (!isValidChannelId(w.channelId)) {
            expect(accepted[i]).toBe(false)
            return
          }
          expect(accepted[i]).toBe(true)
          expected.set(w.channelId, { channelId: w.channelId, muted: w.muted, changedAt: ++modelClock })
        })
        expect(readLocalMutes(storage)).toEqual(expected)
        if (expected.size === 0) expect(storage.data.has(CHANNEL_MUTES_KEY)).toBe(false)
        expect(controller.muted.value).toEqual(new Map([...expected].map(([id, m]) => [id, m.muted])))
      }),
      { numRuns: 200 },
    )
  })
})
