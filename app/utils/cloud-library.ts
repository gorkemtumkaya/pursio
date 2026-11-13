// Pure list operations on the learner's cloud paths (spec: accounts-cloud-save).
import type { CompletedAt } from '#shared/types/cloud'
import type { StartLevel } from '#shared/types/llm'
import type { Progress } from '#shared/types/progress'
import type { SkillTree } from '#shared/types/skill-tree'
import { completionPercent, emptyProgress } from '#shared/utils/progress-engine'
import { hobbyId, hobbyPath, type HobbyEntry, type HobbyLibrary, type HobbyRecord } from './hobby-store'

/** One Path_Row with its Progress_Row, as the app holds it. */
export interface CloudPath {
  /** Path_Row id. Identifies the row for writes only. */
  pathId: string
  /** `id` is the Hobby_Id. */
  record: HobbyRecord
  level: StartLevel
  progress: Progress
  completedAt: CompletedAt
}

/** The shape `pickHobby` and `nextHobbyId` work on. An unknown `activeId` is dropped. */
export function toHobbyLibrary(paths: readonly CloudPath[], activeId: string | null): HobbyLibrary {
  const hobbies = paths.map((path) => path.record)
  return { hobbies, activeId: activeId !== null && hobbies.some((h) => h.id === activeId) ? activeId : null }
}

/** Sidebar rows. Archived paths are left out, or listed alone with `{ archived: true }`. */
export function cloudEntries(
  paths: readonly CloudPath[],
  { archived = false }: { archived?: boolean } = {},
): HobbyEntry[] {
  return paths
    .filter((path) => path.record.archived === archived)
    .map(({ record, progress }) => ({
      id: record.id,
      hobby: record.tree.hobby,
      percent: completionPercent(record.tree, progress),
      to: hobbyPath(record.id),
    }))
}

/** Every Completion_Timestamp of every path, archived ones included, once each (Req 6.8). */
export function completionTimes(paths: readonly CloudPath[]): number[] {
  return paths.flatMap((path) => Object.values(path.completedAt))
}

/**
 * Timestamps after a Progress change: an existing one is kept, a newly
 * completed Node gets `now`, and Nodes no longer completed are dropped (Req 6.6).
 */
export function stampCompletions(prev: CompletedAt, progress: Progress, now: number): CompletedAt {
  return Object.fromEntries(
    progress.completed.map((id): [string, number] => [id, Object.hasOwn(prev, id) ? (prev[id] ?? now) : now]),
  )
}

export interface GeneratedPath {
  pathId: string
  tree: SkillTree
  model: string
  level: StartLevel
}

/**
 * Adds a path the Tree_Route just saved. A path with the same Hobby_Id is
 * replaced in place: it keeps `addedAt`, is restored if archived and starts
 * with empty Progress, as the database function does (Req 9.8).
 */
export function upsertGenerated(paths: readonly CloudPath[], generated: GeneratedPath, now: number): CloudPath[] {
  const id = hobbyId(generated.tree)
  const fresh = (addedAt: number): CloudPath => ({
    pathId: generated.pathId,
    record: { id, tree: generated.tree, model: generated.model, addedAt, archived: false },
    level: generated.level,
    progress: emptyProgress(),
    completedAt: {},
  })
  if (!paths.some((path) => path.record.id === id)) return [...paths, fresh(now)]
  return paths.map((path) => (path.record.id === id ? fresh(path.record.addedAt) : path))
}

/** The list without one hobby (delete). */
export function withoutPath(paths: readonly CloudPath[], id: string): CloudPath[] {
  return paths.filter((path) => path.record.id !== id)
}

/** The list with one hobby archived or restored, in place. */
export function withArchived(paths: readonly CloudPath[], id: string, archived: boolean): CloudPath[] {
  return paths.map((path) =>
    path.record.id === id && path.record.archived !== archived
      ? { ...path, record: { ...path.record, archived } }
      : path,
  )
}

/**
 * Puts a removed path back (Undo), before the first path added later, so the
 * list keeps its order. A path with the same Hobby_Id is replaced.
 */
export function withPath(paths: readonly CloudPath[], path: CloudPath): CloudPath[] {
  const rest = withoutPath(paths, path.record.id)
  const index = rest.findIndex((other) => other.record.addedAt > path.record.addedAt)
  return index === -1 ? [...rest, path] : [...rest.slice(0, index), path, ...rest.slice(index)]
}
