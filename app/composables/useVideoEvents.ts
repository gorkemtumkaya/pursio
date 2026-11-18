import { shallowRef, watch } from 'vue'
import type { SaveSnapshot } from '#shared/types/fresh'
import type { VideoEvent, VideoSource } from '#shared/types/video'
import { applyPlay, applyProgress, applySave, applySkip, mergeEvents, newEvent } from '#shared/utils/video-events'
import { createCloudApi } from '~/utils/cloud-api'
import { browserStorage } from '~/utils/progress-store'
import { createSaveQueue, type SaveQueue } from '~/utils/save-queue'
import { eventKey, readLocalEvents, removeSent, writeLocalEvents } from '~/utils/video-events-store'

/** Wait before a failed send is tried again (Req 13.14). */
export const EVENT_RETRY_MS = 30_000

// One state per page load, shared by every caller.
/** Records not yet confirmed by the cloud. Mirrors the local store. */
let unsent: Map<string, VideoEvent> | null = null
/** Every record touched in this page load, so reducers see the latest value. */
const known = new Map<string, VideoEvent>()
let queue: SaveQueue<VideoEvent[]> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let sendUserId = ''
/** Bumped on every local change, so `mergedEvents` readers recompute (spec: fresh, Req 12.6). */
const revision = shallowRef(0)

/**
 * `mergeEvents` over the given records, one per video and source. Pure; used by
 * `mergedEvents` and by tests (spec: fresh, Req 17.10).
 */
export function mergeEventLists(...lists: readonly (readonly VideoEvent[])[]): VideoEvent[] {
  const out = new Map<string, VideoEvent>()
  for (const list of lists) {
    for (const rec of list) {
      const key = eventKey(rec)
      const prev = out.get(key)
      out.set(key, prev ? mergeEvents(prev, rec) : rec)
    }
  }
  return [...out.values()]
}

function pending(): Map<string, VideoEvent> {
  unsent ??= readLocalEvents(browserStorage())
  return unsent
}

function persist(next: Map<string, VideoEvent>): void {
  unsent = next
  writeLocalEvents(browserStorage(), next)
  revision.value += 1
}

/**
 * Event recorder (spec: skill-video-pipeline, Req 13.1, 13.2, 13.9, 13.11 to 13.15).
 * Keeps one record per video and source. Every change is stored locally first and
 * sent through `merge_video_events` once the cloud store is ready. A failed send
 * leaves the records stored, shows nothing, and is tried again after 30 s and at
 * the next app start. It never touches XP, level or streak.
 */
export function useVideoEvents() {
  const auth = useAuth()
  const cloud = useCloudStore()
  const { $posthog: posthog } = useNuxtApp()

  function ready(): boolean {
    return cloud.status.value === 'ready' && auth.userId.value !== '' && auth.client() !== null
  }

  function clearRetry(): void {
    if (retryTimer !== null) clearTimeout(retryTimer)
    retryTimer = null
  }

  function scheduleRetry(): void {
    if (retryTimer !== null) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      flush()
    }, EVENT_RETRY_MS)
  }

  function sender(): SaveQueue<VideoEvent[]> {
    const userId = auth.userId.value
    // A different user gets a new queue, so records are never sent under another account.
    if (queue && sendUserId === userId) return queue
    queue?.cancel()
    clearRetry()
    sendUserId = userId
    queue = createSaveQueue<VideoEvent[]>(
      async (batch) => {
        const client = auth.client()
        if (!client || auth.userId.value !== userId) throw new Error('no_session')
        await createCloudApi(client, userId).mergeVideoEvents(batch)
        persist(removeSent(pending(), batch))
      },
      {
        onFailure: scheduleRetry,
        onSuccess: clearRetry,
      },
    )
    return queue
  }

  /** Sends every unsent record. A no-op until the cloud store is ready or when nothing is unsent. */
  function flush(): void {
    if (!import.meta.client || !ready()) return
    const batch = [...pending().values()]
    if (batch.length === 0) return
    sender().push(batch)
  }

  function update(videoId: string, source: VideoSource, change: (rec: VideoEvent, now: number) => VideoEvent): boolean {
    if (!import.meta.client) return false
    const key = eventKey({ videoId, source })
    const now = Date.now()
    const current = known.get(key) ?? pending().get(key) ?? newEvent(videoId, source, now)
    const next = change(current, now)
    if (next === current) return false
    known.set(key, next)
    const map = new Map(pending())
    map.set(key, next)
    persist(map)
    flush()
    return true
  }

  // Sign-in, app start and a reload of the cloud store all end in `ready`.
  watch(() => cloud.status.value, flush, { immediate: true })
  watch(() => auth.userId.value, flush)

  return {
    recordPlay: (videoId: string, source: VideoSource = 'skill_sheet') =>
      update(videoId, source, (rec, now) => applyPlay(rec, now)),
    recordProgress: (
      videoId: string,
      seconds: number,
      durationSeconds: number | null | undefined,
      source: VideoSource = 'skill_sheet',
    ) => update(videoId, source, (rec, now) => applyProgress(rec, seconds, durationSeconds, now)),
    /** A `feed` save passes the Save_Snapshot of the shown card; a removal keeps the stored one (spec: fresh, Req 17.4). */
    recordSave: (videoId: string, saved: boolean, source: VideoSource = 'skill_sheet', snapshot?: SaveSnapshot | null) => {
      if (update(videoId, source, (rec, now) => applySave(rec, saved, now, snapshot))) {
        posthog?.capture('video_save_changed', { saved, source })
      }
    },
    recordSkip: (videoId: string, source: VideoSource = 'skill_sheet') => {
      if (update(videoId, source, (rec, now) => applySkip(rec, now))) {
        posthog?.capture('video_skipped', { source })
      }
    },
    flush,
    /**
     * The cloud rows (from the Fresh_Endpoint) merged with the local unsent records and
     * every record changed in this page load. Reactive: it follows local changes.
     */
    mergedEvents: (cloudRows: readonly VideoEvent[]): VideoEvent[] => {
      void revision.value
      if (!import.meta.client) return [...cloudRows]
      return mergeEventLists(cloudRows, [...pending().values()], [...known.values()])
    },
  }
}
