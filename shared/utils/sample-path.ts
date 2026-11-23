// Sample_File checks and the Skill_Tree the path components draw (spec: sample-path, Requirement 2).
import { z } from 'zod'
import type { SamplePath, SampleSlug } from '../types/sample-path'
import type { SkillTree } from '../types/skill-tree'
import type { Result } from '../types/validation'

/** A string with at least one non-whitespace character. */
const text = z.string().regex(/\S/, 'Must not be empty')

const HOBBY_MAX = 60
const FINISH_MAX = 80

const videoSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'Must be an 11 character YouTube id'),
  title: text,
  channel: text,
  durationSeconds: z.number().int().positive(),
  thumbnailUrl: z.string().startsWith('https://i.ytimg.com/', 'Must be an https://i.ytimg.com/ URL'),
})

const skillSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Must be lower case letters, digits and hyphens'),
  title: text,
  desc: text,
  milestone: z.boolean(),
  quests: z.tuple([text, text, text]),
  videos: z.array(videoSchema),
})

const sectionSchema = z.strictObject({
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  name: text,
  skills: z.array(skillSchema).min(1),
})

/** Requirement 2.3. No upper bound on sections or skills: the page counts them (Req 2.5). */
export const samplePathSchema = z.strictObject({
  slug: z.enum(['photography', 'guitar', 'birdwatching']),
  hobby: text.max(HOBBY_MAX),
  mascot: text,
  finish: text.max(FINISH_MAX),
  sections: z.array(sectionSchema).min(1),
})

// Compile-time drift check: `yarn typecheck` fails if the schema and `SamplePath` diverge.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const schemaMatchesTypes: Equals<z.infer<typeof samplePathSchema>, SamplePath> = true
void schemaMatchesTypes

/**
 * Checks a Sample_File for `slug` (Req 2.3). Besides the schema: the file's `slug` equals the
 * expected one, and skill ids are unique across the file. Errors read "<path>: <message>".
 */
export function parseSamplePath(value: unknown, slug: SampleSlug): Result<SamplePath, string[]> {
  const parsed = samplePathSchema.safeParse(value)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`),
    }
  }
  const sample = parsed.data
  const errors: string[] = []
  if (sample.slug !== slug) errors.push(`slug: is "${sample.slug}", expected "${slug}"`)
  const seen = new Set<string>()
  for (const section of sample.sections) {
    for (const skill of section.skills) {
      if (seen.has(skill.id)) errors.push(`skills: id "${skill.id}" is used twice`)
      seen.add(skill.id)
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: sample }
}

/**
 * The Skill_Tree of a Sample (design "Types and schema"): sections and skills in file order, every
 * skill a main node whose only prerequisite is the skill before it, across sections.
 */
export function sampleToTree(sample: SamplePath): SkillTree {
  let previous: string | null = null
  return {
    hobby: sample.hobby,
    mascot: { set: sample.mascot },
    sections: sample.sections.map((section) => ({
      title: section.name,
      level: section.level,
      nodes: section.skills.map((skill) => {
        const prerequisites = previous === null ? [] : [previous]
        previous = skill.id
        return {
          id: skill.id,
          title: skill.title,
          description: skill.desc,
          prerequisites,
          optional: false,
          milestone: skill.milestone,
          quests: [...skill.quests],
        }
      }),
    })),
  }
}

/** Skills and sections, counted from the Sample (Req 2.5, 4.5). */
export function sampleCounts(sample: SamplePath): { skills: number; sections: number } {
  return {
    skills: sample.sections.reduce((sum, section) => sum + section.skills.length, 0),
    sections: sample.sections.length,
  }
}
