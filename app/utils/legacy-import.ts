// Legacy_Importer: copies the data earlier versions kept in localStorage into
// the account, once (spec: accounts-cloud-save, Req 8).
import type { CompletedAt, PathInsertRow, ProgressWriteRow } from '#shared/types/cloud'
import type { Progress } from '#shared/types/progress'
import type { SkillTree } from '#shared/types/skill-tree'
import { normalizeHobby } from '#shared/utils/llm'
import { ACTIVITY_STORAGE_KEY, parseCompletionLog } from './activity-store'
import { raceDeadline } from './deadline'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY, parseStoredGeneratedTree } from './generated-tree'
import { HOBBY_LIBRARY_KEY, hobbyId, hobbyProgressKey, parseHobbyLibrary } from './hobby-store'
import { parseStoredProgress, pruneProgress, type StorageLike } from './progress-store'

type GetStorage = () => StorageLike | null

export interface LegacyEntry {
  /** Hobby_Id. */
  id: string
  tree: SkillTree
  model: string
  archived: boolean
  /** Stored time, or `null` for the earlier Generated_Tree, which has none. */
  addedAt: number | null
  progress: Progress
}

export interface LegacyData {
  /** Valid entries in Hobby_Library order; the earlier Generated_Tree comes last. */
  entries: LegacyEntry[]
  /** The stored `activeId` when it matches a valid library entry. */
  activeId: string | null
  /** The Completion_Log, as stored. */
  completions: number[]
}

export interface ImportPlan {
  paths: PathInsertRow[]
  progress: ProgressWriteRow[]
  /** Hobby_Id to make the Active_Hobby after a successful import. */
  activeHobbyId: string | null
}

/** The part of the CloudApi the importer needs. */
export interface ImportApi {
  insertPaths(rows: readonly PathInsertRow[], signal?: AbortSignal): Promise<void>
  insertProgress(rows: readonly ProgressWriteRow[], signal?: AbortSignal): Promise<void>
  deletePaths(ids: readonly string[]): Promise<void>
}

export const IMPORT_DEADLINE_MS = 10_000

function safeStorage(getStorage: GetStorage): StorageLike | null {
  try {
    return getStorage()
  } catch {
    return null
  }
}

