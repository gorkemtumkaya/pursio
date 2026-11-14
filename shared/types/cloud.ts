import type { StartLevel } from './llm'
import type { QuestId } from './progress'
import type { QuestTriple, SkillTree } from './skill-tree'
import type { Theme } from './theme'

/** What the Tree_Route saves for the verified user. */
export interface PathSaveInput {
  /** The request's trimmed hobby. */
  hobby: string
  level: StartLevel
  tree: SkillTree
  model: string
}

/** Arguments of the `save_generated_path` database function. */
export interface PathSaveArgs {
  p_hobby: string
  p_hobby_id: string
  p_level: StartLevel
  p_tree: SkillTree
  p_mascot_set: string
  p_model: string
}

/** Completion_Timestamps: Node id to epoch ms. */
export type CompletedAt = Record<string, number>

/** A full Path_Row as the client inserts it (legacy import and Undo). */
export interface PathInsertRow {
  id: string
  user_id: string
  hobby: string
  hobby_id: string
  level: StartLevel
  tree: SkillTree
  mascot_set: string
  model: string
  archived: boolean
  /** ISO 8601 time. */
  created_at: string
}

/** Tick_Times: Node id to one time per quest, null when that quest has none. All-null entries are left out. */
export type QuestTicks = Record<string, QuestTriple<number | null>>

export interface DailyPick {
  /** Local_Day, `YYYY-MM-DD`. */
  day: string
  /** At most 3 Quest_Ids, in the order shown. */
  quests: QuestId[]
  /** True once the Daily_Bonus of this pick was granted. */
  bonus: boolean
}

/** What a tick changes on one path besides Progress and Completion_Timestamps. */
export interface QuestData {
  questTicks: QuestTicks
  dailyPick: DailyPick | null
  dailyBonusCount: number
}

/** Account-wide. `week` is a Week_Key, or null when never granted. */
export interface WeeklyReward {
  week: string | null
  count: number
}

/** A Progress_Row as the client writes it. `updated_at` is set by the database. */
export interface ProgressWriteRow {
  path_id: string
  user_id: string
  completed: string[]
  quests: Record<string, QuestTriple<boolean>>
  completed_at: CompletedAt
  quest_ticks: QuestTicks
  daily_pick: DailyPick | null
  daily_bonus_count: number
}

export interface ProfileRow {
  id: string
  /** null means no name. */
  display_name: string | null
  theme: Theme
  created_at: string
  weekly_reward_week: string | null
  weekly_reward_count: number
}

export interface ProfilePatch {
  theme?: Theme
  display_name?: string | null
  weekly_reward_week?: string | null
  weekly_reward_count?: number
}

export type ResetScope = 'path' | 'all'
export type ResetMode = 'wipe' | 'keep_history'

/** One overwritten Progress_Row as `reset_progress` returns it. Other columns are kept as read. */
export interface ResetSnapshotRow {
  path_id: string
  [column: string]: unknown
}

/** What Undo needs. `reward` is the Weekly_Reward before the reset, or null when the reset did not touch it. */
export interface ResetSnapshot {
  rows: ResetSnapshotRow[]
  reward: WeeklyReward | null
}

export type DeleteErrorCode = 'unauthorized' | 'no_key' | 'delete_failed'

/** Body of `DELETE /api/account`. */
export type DeleteResponse = { ok: true } | { error: DeleteErrorCode }
