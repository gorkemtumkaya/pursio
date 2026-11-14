import { z } from 'zod'
import type { SkillTree } from '../types/skill-tree'
import type { Result, SchemaError } from '../types/validation'

/** A string with at least one non-whitespace character. */
const text = z.string().regex(/\S/, 'Must not be empty')

const nodeSchema = z.object({
  id: text,
  title: text,
  description: text,
  prerequisites: z.array(z.string()),
  optional: z.boolean(),
  milestone: z.boolean(),
  quests: z.tuple([text, text, text]),
  searchQueries: z.array(text).min(2).max(3).optional(),
  quickTip: z.boolean().optional(),
})

const sectionSchema = z.object({
  title: text,
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  nodes: z.array(nodeSchema).min(1),
})

/** Shape check for a Skill_Tree. Unknown keys are stripped. Graph rules are not checked here. */
export const skillTreeSchema = z.object({
  hobby: text,
  sections: z.array(sectionSchema).min(1),
  mascot: z.object({ set: text }),
})

// Compile-time drift check: `yarn typecheck` fails if the schema and `SkillTree` diverge.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const schemaMatchesTypes: Equals<z.infer<typeof skillTreeSchema>, SkillTree> = true
void schemaMatchesTypes

/** Parses unknown input as a Skill_Tree. Never throws; reports one error per zod issue. */
export function parseSkillTree(input: unknown): Result<SkillTree, SchemaError[]> {
  const result = skillTreeSchema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  const errors: SchemaError[] = result.error.issues.map((issue) => ({
    kind: 'schema',
    path: issue.path.map((key) => (typeof key === 'number' ? key : String(key))),
    message: issue.message,
  }))
  return { ok: false, errors }
}
