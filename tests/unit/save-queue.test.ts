import { describe, expect, it } from 'vitest'
import { createSaveQueue } from '../../app/utils/save-queue'
import type { SaveQueue } from '../../app/utils/save-queue'

interface WriteCall {
  value: string
  resolve: () => void
  reject: () => void
}

interface Harness {
  queue: SaveQueue<string>
  calls: WriteCall[]
  /** Values given to the writer so far. */
  sent: () => string[]
  events: string[]
}

/** A queue whose writes stay open until the test settles them. */
function harness(): Harness {
  const calls: WriteCall[] = []
  const events: string[] = []
  const queue = createSaveQueue<string>(
    value =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject: () => reject(new Error('write failed')) })
      }),
    { onSuccess: () => events.push('success'), onFailure: () => events.push('failure') },
  )
  return { queue, calls, sent: () => calls.map(call => call.value), events }
}

/** Lets the settled write's callbacks run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve()
}

describe('createSaveQueue', () => {
  it('writes at once when idle and one at a time, sending only the latest waiting value', async () => {
    const { queue, calls, sent, events } = harness()
    queue.push('a')
    queue.push('b')
    queue.push('c')
    expect(sent()).toEqual(['a'])

    calls[0]?.resolve()
    await settle()
    expect(sent()).toEqual(['a', 'c'])

    calls[1]?.resolve()
    await settle()
    expect(sent()).toEqual(['a', 'c'])
    expect(events).toEqual(['success', 'success'])
  })

  it('after a failure keeps the latest value and sends nothing (Req 6.4)', async () => {
    const { queue, calls, sent, events } = harness()
    queue.push('a')
    queue.push('b')
    queue.push('c')

    calls[0]?.reject()
    await settle()

    // No automatic retry and the waiting value is not sent either.
    expect(sent()).toEqual(['a'])
    expect(events).toEqual(['failure'])

    // `retry` sends the latest value, not the one that failed (Req 6.5).
    queue.retry()
    expect(sent()).toEqual(['a', 'c'])
    calls[1]?.resolve()
    await settle()
    expect(events).toEqual(['failure', 'success'])
  })

  it('retry sends the failed value itself when nothing newer was pushed', async () => {
    const { queue, calls, sent } = harness()
    queue.push('a')
    calls[0]?.reject()
    await settle()
    expect(sent()).toEqual(['a'])

    queue.retry()
    expect(sent()).toEqual(['a', 'a'])
  })

  it('a retry that fails reports the failure again and can be retried again', async () => {
    const { queue, calls, sent, events } = harness()
    queue.push('a')
    calls[0]?.reject()
    await settle()
    queue.retry()
    calls[1]?.reject()
    await settle()

    expect(events).toEqual(['failure', 'failure'])
    expect(sent()).toEqual(['a', 'a'])
    queue.retry()
    expect(sent()).toEqual(['a', 'a', 'a'])
  })

  it('a push after a failure writes the new value and drops the kept one', async () => {
    const { queue, calls, sent, events } = harness()
    queue.push('a')
    queue.push('b')
    calls[0]?.reject()
    await settle()

    queue.push('c')
    expect(sent()).toEqual(['a', 'c'])
    calls[1]?.resolve()
    await settle()
    expect(events).toEqual(['failure', 'success'])

    // Nothing is left to retry.
    queue.retry()
    await settle()
    expect(sent()).toEqual(['a', 'c'])
  })

  it('retry is a no-op without a failure and while a write is running', async () => {
    const { queue, calls, sent } = harness()
    queue.retry()
    expect(sent()).toEqual([])

    queue.push('a')
    queue.retry()
    expect(sent()).toEqual(['a'])

    calls[0]?.resolve()
    await settle()
    queue.retry()
    expect(sent()).toEqual(['a'])
  })

  it('a value pushed during a retry waits and is sent after it', async () => {
    const { queue, calls, sent } = harness()
    queue.push('a')
    calls[0]?.reject()
    await settle()
    queue.retry()
    queue.push('b')
    expect(sent()).toEqual(['a', 'a'])

    calls[1]?.resolve()
    await settle()
    expect(sent()).toEqual(['a', 'a', 'b'])
  })

  it('treats a writer that throws as a failed write', async () => {
    const events: string[] = []
    const sent: string[] = []
    let broken = true
    const queue = createSaveQueue<string>(
      (value) => {
        sent.push(value)
        if (broken) throw new Error('offline')
        return Promise.resolve()
      },
      { onSuccess: () => events.push('success'), onFailure: () => events.push('failure') },
    )

    queue.push('a')
    await settle()
    expect(events).toEqual(['failure'])

    broken = false
    queue.retry()
    await settle()
    expect(sent).toEqual(['a', 'a'])
    expect(events).toEqual(['failure', 'success'])
  })

  it('works without hooks', async () => {
    const sent: string[] = []
    const queue = createSaveQueue<string>((value) => {
      sent.push(value)
      return value === 'a' ? Promise.reject(new Error('no')) : Promise.resolve()
    })
    queue.push('a')
    await settle()
    queue.push('b')
    await settle()
    expect(sent).toEqual(['a', 'b'])
  })
})
