import { computed, shallowRef, watch, type ComputedRef } from 'vue'
import type { ChannelMute } from '#shared/types/fresh'
import { isValidChannelId, mergeMuteLists } from '#shared/utils/channel-mutes'
import { applyMuteWrite, readLocalMutes, removeSentMutes, writeLocalMutes } from '~/utils/channel-mutes-store'
import { createCloudApi } from '~/utils/cloud-api'
import { browserStorage, type StorageLike } from '~/utils/progress-store'
import { createSaveQueue, type SaveQueue } from '~/utils/save-queue'

/** Wait before a failed cloud write is tried again (spec: fresh, Req 2.7: within 60 s). */
export const MUTE_RETRY_MS = 30_000

/** Where unsent mutes go for one user. `key` identifies the user, so a new user gets a new queue. */
export interface MuteSender {
  key: string
  send: (rows: ChannelMute[]) => Promise<void>
}

export interface MuteControllerDeps {
  storage: () => StorageLike | null
  now: () => number
  /** The sender of the current user once the cloud store is ready, else null (local only). */
  sender: () => MuteSender | null
  retryMs?: number
  setTimer?: (run: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface MuteController {
  /** One record per channel id: `mergeMuteLists(cloud, local)` (Req 2.3, 15.7). */
  shown: ComputedRef<ChannelMute[]>
  /** Channel id -> muted, for `buildFreshView`. */
  muted: ComputedRef<ReadonlyMap<string, boolean>>
  /** Reads the local mutes once, so they show before any change (Req 2.5). */
  load(): void
  /** The cloud mutes returned by the Fresh_Endpoint. */
  setCloud(rows: readonly ChannelMute[]): void
  /** Stores a change. Returns false and stores nothing for an invalid channel id (Req 2.10). */
  setMuted(channelId: string, muted: boolean): boolean
  /** Sends every unsent mute when a sender is available. */
  flush(): void
  /** Resolves when no send is in flight. */
  settled(): Promise<void>
}

/**
 * Channel_Mute store (spec: fresh, Req 2.1 to 2.7, 2.10). Every change is stored
 * locally first. Without a ready cloud store the local record is the mute (Req 2.5).
 * With one, the pending records are sent through `merge_channel_mutes` and removed
 * locally only after success (Req 2.6). A failed send keeps the switch state and the
 * record with its original `changedAt`, shows nothing and is retried after 30 s and
 * at the next app start (Req 2.7).
 */
export function createMuteController(deps: MuteControllerDeps): MuteController {
  const retryMs = deps.retryMs ?? MUTE_RETRY_MS
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms))
  const clearTimer = deps.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))

  const cloud = shallowRef<ChannelMute[]>([])
  // Read lazily, so a caller that never shows or changes mutes (Demo_Mode) never reads them.
  const local = shallowRef<Map<string, ChannelMute> | null>(null)
  let queue: SaveQueue<ChannelMute[]> | null = null
  let queueKey = ''
  let retryTimer: unknown = null

  function pending(): Map<string, ChannelMute> {
    if (local.value === null) local.value = readLocalMutes(deps.storage())
    return local.value
  }

  function persist(next: Map<string, ChannelMute>): void {
    local.value = next
    writeLocalMutes(deps.storage(), next)
  }

  function clearRetry(): void {
    if (retryTimer !== null) clearTimer(retryTimer)
    retryTimer = null
  }

  function scheduleRetry(): void {
    if (retryTimer !== null) return
    retryTimer = setTimer(() => {
      retryTimer = null
      flush()
    }, retryMs)
  }

  function queueFor(sender: MuteSender): SaveQueue<ChannelMute[]> {
    if (queue && queueKey === sender.key) return queue
    queue?.cancel()
    clearRetry()
    queueKey = sender.key
    queue = createSaveQueue<ChannelMute[]>(
      async (batch) => {
        await sender.send(batch)
        // The cloud now holds the batch: keep showing it, and drop what was sent unchanged.
        cloud.value = mergeMuteLists(cloud.value, batch)
        persist(removeSentMutes(pending(), batch))
      },
      { onFailure: scheduleRetry, onSuccess: clearRetry },
    )
    return queue
  }

  function flush(): void {
    const sender = deps.sender()
    if (!sender) return
    const batch = [...pending().values()]
    if (batch.length === 0) return
    queueFor(sender).push(batch)
  }

  const shown = computed(() => mergeMuteLists(cloud.value, [...(local.value ?? new Map<string, ChannelMute>()).values()]))
  const muted = computed<ReadonlyMap<string, boolean>>(
    () => new Map(shown.value.map((rec) => [rec.channelId, rec.muted])),
  )

  return {
    shown,
    muted,
    load() {
      pending()
    },
    setCloud(rows) {
      pending()
      cloud.value = mergeMuteLists([], rows.filter((rec) => isValidChannelId(rec.channelId)))
    },
    setMuted(channelId, value) {
      if (!isValidChannelId(channelId)) return false
      persist(applyMuteWrite(pending(), { channelId, muted: value, changedAt: deps.now() }))
      flush()
      return true
    },
    flush,
    settled: () => queue?.settled() ?? Promise.resolve(),
  }
}

// One controller per page load, shared by every caller (the app plugin and the Fresh_Page).
let shared: MuteController | null = null
let watching = false

/**
 * The app-wide Channel_Mute store. The first call (from the cloud plugin at app start)
 * also starts the sign-in and app-start flush. Never used in Demo_Mode (Req 2.11).
 */
export function useChannelMutes(): MuteController {
  const auth = useAuth()
  const cloudStore = useCloudStore()
  shared ??= createMuteController({
    storage: browserStorage,
    now: () => Date.now(),
    sender: () => {
      if (!import.meta.client) return null
      const client = auth.client()
      const userId = auth.userId.value
      if (cloudStore.status.value !== 'ready' || userId === '' || !client) return null
      return {
        key: userId,
        send: async (rows) => {
          if (auth.userId.value !== userId) throw new Error('no_session')
          await createCloudApi(client, userId).mergeChannelMutes(rows)
        },
      }
    },
  })
  if (!watching && import.meta.client) {
    watching = true
    const controller = shared
    // Sign-in, app start and a reload of the cloud store all end in `ready` (Req 2.6, 2.7).
    watch(() => cloudStore.status.value, () => controller.flush(), { immediate: true })
    watch(() => auth.userId.value, () => controller.flush())
  }
  return shared
}
