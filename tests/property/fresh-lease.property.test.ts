import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CheckKey } from '../../shared/types/fresh'
import { FRESH_LEASE_S, type FreshItemInsert } from '../../server/utils/fresh/check-store'
import { CALL_DEADLINE_MS } from '../../server/utils/fresh/schedule'
import { createFreshStores, fakeFreshItem } from '../support/fresh-fakes'
import { CHECK_KEY, DAY_MS, SECOND_MS, chan, sourceRow, vid } from '../support/fresh-check-harness'

const OTHER_KEY: CheckKey = { hobby: 'bouldering', language: 'de' }

/** Lease ages in seconds, weighted around the 300 s timeout. */
const arbAgeS = fc.oneof(
  fc.constantFrom(0, 1, 299, 300, 301, 600),
  fc.integer({ min: 290, max: 310 }),
  fc.integer({ min: 0, max: 1_000 }),
)

function insert(n: number): FreshItemInsert {
  const { hobby: _h, language: _l, foundMs: _f, ...rest } = fakeFreshItem(vid(n))
  return rest
}

const arbIds = fc.uniqueArray(fc.integer({ min: 0, max: 20 }), { maxLength: 6 })

describe('Fresh Lease', () => {
  // Feature: fresh, Property 10: One Fresh_Check per Check_Key with Lease expiry
  // **Validates: Requirements 3.9, 7.9**
  it('a second run takes the Lease only at 300 s or more, and an expired run stores nothing', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbAgeS,
        fc.integer({ min: 0, max: 999 }),
        fc.boolean(),
        arbIds,
        arbIds,
        fc.boolean(),
        async (ageS, extraMs, bStores, aIds, bIds, otherKeyHeld) => {
          const { clock, fresh } = createFreshStores()
          fresh.setSources(CHECK_KEY, [sourceRow(chan(1), clock.now() - DAY_MS), sourceRow(chan(2), null)])
          fresh.putItem(fakeFreshItem(vid(99), { foundMs: clock.now() - DAY_MS }))
          // A Lease on another Check_Key never blocks this one.
          if (otherKeyHeld) expect(await fresh.takeLease(OTHER_KEY, 'run-other')).not.toBeNull()

          const startA = await fresh.takeLease(CHECK_KEY, 'run-A')
          expect(startA).toBe(clock.now())
          // A second run while A holds a fresh Lease is refused and records no attempt.
          expect(await fresh.takeLease(CHECK_KEY, 'run-early')).toBeNull()

          clock.advance(ageS * SECOND_MS + extraMs)
          const attemptBefore = fresh.checkStateOf(CHECK_KEY).lastAttemptMs
          const startB = await fresh.takeLease(CHECK_KEY, 'run-B')

          // B can take the Lease if and only if it is at least 300 s old (Req 3.9).
          expect(startB !== null).toBe(ageS >= FRESH_LEASE_S)
          if (startB === null) {
            expect(fresh.checkStateOf(CHECK_KEY).lastAttemptMs).toBe(attemptBefore)
            expect(fresh.leaseOf(CHECK_KEY)?.runId).toBe('run-A')
            return
          }
          expect(fresh.leaseOf(CHECK_KEY)).toEqual({ runId: 'run-B', takenAt: startB })
          expect(fresh.checkStateOf(CHECK_KEY).lastAttemptMs).toBe(startB)

          if (bStores) {
            clock.advance(extraMs)
            const out = await fresh.storeCheck({
              key: CHECK_KEY,
              runId: 'run-B',
              startedMs: startB,
              deadlineMs: startB + CALL_DEADLINE_MS,
              items: bIds.map(insert),
              checkedChannelIds: [chan(1)],
            })
            expect(out).toBe('stored')
          }

          const itemsBefore = fresh.storedItems()
          const sourcesBefore = await fresh.sources(CHECK_KEY)
          const stateBefore = fresh.checkStateOf(CHECK_KEY)
          const leaseBefore = fresh.leaseOf(CHECK_KEY)

          // A's store after its Lease expired and B took it (Req 7.9).
          const outA = await fresh.storeCheck({
            key: CHECK_KEY,
            runId: 'run-A',
            startedMs: startA ?? 0,
            deadlineMs: clock.now() + CALL_DEADLINE_MS,
            items: aIds.map((n) => insert(n + 30)),
            checkedChannelIds: [chan(1), chan(2)],
          })
          expect(outA).toBe('lease_lost')
          expect(fresh.storedItems()).toEqual(itemsBefore)
          expect(await fresh.sources(CHECK_KEY)).toEqual(sourcesBefore)
          expect(fresh.checkStateOf(CHECK_KEY)).toEqual(stateBefore)
          expect(fresh.leaseOf(CHECK_KEY)).toEqual(leaseBefore)
          // A's release never frees B's Lease.
          await fresh.releaseLease(CHECK_KEY, 'run-A')
          expect(fresh.leaseOf(CHECK_KEY)).toEqual(leaseBefore)
        },
      ),
      { numRuns: 200 },
    )
  })

  // Feature: fresh, Property 10: One Fresh_Check per Check_Key with Lease expiry
  // **Validates: Requirements 3.9, 7.9**
  it('a run whose Lease is 300 s old stores nothing even when no other run took it', async () => {
    await fc.assert(
      fc.asyncProperty(arbAgeS, arbIds, async (ageS, ids) => {
        const { clock, fresh } = createFreshStores()
        fresh.setSources(CHECK_KEY, [sourceRow(chan(1), null)])
        const start = await fresh.takeLease(CHECK_KEY, 'run-A')
        clock.advance(ageS * SECOND_MS)
        const out = await fresh.storeCheck({
          key: CHECK_KEY,
          runId: 'run-A',
          startedMs: start ?? 0,
          deadlineMs: clock.now() + CALL_DEADLINE_MS,
          items: ids.map(insert),
          checkedChannelIds: [chan(1)],
        })
        expect(out).toBe(ageS >= FRESH_LEASE_S ? 'lease_lost' : 'stored')
        if (out === 'lease_lost') {
          expect(fresh.storedItems()).toEqual([])
          expect((await fresh.sources(CHECK_KEY))[0]?.lastCheckedMs).toBeNull()
          expect(fresh.checkStateOf(CHECK_KEY).lastSuccessMs).toBeNull()
        } else {
          expect(fresh.storedItems().map((i) => i.videoId)).toEqual(ids.map(vid).sort())
          expect(fresh.leaseOf(CHECK_KEY)).toBeNull()
        }
      }),
      { numRuns: 200 },
    )
  })
})
