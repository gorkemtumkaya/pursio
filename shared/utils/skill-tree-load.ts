import type { SkillTree } from '../types/skill-tree'
import type { Result, ValidationError } from '../types/validation'
import { parseSkillTree } from './skill-tree-schema'
import { validateSkillTree } from './skill-tree-validate'

/**
 * Loads unknown input as a Skill_Tree. Runs the schema first and returns its errors
 * without running the graph validator; otherwise returns the validator's errors or the tree.
 */
export function loadSkillTree(input: unknown): Result<SkillTree, ValidationError[]> {
  const parsed = parseSkillTree(input)
  if (!parsed.ok) return parsed
  const errors = validateSkillTree(parsed.value)
  if (errors.length > 0) return { ok: false, errors }
  return parsed
}

/** One human-readable line per Validation_Error. A root schema error (empty path) is the message alone. */
export function formatValidationError(error: ValidationError): string {
  switch (error.kind) {
    case 'schema':
      return error.path.length > 0 ? `${error.path.join('.')}: ${error.message}` : error.message
    case 'duplicate_id':
      return `Duplicate id "${error.id}"`
    case 'missing_prerequisite':
      return `"${error.nodeId}" needs unknown skill "${error.prerequisiteId}"`
    case 'cycle': {
      const loop = error.nodeIds[0] === undefined ? error.nodeIds : [...error.nodeIds, error.nodeIds[0]]
      return `Prerequisite loop: ${loop.join(' → ')}`
    }
  }
}
