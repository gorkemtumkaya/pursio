import { computed, toRaw } from 'vue'
import type { CompletedAt } from '#shared/types/cloud'
import type { Progress } from '#shared/types/progress'
import type { Theme } from '#shared/types/theme'
import { isTheme } from '#shared/utils/theme'
import { setActiveHobbyId } from '~/utils/active-hobby'
import { normalizeDisplayName } from '~/utils/auth-logic'
import { createCloudApi, type CloudApi } from '~/utils/cloud-api'
import {
  stampCompletions,
  upsertGenerated,
  withArchived,
  withoutPath,
  withPath,
  type CloudPath,
  type GeneratedPath,
} from '~/utils/cloud-library'
import { buildCloudPaths, toPathInsertRow, toProgressRow } from '~/utils/cloud-rows'
import { hobbyId } from '~/utils/hobby-store'
import { clearLegacyData, planImport, readLegacyData, runLegacyImport } from '~/utils/legacy-import'
import { browserStorage, type ProgressStore } from '~/utils/progress-store'
import { createSaveQueue, type SaveQueue } from '~/utils/save-queue'

export type CloudStatus = 'idle' | 'loading' | 'importing' | 'ready' | 'error'

export interface CloudProfile {
  displayName: string | null
  theme: Theme | null
}

interface CloudState {
  status: CloudStatus
  /** The user the state belongs to; empty when there is none. */
  userId: string
  paths: CloudPath[]
  profile: CloudProfile | null
}

interface ProgressWrite {
  progress: Progress
  completedAt: CompletedAt
}

export const CLOUD_MESSAGES = {
  loadFailed: "We couldn't load your paths. Check your connection and try again.",
  importFailed: "We couldn't import your saved paths. They stay on this device and we'll try again next time.",
  changeFailed: "Couldn't save that change. Try again.",
  progressFailed: "Couldn't save your last change.",
  profileFailed: "Couldn't save that. Try again.",
} as const

const emptyState = (): CloudState => ({ status: 'idle', userId: '', paths: [], profile: null })

// Per page load. A newer bootstrap makes the results of an older one stale.
let generation = 0
const queues = new Map<string, SaveQueue<ProgressWrite>>()
/** The sticky "couldn't save" toast per path, so a later success can hide it. */
const failureToasts = new Map<string, number>()

/**
 * Cloud_Store (spec: accounts-cloud-save, Req 5 to 8). Outside Demo_Mode it is
 * the only source of the learner's paths, Progress and profile. All requests
 * go through the browser's Supabase_Client with the user's own token.
 *
 * Archive, restore, delete and Undo wait for the database and then change the
 * screen, so a failure leaves everything as it was (Req 5.12). Only Progress
 * is optimistic (Req 6.1).
 */
