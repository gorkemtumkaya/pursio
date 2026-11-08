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

export type ValidationError = SchemaError | GraphError
