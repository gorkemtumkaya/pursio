import { z } from 'zod'
import { skillTreeSchema } from '../../shared/utils/skill-tree-schema'

/** A JSON schema node as plain data. */
export type JsonSchema = { [key: string]: unknown }

/** What the provider answered, mapped back from the wrapped Generation_Schema. */
export type Unwrapped = { kind: 'not_a_hobby' } | { kind: 'candidate'; value: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep equality for JSON data (key order ignored). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => jsonEqual(item, b[i]))
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length && keys.every((key) => key in b && jsonEqual(a[key], b[key]))
  }
  return false
}

function convert(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(convert)
  if (isRecord(value)) return toProviderSchema(value)
  return value
}

/** Turns a tuple (`prefixItems`, or draft-7 `items: [..]`) into a fixed-length array of one item schema. */
function collapseTuple(entries: unknown[], path: string): JsonSchema {
  const [first] = entries
  if (first === undefined) throw new Error(`Generation_Schema: empty tuple at ${path}`)
  if (!entries.every((entry) => jsonEqual(entry, first))) {
    throw new Error(`Generation_Schema: tuple entries differ at ${path}; mixed tuples are not supported`)
  }
  return { type: 'array', items: convert(first), minItems: entries.length, maxItems: entries.length }
}

/**
 * Makes a JSON schema safe for OpenAI strict mode and Anthropic tool input:
 * drops `$schema`, collapses tuples, and closes every object with all keys required.
 * `pattern`, `enum`, `minItems` and other keywords are kept as they are.
 */
export function toProviderSchema(node: JsonSchema, path = '#'): JsonSchema {
  const tuple = Array.isArray(node.prefixItems)
    ? node.prefixItems
    : Array.isArray(node.items)
      ? node.items
      : undefined
  if (tuple) {
    const { prefixItems: _p, items: _i, additionalItems: _a, minItems: _min, maxItems: _max, $schema: _s, ...rest } = node
    const collapsed = collapseTuple(tuple, path)
    const restConverted = toProviderSchema(rest, path)
    return { ...restConverted, ...collapsed }
  }

  const out: JsonSchema = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema') continue
    if (key === 'properties' && isRecord(value)) {
      const props: JsonSchema = {}
      for (const [name, sub] of Object.entries(value)) {
        props[name] = isRecord(sub) ? toProviderSchema(sub, `${path}/properties/${name}`) : sub
      }
      out[key] = props
    } else {
      out[key] = convert(value)
    }
  }

  if (out.type === 'object') {
    const props = isRecord(out.properties) ? out.properties : {}
    out.properties = props
    out.required = Object.keys(props)
    out.additionalProperties = false
  }
  return out
}

const notAHobbySchema: JsonSchema = {
  type: 'object',
  properties: { error: { type: 'string', enum: ['not_a_hobby'] } },
  required: ['error'],
  additionalProperties: false,
}

/** The Skill_Tree branch, derived from `skillTreeSchema` so schema changes flow through (Req 3.4). */
const treeBranch = toProviderSchema(z.toJSONSchema(skillTreeSchema) as JsonSchema)

/** Schema sent to providers: `{ result: Skill_Tree | { error: 'not_a_hobby' } }`. */
export const generationSchema: JsonSchema = {
  type: 'object',
  properties: {
    result: { anyOf: [treeBranch, notAHobbySchema] },
  },
  required: ['result'],
  additionalProperties: false,
}

/** Maps a provider value back to a Not_A_Hobby_Signal or a candidate for the Tree_Loader. */
export function unwrapGenerationOutput(value: unknown): Unwrapped {
  const inner = isRecord(value) && 'result' in value ? value.result : value
  if (isRecord(inner) && inner.error === 'not_a_hobby') return { kind: 'not_a_hobby' }
  return { kind: 'candidate', value: inner }
}