export function useCloudStore() {
  const state = useState<CloudState>('pursio-cloud', emptyState)
  const auth = useAuth()
  const toast = useToast()
  const { theme, setTheme } = useTheme()

  const status = computed(() => state.value.status)
  const paths = computed<readonly CloudPath[]>(() => state.value.paths)
  const profile = computed(() => state.value.profile)

  /** The API for the user the state belongs to, or `null` without a session. */
  function api(): CloudApi | null {
    const client = auth.client()
    const { userId } = state.value
    return client && userId !== '' ? createCloudApi(client, userId) : null
  }

  function setPaths(next: CloudPath[]): void {
    state.value = { ...state.value, paths: next }
  }

  function clear(): void {
    generation += 1
    queues.clear()
    failureToasts.clear()
    state.value = emptyState()
  }

  async function loadRows(cloud: CloudApi): Promise<{ pathRows: unknown[]; progressRows: unknown[] }> {
    const [pathRows, progressRows] = await Promise.all([cloud.listPaths(), cloud.listProgress()])
    return { pathRows, progressRows }
  }

  /** The Profile_Row never blocks paths: a failure is ignored (design "Cloud layer"). */
  async function loadProfile(cloud: CloudApi, run: number): Promise<void> {
    try {
      const row = await cloud.getProfile()
      if (run !== generation) return
      const record = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {}
      const stored = isTheme(record.theme) ? record.theme : null
      const displayName = typeof record.display_name === 'string' ? record.display_name : null
      state.value = { ...state.value, profile: { displayName, theme: stored } }
      // A valid, different theme is applied and replaces the one in localStorage (Req 7.1);
      // a bad or missing one changes nothing and is not written back (Req 7.7).
      if (stored !== null && stored !== theme.value) setTheme(stored)
    } catch {
      // Keep the current theme and an empty name.
    }
  }

  /**
   * Loads the user's rows. When the account has no path yet and this browser
   * holds Legacy_Data, it is imported first, so the learner sees the imported
   * paths on the first load (Req 8.1, 8.8).
   */
  async function bootstrap(userId: string): Promise<void> {
    const run = ++generation
    queues.clear()
    failureToasts.clear()
    state.value = { status: 'loading', userId, paths: [], profile: null }
    const cloud = api()
    if (!cloud) {
      state.value = { ...state.value, status: 'error' }
      return
    }
    void loadProfile(cloud, run)
    try {
      let rows = await loadRows(cloud)
      if (run !== generation) return
      if (rows.pathRows.length === 0) {
        const legacy = readLegacyData(browserStorage)
        if (legacy) {
          state.value = { ...state.value, status: 'importing' }
          const plan = planImport(legacy, 0, { userId, now: Date.now(), newId: () => crypto.randomUUID() })
          const imported = await runLegacyImport(cloud, plan)
          if (run !== generation) return
          if (imported) {
            if (plan.activeHobbyId !== null) setActiveHobbyId(plan.activeHobbyId)
            clearLegacyData(browserStorage)
          } else {
            toast.show(CLOUD_MESSAGES.importFailed)
          }
          rows = await loadRows(cloud)
          if (run !== generation) return
        }
      }
      state.value = { ...state.value, status: 'ready', paths: buildCloudPaths(rows.pathRows, rows.progressRows) }
    } catch {
      // No fallback to localStorage, and no Progress write until a load succeeds (Req 5.9, 6.11).
      if (run === generation) state.value = { ...state.value, status: 'error', paths: [] }
    }
  }

  /** "Try again" after a failed load. */
  function reload(): Promise<void> {
    const { userId } = state.value
    return userId === '' ? Promise.resolve() : bootstrap(userId)
  }

  function find(id: string): CloudPath | undefined {
    return state.value.paths.find((path) => path.record.id === id)
  }

  async function setArchived(id: string, archived: boolean): Promise<boolean> {
    const cloud = api()
    const path = find(id)
    if (!cloud || !path) return false
    try {
      await cloud.setArchived(path.pathId, archived)
    } catch {
      toast.show(CLOUD_MESSAGES.changeFailed)
      return false
    }
    setPaths(withArchived(state.value.paths, id, archived))
    return true
  }

  /** Hides a hobby from the lists; its tree and Progress stay (Req 5.5). */
  const archive = (id: string): Promise<boolean> => setArchived(id, true)
  const restore = (id: string): Promise<boolean> => setArchived(id, false)

  /** Deletes a hobby's Path_Row and, with it, its Progress_Row. Returns what was removed, for Undo (Req 5.6). */
  async function remove(id: string): Promise<CloudPath | null> {
    const cloud = api()
    const path = find(id)
    if (!cloud || !path) return null
    // A plain copy, so Undo still has the content after the state changed.
    const removed = JSON.parse(JSON.stringify(path)) as CloudPath
    try {
      await cloud.deletePath(path.pathId)
    } catch {
      toast.show(CLOUD_MESSAGES.changeFailed)
      return null
    }
    queues.delete(path.pathId)
    setPaths(withoutPath(state.value.paths, id))
    return removed
  }

  /**
   * Inserts a removed hobby again with its old id, time and content (Req 5.7).
   * A hobby with the same Hobby_Id built meanwhile makes the insert fail, which
   * is a failed Undo.
   */
  async function undoRemove(removed: CloudPath): Promise<boolean> {
    const cloud = api()
    const { userId } = state.value
    if (!cloud) return false
    try {
      await cloud.insertPaths([toPathInsertRow(userId, removed)])
      try {
        await cloud.insertProgress([toProgressRow(removed.pathId, userId, removed.progress, removed.completedAt)])
      } catch (error) {
        // Without its Progress the path must not come back: take the first insert out again.
        await cloud.deletePath(removed.pathId).catch(() => undefined)
        throw error
      }
    } catch {
      toast.show(CLOUD_MESSAGES.changeFailed)
      return false
    }
    setPaths(withPath(state.value.paths, removed))
    return true
  }

  /**
   * Takes over a path the Tree_Route just saved and makes it the Active_Hobby
   * (Req 5.8). Returns its Hobby_Id. When the rows are not loaded yet, they are
   * loaded now, and include the new path.
   */
  function addGenerated(generated: GeneratedPath): string {
    const id = hobbyId(generated.tree)
    setActiveHobbyId(id)
    queues.delete(generated.pathId)
    if (state.value.status === 'ready') setPaths(upsertGenerated(state.value.paths, generated, Date.now()))
    else void reload()
    return id
  }

  function queueFor(pathId: string): SaveQueue<ProgressWrite> {
    const existing = queues.get(pathId)
    if (existing) return existing
    const userId = state.value.userId
    const queue: SaveQueue<ProgressWrite> = createSaveQueue<ProgressWrite>(
      async (value) => {
        const cloud = api()
        if (!cloud || state.value.userId !== userId) throw new Error('no_session')
        await cloud.upsertProgress(toProgressRow(pathId, userId, value.progress, value.completedAt))
      },
      {
        // No automatic retry: the toast stays until Retry, Dismiss or a later successful write (Req 6.4, 6.5).
        onFailure: () => {
          if (queues.get(pathId) !== queue) return
          failureToasts.set(
            pathId,
            toast.show(CLOUD_MESSAGES.progressFailed, { label: 'Retry', run: () => queue.retry() }, { sticky: true }),
          )
        },
        onSuccess: () => {
          const id = failureToasts.get(pathId)
          if (id === undefined) return
          failureToasts.delete(pathId)
          toast.dismiss(id)
        },
      },
    )
    queues.set(pathId, queue)
    return queue
  }

  /**
   * The Progress_Store of one path. `save` changes the Progress and its
   * Completion_Timestamps in state at once, so XP, ring, Streak and Week follow
   * in the same render, and then queues the write (Req 6.1 to 6.3, 6.6).
   */
  function progressStore(pathId: string): ProgressStore {
    const current = (): CloudPath | undefined => state.value.paths.find((path) => path.pathId === pathId)
    return {
      load(): Progress {
        const path = current()
        if (!path) return { completed: [], quests: {} }
        const raw = toRaw(path.progress)
        return { completed: [...raw.completed], quests: { ...raw.quests } }
      },
      save(progress: Progress): void {
        const path = current()
        if (!path || state.value.status !== 'ready') return
        const completedAt = stampCompletions(toRaw(path.completedAt), progress, Date.now())
        setPaths(state.value.paths.map((other) => (other.pathId === pathId ? { ...other, progress, completedAt } : other)))
        queueFor(pathId).push({ progress, completedAt })
      },
    }
  }

  async function updateProfile(patch: { theme?: Theme; display_name?: string | null }): Promise<boolean> {
    const cloud = api()
    if (!cloud) return false
    try {
      await cloud.updateProfile(patch)
      return true
    } catch {
      // The screen keeps the chosen value; nothing is retried (Req 7.5).
      toast.show(CLOUD_MESSAGES.profileFailed)
      return false
    }
  }

  /** Saves the theme to the Profile_Row. A no-op without a session (Req 7.2). */
  async function saveTheme(next: Theme): Promise<void> {
    if (state.value.userId === '') return
    if (!(await updateProfile({ theme: next }))) return
    const current = state.value.profile
    state.value = { ...state.value, profile: { displayName: current?.displayName ?? null, theme: next } }
  }

  /** Saves the trimmed display name; empty means no name (Req 7.4). Returns true when it was saved. */
  async function saveDisplayName(raw: string): Promise<boolean> {
    if (state.value.userId === '') return false
    const displayName = normalizeDisplayName(raw)
    if (!(await updateProfile({ display_name: displayName }))) return false
    const current = state.value.profile
    state.value = { ...state.value, profile: { displayName, theme: current?.theme ?? null } }
    return true
  }

  return {
    status,
    paths,
    profile,
    bootstrap,
    clear,
    reload,
    archive,
    restore,
    remove,
    undoRemove,
    addGenerated,
    progressStore,
    saveTheme,
    saveDisplayName,
  }
}
