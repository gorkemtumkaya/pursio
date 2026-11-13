import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaveQueue } from '../../app/utils/save-queue'

const RUNS = { numRuns: 200 }

interface PushStep {
  /** Time that passes before this push. */
  gap: number
  /** How long the write of this value takes, if it is written. */
  writeMs: number
}

const arbDelay: fc.Arbitrary<number> = fc.oneof(
  { weight: 2, arbitrary: fc.constant(0) },
  { weight: 5, arbitrary: fc.integer({ min: 1, max: 50 }) },
  { weight: 2, arbitrary: fc.integer({ min: 50, max: 500 }) },
)

const arbSteps: fc.Arbitrary<PushStep[]> = fc.array(fc.record({ gap: arbDelay, writeMs: arbDelay }), {
  minLength: 1,
  maxLength: 25,
})

interface WriteRecord {
  value: number
  /** Number of pushes made when this write started. */
  pushedAtStart: number
}

// Feature: accounts-cloud-save, Property 7: Save_Queue writes one at a time and ends on the last value
// **Validates: Requirements 6.3**
describe('Property 7: Save_Queue writes one at a time and ends on the last value', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('never overlaps writes, keeps push order, lets only the latest value wait and ends on the last push', async () => {
    await fc.assert(
      fc.asyncProperty(arbSteps, async (steps) => {
        let running = 0
        let maxRunning = 0
        let finished = 0
        let pushed = 0
        let successes = 0
        let failures = 0
        const writes: WriteRecord[] = []

        // Values are the push indexes, so every pushed value is distinct.
        const queue = createSaveQueue<number>(
          (value) => {
            running += 1
            maxRunning = Math.max(maxRunning, running)
            writes.push({ value, pushedAtStart: pushed })
            return new Promise<void>((resolve) => {
              setTimeout(() => {
                running -= 1
                finished += 1
                resolve()
              }, steps[value]?.writeMs ?? 0)
            })
          },
          {
            onSuccess: () => {
              successes += 1
            },
            onFailure: () => {
              failures += 1
            },
          },
        )

        for (const [index, step] of steps.entries()) {
          await vi.advanceTimersByTimeAsync(step.gap)
          pushed = index + 1
          queue.push(index)
        }
        // Each pass ends at least the running write; a queue holds at most one more.
        for (let pass = 0; pass <= steps.length; pass += 1) await vi.runAllTimersAsync()

        // No two writes overlap, and every started write finished.
        expect(maxRunning).toBe(1)
        expect(running).toBe(0)
        expect(finished).toBe(writes.length)
        expect(successes).toBe(writes.length)
        expect(failures).toBe(0)

        // Written values appear in the order they were pushed, each at most once.
        const values = writes.map(write => write.value)
        expect(values).toEqual([...new Set(values)].sort((a, b) => a - b))
        expect(values[0]).toBe(0)

        // At most one value waits: a write always sends the latest value pushed
        // before it starts, so every older waiting value was replaced.
        for (const write of writes) expect(write.value).toBe(write.pushedAtStart - 1)

        // The last value written is the last value pushed.
        expect(values.at(-1)).toBe(steps.length - 1)
        // No timer is left, so nothing more will be written.
        expect(vi.getTimerCount()).toBe(0)
      }),
      RUNS,
    )
  })
})
