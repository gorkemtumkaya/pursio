import type { StartLevel } from './llm'
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

/** A Progress_Row as the client writes it. `updated_at` is set by the database. */
export interface ProgressWriteRow {
  path_id: string
  user_id: string
  completed: string[]
  quests: Record<string, QuestTriple<boolean>>
  completed_at: CompletedAt
}

export interface ProfileRow {
  id: string
  /** null means no name. */
  display_name: string | null
  theme: Theme
  created_at: string
}

export type DeleteErrorCode = 'unauthorized' | 'no_key' | 'delete_failed'

/** Body of `DELETE /api/account`. */
export type DeleteResponse = { ok: true } | { error: DeleteErrorCode }
