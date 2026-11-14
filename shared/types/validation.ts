export type Result<T, E> = { ok: true; value: T } | { ok: false; errors: E }

export interface SchemaError {
  kind: 'schema'
  path: (string | number)[]
  message: string
}

export type GraphError =
  | { kind: 'duplicate_id'; id: string }
  | { kind: 'missing_prerequisite'; nodeId: string; prerequisiteId: string }
  | { kind: 'cycle'; nodeIds: string[] }

/**
 * A generated skill is missing its video fields or has invalid ones (generation only).
 * `issues` holds query issue codes for `searchQueries`; it is empty for `quickTip`.
 */
export interface VideoFieldsError {
  kind: 'video_fields'
  nodeId: string
  field: 'searchQueries' | 'quickTip'
  issues: string[]
}

export type ValidationError = SchemaError | GraphError | VideoFieldsError
