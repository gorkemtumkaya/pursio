// Channel_Mute store on the Client (spec: fresh, task 13.4; Req 2.5 to 2.7, 19.15).
import { describe, expect, it } from 'vitest'
import type { ChannelMute } from '../../shared/types/fresh'
import { mergeMute } from '../../shared/utils/channel-mutes'
import { CHANNEL_MUTES_KEY, readLocalMutes, removeSentMutes } from '../../app/utils/channel-mutes-store'
import { createMuteController, MUTE_RETRY_MS, type MuteSender } from '../../app/composables/useChannelMutes'
import { memoryStorage } from '../support/fresh-client'

function timers() {
  const queue: { run: () => void; ms: number }[] = []
  return {
    queue,
    setTimer: (run: () => void, ms: number) => {
      const entry = { run, ms }
      queue.push(entry)
      return entry
    },
    clearTimer: (handle: unknown) => {
      const i = queue.indexOf(handle as { run: () => void; ms: number })
      if (i >= 0) queue.splice(i, 1)
    },
    fire() {
      const next = queue.shift()
      next?.run()
    },
  }
}

describe('mergeMute examples (Req 19.15)', () => {
  const a: ChannelMute = { channelId: 'UCa', muted: true, changedAt: 100 }
  const b: ChannelMute = { channelId: 'UCa', muted: false, changedAt: 200 }

  it('keeps the muted value of the later change', () => {
    expect(mergeMute(a, b)).toEqual(b)
    expect(mergeMute({ ...a, changedAt: 300 }, b)).toEqual({ ...a, changedAt: 300 })
  })

  it('gives the same record for a with b and b with a', () => {
    expect(mergeMute(a, b)).toEqual(mergeMute(b, a))
    const tieA = { ...a, changedAt: 200 }
    expect(mergeMute(tieA, b)).toEqual(mergeMute(b, tieA))
    expect(mergeMute(tieA, b).muted).toBe(true)
  })
})

describe('createMuteController', () => {
  it('keeps every mute locally while no cloud store is ready (Req 2.5)', () => {
    const storage = memoryStorage()
    const c = createMuteController({ storage: () => storage, now: () => 5, sender: () => null })
    expect(c.setMuted('UCa', true)).toBe(true)
    expect(c.muted.value.get('UCa')).toBe(true)
    // A reload reads the same mute back.
    const again = createMuteController({ storage: () => storage, now: () => 6, sender: () => null })
    again.load()
    expect(again.muted.value.get('UCa')).toBe(true)
  })

  it('rejects an empty or too long id and leaves the mutes unchanged (Req 2.10)', () => {
    const storage = memoryStorage()
    const c = createMuteController({ storage: () => storage, now: () => 5, sender: () => null })
    c.setMuted('UCa', true)
    const before = storage.data.get(CHANNEL_MUTES_KEY)
    expect(c.setMuted('', true)).toBe(false)
    expect(c.setMuted('x'.repeat(65), true)).toBe(false)
    expect(storage.data.get(CHANNEL_MUTES_KEY)).toBe(before)
  })

  it('one record per channel: a change updates it in place (Req 2.3)', () => {
    const storage = memoryStorage()
    let t = 0
    const c = createMuteController({ storage: () => storage, now: () => ++t, sender: () => null })
    c.setMuted('UCa', true)
    c.setMuted('UCa', false)
    expect(c.shown.value).toEqual([{ channelId: 'UCa', muted: false, changedAt: 2 }])
  })

  it('shows mergeMuteLists(cloud, local)', () => {
    const storage = memoryStorage()
    const c = createMuteController({ storage: () => storage, now: () => 50, sender: () => null })
    c.setCloud([
      { channelId: 'UCa', muted: true, changedAt: 100 },
      { channelId: 'UCb', muted: true, changedAt: 10 },
    ])
    c.setMuted('UCa', false) // older than the cloud record: the cloud wins
    c.setMuted('UCb', false) // newer: the local change wins
    expect(c.muted.value.get('UCa')).toBe(true)
    expect(c.muted.value.get('UCb')).toBe(false)
  })

  it('a failed cloud write keeps the switch state and retries with the original time (Req 2.7)', async () => {
    const storage = memoryStorage()
    const sent: ChannelMute[][] = []
    let fail = true
    const sender: MuteSender = {
      key: 'user-1',
      send: async (rows) => {
        sent.push(rows.map((r) => ({ ...r })))
        if (fail) throw new Error('offline')
      },
    }
    const clock = timers()
    let t = 1000
    const c = createMuteController({
      storage: () => storage,
      now: () => t,
      sender: () => sender,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer,
    })
    c.setMuted('UCa', true)
    await c.settled()
    expect(sent).toEqual([[{ channelId: 'UCa', muted: true, changedAt: 1000 }]])
    // The switch stays muted and the change stays stored locally.
    expect(c.muted.value.get('UCa')).toBe(true)
    expect(readLocalMutes(storage).get('UCa')).toEqual({ channelId: 'UCa', muted: true, changedAt: 1000 })
    // A retry is scheduled within 60 s.
    expect(clock.queue).toHaveLength(1)
    expect(clock.queue[0]!.ms).toBe(MUTE_RETRY_MS)
    expect(MUTE_RETRY_MS).toBeLessThanOrEqual(60_000)

    t = 99_000
    fail = false
    clock.fire()
    await c.settled()
    expect(sent[1]).toEqual([{ channelId: 'UCa', muted: true, changedAt: 1000 }])
    expect(storage.data.has(CHANNEL_MUTES_KEY)).toBe(false)
    expect(c.muted.value.get('UCa')).toBe(true)
  })

  it('a later app start sends the stored unsent mutes and removes them only after success (Req 2.6, 2.7)', async () => {
    const storage = memoryStorage()
    const offline = createMuteController({ storage: () => storage, now: () => 7, sender: () => null })
    offline.setMuted('UCa', true)

    let ok = false
    const sent: ChannelMute[][] = []
    const sender: MuteSender = {
      key: 'user-1',
      send: async (rows) => {
        sent.push(rows)
        if (!ok) throw new Error('offline')
      },
    }
    const clock = timers()
    const start = createMuteController({ storage: () => storage, now: () => 99, sender: () => sender, ...clock })
    start.flush()
    await start.settled()
    expect(readLocalMutes(storage).size).toBe(1)
    ok = true
    start.flush()
    await start.settled()
    expect(sent.at(-1)).toEqual([{ channelId: 'UCa', muted: true, changedAt: 7 }])
    expect(readLocalMutes(storage).size).toBe(0)
  })

  it('removeSentMutes keeps a record changed after it was sent', () => {
    const records = new Map<string, ChannelMute>([
      ['UCa', { channelId: 'UCa', muted: false, changedAt: 9 }],
      ['UCb', { channelId: 'UCb', muted: true, changedAt: 3 }],
    ])
    const next = removeSentMutes(records, [
      { channelId: 'UCa', muted: true, changedAt: 5 },
      { channelId: 'UCb', muted: true, changedAt: 3 },
    ])
    expect([...next.keys()]).toEqual(['UCa'])
  })
})
