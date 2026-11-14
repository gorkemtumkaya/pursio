// Mapping between database rows and the app's shapes (spec: accounts-cloud-save).
import { z } from 'zod'
import type {
  CompletedAt,
  DailyPick,
  PathInsertRow,
  ProgressWriteRow,
  QuestData,
  QuestTicks,
  ResetSnapshot,
  WeeklyReward,
} from '#shared/types/cloud'
import type { Progress } from '#shared/types/progress'
import type { QuestTriple, SkillTree } from '#shared/types/skill-tree'
import { START_LEVELS } from '#shared/utils/llm'
import { emptyProgress } from '#shared/utils/progress-engine'
import { loadSkillTree } from '#shared/utils/skill-tree-load'
import { emptyQuestData, type CloudPath } from './cloud-library'
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
    ...emptyQuestData(),
  }
}

const progressRowSchema = storedProgressSchema.extend({
  completed_at: z.record(z.string(), z.number().finite()),
})

const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const tickTimeSchema = z.number().finite().nullable()
const questTicksSchema = z.record(z.string(), z.tuple([tickTimeSchema, tickTimeSchema, tickTimeSchema]))
const dailyPickSchema = z.object({
  day: dayKeySchema,
  quests: z
    .array(z.object({ id: z.string().min(1), index: z.union([z.literal(0), z.literal(1), z.literal(2)]) }))
    .max(3),
  bonus: z.boolean(),
})
const countSchema = z.number().int().nonnegative()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A Progress_Row as Progress, Completion_Timestamps and quest data for `tree`.
 * Duplicate completed ids collapse. Completed ids, quest entries, timestamps
 * and tick times of Nodes that are not in the tree are dropped. Timestamps and
 * tick times of Nodes in the tree are kept even when the Node is no longer
 * completed or ticked, because a keep-history reset leaves them (reset-progress
 * Req 3.6). All-null tick entries are dropped. Each quest column is read on its own: a bad
 * column reads as `{}`, `null` or 0 and never affects another column. A row
 * with a wrong shape gives empty Progress and empty quest data.
 */
export function parseProgressRow(
  raw: unknown,
  tree: SkillTree,
): { progress: Progress; completedAt: CompletedAt } & QuestData {
  const empty = { progress: emptyProgress(), completedAt: {}, ...emptyQuestData() }
  if (!isRecord(raw) || !progressRowSchema.safeParse(raw).success) return empty

  const ids = new Set(tree.sections.flatMap((section) => section.nodes.map((node) => node.id)))
  const completed = [...new Set(raw.completed as string[])].filter((id) => ids.has(id))
  // Rebuilt from the validated raw entries with Object.fromEntries, so keys such
  // as "__proto__" stay own properties.
  const quests = Object.fromEntries(
    Object.entries(raw.quests as Record<string, QuestTriple<boolean>>)
      .filter(([id]) => ids.has(id))
      .map(([id, [a, b, c]]): [string, QuestTriple<boolean>] => [id, [a, b, c]]),
  )
  const completedAt = Object.fromEntries(
    Object.entries(raw.completed_at as Record<string, number>).filter(([id]) => ids.has(id)),
  )
  return {
    progress: { completed, quests },
    completedAt,
    questTicks: readQuestTicks(raw.quest_ticks, ids),
    dailyPick: readDailyPick(raw.daily_pick, ids),
    dailyBonusCount: readCount(raw.daily_bonus_count),
  }
}

function readCount(value: unknown): number {
  const parsed = countSchema.safeParse(value)
  return parsed.success ? parsed.data : 0
}

function readQuestTicks(value: unknown, ids: ReadonlySet<string>): QuestTicks {
  const parsed = questTicksSchema.safeParse(value)
  if (!parsed.success) return {}
  const entries: [string, QuestTriple<number | null>][] = []
  for (const [id, [a, b, c]] of Object.entries(parsed.data)) {
    if (!ids.has(id)) continue
    if (a !== null || b !== null || c !== null) entries.push([id, [a, b, c]])
  }
  return Object.fromEntries(entries)
}

const snapshotSchema = z.object({
  rows: z.array(z.object({ path_id: z.string().min(1) }).passthrough()),
  reward: z.object({ week: dayKeySchema.nullable(), count: countSchema }).nullable(),
})

/** The `reset_progress` result as a ResetSnapshot, or `null` when its shape is wrong. */
export function parseResetSnapshot(raw: unknown): ResetSnapshot | null {
  const parsed = snapshotSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

function readDailyPick(value: unknown, ids: ReadonlySet<string>): DailyPick | null {
  const parsed = dailyPickSchema.safeParse(value)
  if (!parsed.success) return null
  const seen = new Set<string>()
  const quests = parsed.data.quests.filter((quest) => {
    const key = `${quest.id}:${quest.index}`
    if (!ids.has(quest.id) || seen.has(key)) return false
    seen.add(key)
    return true
  })
  return { day: parsed.data.day, quests, bonus: parsed.data.bonus }
}

/**
 * The account-wide weekly reward of a Profile_Row. `null` only when `row` is
 * not an object; a bad week reads as `null` and a bad count as 0.
 */
export function parseWeeklyReward(row: unknown): WeeklyReward | null {
  if (!isRecord(row)) return null
  const week = dayKeySchema.safeParse(row.weekly_reward_week)
  return { week: week.success ? week.data : null, count: readCount(row.weekly_reward_count) }
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
  quest: QuestData,
): ProgressWriteRow {
  return {
    path_id: pathId,
    user_id: userId,
    completed: [...progress.completed],
    quests: { ...progress.quests },
    completed_at: { ...completedAt },
    quest_ticks: { ...quest.questTicks },
    daily_pick: quest.dailyPick,
    daily_bonus_count: quest.dailyBonusCount,
  }
}
