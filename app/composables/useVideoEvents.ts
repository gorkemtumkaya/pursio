import { watch } from 'vue'
import type { VideoEvent, VideoSource } from '#shared/types/video'
import { applyPlay, applyProgress, applySave, applySkip, newEvent } from '#shared/utils/video-events'
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

function pending(): Map<string, VideoEvent> {
  unsent ??= readLocalEvents(browserStorage())
  return unsent
}

function persist(next: Map<string, VideoEvent>): void {
  unsent = next
  writeLocalEvents(browserStorage(), next)
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

  function update(videoId: string, source: VideoSource, change: (rec: VideoEvent, now: number) => VideoEvent): void {
    if (!import.meta.client) return
    const key = eventKey({ videoId, source })
    const now = Date.now()
    const current = known.get(key) ?? pending().get(key) ?? newEvent(videoId, source, now)
    const next = change(current, now)
    if (next === current) return
    known.set(key, next)
    const map = new Map(pending())
    map.set(key, next)
    persist(map)
    flush()
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
    recordSave: (videoId: string, saved: boolean, source: VideoSource = 'skill_sheet') =>
      update(videoId, source, (rec, now) => applySave(rec, saved, now)),
    recordSkip: (videoId: string, source: VideoSource = 'skill_sheet') =>
      update(videoId, source, (rec, now) => applySkip(rec, now)),
    flush,
  }
}