function readKey(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Reads the Legacy_Data without writing or removing anything, so a failed
 * import leaves every key as it was (Req 8.5). Returns `null` when none of the
 * Legacy_Data keys exist. Entries the Tree_Loader rejects or without a model
 * are left out (Req 8.7).
 */
export function readLegacyData(getStorage: GetStorage): LegacyData | null {
  const storage = safeStorage(getStorage)
  if (!storage) return null
  const rawLibrary = readKey(storage, HOBBY_LIBRARY_KEY)
  const rawGenerated = readKey(storage, GENERATED_TREE_KEY)
  const rawGeneratedProgress = readKey(storage, GENERATED_PROGRESS_KEY)
  const rawLog = readKey(storage, ACTIVITY_STORAGE_KEY)
  if (rawLibrary === null && rawGenerated === null && rawGeneratedProgress === null && rawLog === null) return null

  const progressFor = (raw: string | null, tree: SkillTree): Progress =>
    pruneProgress(parseStoredProgress(raw).progress, tree)

  const { library } = parseHobbyLibrary(rawLibrary)
  const entries: LegacyEntry[] = library.hobbies.map((record) => ({
    id: record.id,
    tree: record.tree,
    model: record.model,
    archived: record.archived,
    addedAt: record.addedAt,
    progress: progressFor(readKey(storage, hobbyProgressKey(record.id)), record.tree),
  }))

  const generated = parseStoredGeneratedTree(rawGenerated).value
  if (generated) {
    const id = hobbyId(generated.tree)
    if (!entries.some((entry) => entry.id === id)) {
      entries.push({
        id,
        tree: generated.tree,
        model: generated.model,
        archived: false,
        addedAt: null,
        progress: progressFor(rawGeneratedProgress, generated.tree),
      })
    }
  }

  return { entries, activeId: library.activeId, completions: parseCompletionLog(rawLog).completions }
}

/** ISO time of a stored `addedAt`; a missing or out-of-range value (corrupt storage) falls back to `now`. */
function isoTime(ms: number | null, now: number): string {
  const date = new Date(ms ?? now)
  return Number.isNaN(date.getTime()) ? new Date(now).toISOString() : date.toISOString()
}

/**
 * The rows one import writes. With an existing path it plans nothing (Req 8.6).
 * Otherwise: one Path_Row and one Progress_Row per entry, with level `new`
 * (Req 8.1, 8.2). Completion_Timestamps come from the Completion_Log, oldest
 * first, handed out in library order and then completion order; Nodes past the
 * end of the log get none and surplus log values are dropped (Req 8.3).
 */
export function planImport(
  legacy: LegacyData,
  existingPathCount: number,
  ctx: { userId: string; now: number; newId: () => string },
): ImportPlan {
  if (existingPathCount > 0) return { paths: [], progress: [], activeHobbyId: null }

  const log = [...legacy.completions].sort((a, b) => a - b)
  let next = 0
  const paths: PathInsertRow[] = []
  const progress: ProgressWriteRow[] = []

  for (const entry of legacy.entries) {
    const id = ctx.newId()
    paths.push({
      id,
      user_id: ctx.userId,
      hobby: entry.tree.hobby,
      hobby_id: entry.id,
      level: 'new',
      tree: entry.tree,
      mascot_set: entry.tree.mascot.set,
      model: entry.model,
      archived: entry.archived,
      created_at: isoTime(entry.addedAt, ctx.now),
    })
    const stamps: [string, number][] = []
    for (const nodeId of entry.progress.completed) {
      const stamp = log[next]
      if (stamp === undefined) break
      stamps.push([nodeId, stamp])
      next += 1
    }
    const completedAt: CompletedAt = Object.fromEntries(stamps)
    progress.push({
      path_id: id,
      user_id: ctx.userId,
      completed: [...entry.progress.completed],
      quests: { ...entry.progress.quests },
      completed_at: completedAt,
    })
  }

  const active = legacy.entries.find((entry) => entry.id === legacy.activeId) ?? legacy.entries[0]
  return { paths, progress, activeHobbyId: active?.id ?? null }
}

/**
 * Writes the plan with two inserts under one deadline. On any error or when
 * the deadline passes, it deletes the plan's Path_Rows (their Progress_Rows go
 * with them) and returns false (Req 8.5). The ids are made by the client, so
 * the delete targets exactly this attempt's rows even when a response was lost.
 * An empty plan is a success without any call (Req 8.7).
 */
export async function runLegacyImport(
  api: ImportApi,
  plan: ImportPlan,
  deadlineMs: number = IMPORT_DEADLINE_MS,
): Promise<boolean> {
  if (plan.paths.length === 0) return true
  const controller = new AbortController()
  try {
    await raceDeadline(
      (async () => {
        await api.insertPaths(plan.paths, controller.signal)
        await api.insertProgress(plan.progress, controller.signal)
      })(),
      deadlineMs,
    )
    return true
  } catch {
    controller.abort()
    try {
      await raceDeadline(api.deletePaths(plan.paths.map((row) => row.id)), deadlineMs)
    } catch {
      // Rows that survive a lost delete make the next load skip the import (Req 8.6).
    }
    return false
  }
}

/** Hobby_Ids named in the stored library, as stored and as recomputed from each tree. */
function storedHobbyIds(rawLibrary: string | null): Set<string> {
  const ids = new Set<string>()
  if (rawLibrary === null) return ids
  let json: unknown
  try {
    json = JSON.parse(rawLibrary)
  } catch {
    return ids
  }
  const hobbies: unknown = typeof json === 'object' && json !== null ? (json as Record<string, unknown>).hobbies : null
  if (!Array.isArray(hobbies)) return ids
  for (const value of hobbies as unknown[]) {
    if (typeof value !== 'object' || value === null) continue
    const { id, tree } = value as Record<string, unknown>
    if (typeof id === 'string') ids.add(id)
    const hobby: unknown = typeof tree === 'object' && tree !== null ? (tree as Record<string, unknown>).hobby : null
    if (typeof hobby === 'string') ids.add(normalizeHobby(hobby))
  }
  return ids
}

/**
 * Removes the Legacy_Data keys after a successful import (Req 8.4). The
 * Sample_Tree's Progress, the theme and the LLM_Settings are never touched.
 */
export function clearLegacyData(getStorage: GetStorage): void {
  const storage = safeStorage(getStorage)
  if (!storage) return
  const keys = [
    ...[...storedHobbyIds(readKey(storage, HOBBY_LIBRARY_KEY))].map(hobbyProgressKey),
    HOBBY_LIBRARY_KEY,
    GENERATED_TREE_KEY,
    GENERATED_PROGRESS_KEY,
    ACTIVITY_STORAGE_KEY,
  ]
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore: with paths in the account, a leftover key is never imported again.
    }
  }
}
