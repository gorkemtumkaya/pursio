import type { SkillTree } from '../types/skill-tree'
import type { Result, ValidationError, VideoFieldsError } from '../types/validation'
import { repairSearchQueries, validateSearchQueries } from './search-queries'
import { parseSkillTree } from './skill-tree-schema'
import { validateSkillTree } from './skill-tree-validate'

export interface LoadSkillTreeOptions {
  /** Generation only: every skill must carry valid `searchQueries` and a boolean `quickTip`. */
  requireVideoFields?: boolean
}

/** Video field errors for every skill of a parsed tree (Req 1.10, 1.15). */
function videoFieldErrors(tree: SkillTree): VideoFieldsError[] {
  const errors: VideoFieldsError[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (node.searchQueries === undefined) {
        errors.push({ kind: 'video_fields', nodeId: node.id, field: 'searchQueries', issues: ['count'] })
      } else {
        const issues = validateSearchQueries(node.searchQueries, {
          hobby: tree.hobby,
          skillTitle: node.title,
          level: section.level,
        })
        if (issues.length > 0) {
          errors.push({ kind: 'video_fields', nodeId: node.id, field: 'searchQueries', issues })
        }
      }
      if (typeof node.quickTip !== 'boolean') {
        errors.push({ kind: 'video_fields', nodeId: node.id, field: 'quickTip', issues: [] })
      }
    }
  }
  return errors
}

/**
 * Loads unknown input as a Skill_Tree. Runs the schema first and returns its errors
 * without running the graph validator; otherwise returns the validator's errors or the tree.
 * With `requireVideoFields`, video field errors are added after the graph check.
 */
export function loadSkillTree(
  input: unknown,
  options: LoadSkillTreeOptions = {},
): Result<SkillTree, ValidationError[]> {
  const parsed = parseSkillTree(input)
  if (!parsed.ok) return parsed
  const tree = options.requireVideoFields === true ? withRepairedQueries(parsed.value) : parsed.value
  const errors: ValidationError[] = validateSkillTree(tree)
  if (options.requireVideoFields === true) errors.push(...videoFieldErrors(tree))
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: tree }
}

/** Generation only: fixes each skill's queries where it can (see `repairSearchQueries`). */
function withRepairedQueries(tree: SkillTree): SkillTree {
  return {
    ...tree,
    sections: tree.sections.map((section) => ({
      ...section,
      nodes: section.nodes.map((node) =>
        node.searchQueries === undefined
          ? node
          : {
              ...node,
              searchQueries: repairSearchQueries(node.searchQueries, {
                hobby: tree.hobby,
                skillTitle: node.title,
                level: section.level,
              }),
            },
      ),
    })),
  }
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
    case 'video_fields':
      if (error.field === 'quickTip') return `"${error.nodeId}": quickTip must be true or false`
      return `"${error.nodeId}": searchQueries invalid (${error.issues.join(', ')})`
  }
}
