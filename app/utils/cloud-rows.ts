// Mapping between database rows and the app's shapes (spec: accounts-cloud-save).
import { z } from 'zod'
import type { CompletedAt, PathInsertRow, ProgressWriteRow } from '#shared/types/cloud'
import type { Progress } from '#shared/types/progress'
import type { QuestTriple, SkillTree } from '#shared/types/skill-tree'
import { START_LEVELS } from '#shared/utils/llm'
import { emptyProgress } from '#shared/utils/progress-engine'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import type { CloudPath } from './cloud-library'
import { hobbyId } from './hobby-store'
import { storedProgressSchema } from './progress-store'

const pathRowSchema = z.object({
  id: z.string().min(1),
  level: z.enum(START_LEVELS),
  tree: z.unknown(),
  model: z.string().min(1),
  archived: z.boolean(),
  created_at: z.string(),
})

/**
 * A Path_Row as a CloudPath with empty Progress, or `null` when a column is
 * wrong, the Tree_Loader rejects the tree or the model is empty (Req 5.4). The
 * Hobby_Id is recomputed from the tree, as the Hobby_Library always did.
 */
export function parsePathRow(raw: unknown): CloudPath | null {
  const row = pathRowSchema.safeParse(raw)
  if (!row.success) return null
  const loaded = loadSkillTree(row.data.tree)
  if (!loaded.ok) return null
  const addedAt = Date.parse(row.data.created_at)
  if (!Number.isFinite(addedAt)) return null
  return {
    pathId: row.data.id,
    record: {
      id: hobbyId(loaded.value),
      tree: loaded.value,
      model: row.data.model,
      addedAt,
      archived: row.data.archived,
    },
    level: row.data.level,
    progress: emptyProgress(),
    completedAt: {},
  }
}

const progressRowSchema = storedProgressSchema.extend({
  completed_at: z.record(z.string(), z.number().finite()),
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A Progress_Row as Progress and Completion_Timestamps for `tree`. Duplicate
 * completed ids collapse. Completed ids, quest entries and timestamps of Nodes
 * that are not in the tree are dropped, as are timestamps of Nodes that are
 * not completed (Req 6.10). A row with a wrong shape gives empty Progress.
 */
export function parseProgressRow(raw: unknown, tree: SkillTree): { progress: Progress; completedAt: CompletedAt } {
  const empty = { progress: emptyProgress(), completedAt: {} }
  if (!isRecord(raw) || !progressRowSchema.safeParse(raw).success) return empty

  const ids = new Set(tree.sections.flatMap((section) => section.nodes.map((node) => node.id)))
  const completed = [...new Set(raw.completed as string[])].filter((id) => ids.has(id))
  const done = new Set(completed)
  // Rebuilt from the validated raw entries with Object.fromEntries, so keys such
  // as "__proto__" stay own properties.
  const quests = Object.fromEntries(
    Object.entries(raw.quests as Record<string, QuestTriple<boolean>>)
      .filter(([id]) => ids.has(id))
      .map(([id, [a, b, c]]): [string, QuestTriple<boolean>] => [id, [a, b, c]]),
  )
  const completedAt = Object.fromEntries(
    Object.entries(raw.completed_at as Record<string, number>).filter(([id]) => done.has(id)),
  )
  return { progress: { completed, quests }, completedAt }
}

/**
 * Joins Path_Rows with their Progress_Rows. Unusable Path_Rows are left out
 * without an error, as are repeated Hobby_Ids; a path without a Progress_Row
 * has empty Progress.
 */
export function buildCloudPaths(pathRows: readonly unknown[], progressRows: readonly unknown[]): CloudPath[] {
  const progressByPath = new Map<string, unknown>()
  for (const row of progressRows) {
    if (isRecord(row) && typeof row.path_id === 'string') progressByPath.set(row.path_id, row)
  }
  const seen = new Set<string>()
  const paths: CloudPath[] = []
  for (const row of pathRows) {
    const path = parsePathRow(row)
    if (!path || seen.has(path.record.id)) continue
    seen.add(path.record.id)
    paths.push({ ...path, ...parseProgressRow(progressByPath.get(path.pathId), path.record.tree) })
  }
  return paths
}

/** The full Path_Row of a CloudPath, with its id and creation time (Undo). */
export function toPathInsertRow(userId: string, path: CloudPath): PathInsertRow {
  const { record } = path
  return {
    id: path.pathId,
    user_id: userId,
    hobby: record.tree.hobby,
    hobby_id: record.id,
    level: path.level,
    tree: record.tree,
    mascot_set: record.tree.mascot.set,
    model: record.model,
    archived: record.archived,
    created_at: new Date(record.addedAt).toISOString(),
  }
}

export function toProgressRow(
  pathId: string,
  userId: string,
  progress: Progress,
  completedAt: CompletedAt,
): ProgressWriteRow {
  return {
    path_id: pathId,
    user_id: userId,
    completed: [...progress.completed],
    quests: { ...progress.quests },
    completed_at: { ...completedAt },
  }
}
