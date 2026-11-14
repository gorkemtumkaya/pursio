import type { PathSaveArgs, PathSaveInput } from '../types/cloud'
import { normalizeHobby } from './llm'

/**
 * The seven arguments of `save_generated_path`. The Hobby_Id is always computed
 * from the tree, as the client does, so both sides agree on it.
 */
export function buildSaveArgs(input: PathSaveInput): PathSaveArgs {
  return {
    p_hobby: input.hobby,
    p_hobby_id: normalizeHobby(input.tree.hobby),
    p_level: input.level,
    p_tree: input.tree,
    p_mascot_set: input.tree.mascot.set,
    p_model: input.model,
    p_goal_class: input.goalClass ?? 'none',
  }
}
