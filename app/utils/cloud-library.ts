// Pure list operations on the learner's cloud paths (spec: accounts-cloud-save).
import type { CompletedAt, DailyPick, QuestData, QuestTicks } from '#shared/types/cloud'
import type { StartLevel } from '#shared/types/llm'
import type { Progress } from '#shared/types/progress'
import type { QuestTriple, SkillTree } from '#shared/types/skill-tree'
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
  questTicks: QuestTicks
  dailyPick: DailyPick | null
  dailyBonusCount: number
}

/** Quest data of a path with no ticks, no pick and no bonus. */
export function emptyQuestData(): QuestData {
  return { questTicks: {}, dailyPick: null, dailyBonusCount: 0 }
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

/** Every quest tick time of every path, archived ones included. */
export function questTickTimes(paths: readonly CloudPath[]): number[] {
  return paths.flatMap((path) =>
    Object.values(path.questTicks).flatMap((triple) => triple.filter((time): time is number => time !== null)),
  )
}

/** Completion times and tick times of every path, archived ones included. Feeds Streak and "This week". */
export function activityTimes(paths: readonly CloudPath[]): number[] {
  return [...completionTimes(paths), ...questTickTimes(paths)]
}

/**
 * Tick times after a Progress change. A quest that stays ticked keeps its time
 * (or none, for a legacy tick), a newly ticked one gets `now`, an unticked one
 * loses its time. Entries with no time are left out.
 */
export function stampQuestTicks(prev: QuestTicks, before: Progress, after: Progress, now: number): QuestTicks {
  const ids = new Set([...Object.keys(prev), ...Object.keys(after.quests)])
  const entries = [...ids].map((id): [string, QuestTriple<number | null>] => {
    const ticked = Object.hasOwn(after.quests, id) ? after.quests[id] : undefined
    const was = Object.hasOwn(before.quests, id) ? before.quests[id] : undefined
    const old = Object.hasOwn(prev, id) ? prev[id] : undefined
    const time = (i: 0 | 1 | 2): number | null => {
      if (ticked?.[i]) return was?.[i] ? (old?.[i] ?? null) : now
      // Unticked now: a tick that existed before loses its time; retained history stays.
      return was?.[i] ? null : (old?.[i] ?? null)
    }
    return [id, [time(0), time(1), time(2)]]
  })
  return Object.fromEntries(entries.filter(([, triple]) => triple.some((time) => time !== null)))
}

/**
 * Timestamps after a Progress change. A Node completed in `after` keeps its
 * time if it was completed in `before`, else gets `now`. A Node completed in
 * `before` but not in `after` is dropped (Req 6.6). A Node completed in neither
 * keeps its time, which is history retained by a keep-history reset.
 */
export function stampCompletions(prev: CompletedAt, before: Progress, after: Progress, now: number): CompletedAt {
  const was = new Set(before.completed)
  const is = new Set(after.completed)
  const entries: [string, number][] = []
  for (const id of new Set([...Object.keys(prev), ...after.completed])) {
    const old = Object.hasOwn(prev, id) ? prev[id] : undefined
    if (is.has(id)) entries.push([id, was.has(id) ? (old ?? now) : now])
    else if (!was.has(id) && old !== undefined) entries.push([id, old])
  }
  return Object.fromEntries(entries)
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
    ...emptyQuestData(),
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
