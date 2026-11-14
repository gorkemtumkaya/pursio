import { describe, expect, it } from 'vitest'

import { newEvent } from '../../shared/utils/video-events'
import type { StorageLike } from '../../app/utils/progress-store'
import {
  VIDEO_EVENTS_KEY,
  eventKey,
  readLocalEvents,
  removeSent,
  writeLocalEvents,
} from '../../app/utils/video-events-store'

function memory(initial?: string): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(VIDEO_EVENTS_KEY, initial)
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  }
}

describe('video events store', () => {
  it('round trips records through storage', () => {
    const storage = memory()
    const rec = { ...newEvent('abc', 'skill_sheet', 5), playedAt: 7, watchedSeconds: 12.5 }
    writeLocalEvents(storage, new Map([[eventKey(rec), rec]]))
    expect(readLocalEvents(storage).get('skill_sheet|abc')).toEqual(rec)
  })

  it('ignores broken or invalid stored data', () => {
    expect(readLocalEvents(memory('{nope')).size).toBe(0)
    expect(readLocalEvents(memory('[{"videoId":1}]')).size).toBe(0)
    expect(readLocalEvents(null).size).toBe(0)
  })

  it('removes the key when no record is left', () => {
    const storage = memory('[]')
    writeLocalEvents(storage, new Map())
    expect(storage.data.has(VIDEO_EVENTS_KEY)).toBe(false)
  })

  it('removeSent keeps a record that changed after it was sent', () => {
    const sent = newEvent('a', 'feed', 1)
    const changed = { ...sent, updatedAt: 2 }
    const other = newEvent('b', 'feed', 1)
    const left = removeSent(
      new Map([
        [eventKey(sent), changed],
        [eventKey(other), other],
      ]),
      [sent, other],
    )
    expect([...left.keys()]).toEqual(['feed|a'])
  })
})
