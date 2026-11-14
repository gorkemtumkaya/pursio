import type { Level } from '../types/skill-tree'

/** Terms of which at least one must appear in at least one query of a skill (Req 1.4 to 1.6). */
export const LEVEL_TERMS: Record<Level, readonly string[]> = {
  beginner: ['for beginners', 'first', 'basics'],
  intermediate: ['drills', 'technique', 'common mistakes'],
  advanced: ['advanced', 'training', 'breakdown'],
}

export type QueryIssue = 'count' | 'empty' | 'length' | 'name' | 'duplicate' | 'level_term'

function hasLevelTerm(queries: readonly string[], level: Level): boolean {
  const terms = LEVEL_TERMS[level]
  return queries.some((q) => {
    const lower = q.toLowerCase()
    return terms.some((term) => lower.includes(term))
  })
}

/**
 * Models often drop the level term. When no query has one, appends the level's first term to
 * the first query that stays within 100 characters, so one missing word does not reject a whole
 * path (Req 1.4 to 1.6 still hold). Returns the queries unchanged when they already have a term
 * or no query has room; `validateSearchQueries` then decides.
 */
export function addLevelTerm(queries: readonly string[], level: Level): string[] {
  if (hasLevelTerm(queries, level)) return [...queries]
  const term = LEVEL_TERMS[level][0]!
  const index = queries.findIndex((q) => {
    const trimmed = q.trim()
    return trimmed.length > 0 && trimmed.length + 1 + term.length <= MAX_LENGTH
  })
  if (index < 0) return [...queries]
  return queries.map((q, i) => (i === index ? `${q.trim()} ${term}` : q))
}

const MIN_QUERIES = 2
const MAX_QUERIES = 3
const MIN_LENGTH = 3
const MAX_LENGTH = 100
const MIN_WORD_LENGTH = 4

/** Words of at least 4 letters or digits, lowercased. Models often reword a title, so a shared word counts as naming it. */
function significantWords(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= MIN_WORD_LENGTH)
}

function namesHobbyOrSkill(lower: string, hobby: string, title: string, nameWords: readonly string[]): boolean {
  return (hobby.length > 0 && lower.includes(hobby))
    || (title.length > 0 && lower.includes(title))
    || nameWords.some((word) => lower.includes(word))
}

/**
 * Fixes the two misses models make most, so one query does not reject a whole path:
 * a query that names neither the hobby nor the skill gets the hobby put in front (when it
 * fits in 100 characters), then a missing level term is added (`addLevelTerm`). Anything
 * it cannot fix is left for `validateSearchQueries` to report.
 */
export function repairSearchQueries(
  queries: readonly string[],
  ctx: { hobby: string; skillTitle: string; level: Level },
): string[] {
  const hobbyText = ctx.hobby.trim()
  const hobby = hobbyText.toLowerCase()
  const title = ctx.skillTitle.trim().toLowerCase()
  const nameWords = [...significantWords(hobby), ...significantWords(title)]
  const named = queries.map((raw) => {
    const query = raw.trim()
    if (query.length === 0 || hobbyText.length === 0) return raw
    if (namesHobbyOrSkill(query.toLowerCase(), hobby, title, nameWords)) return raw
    const prefixed = `${hobbyText} ${query}`
    return prefixed.length <= MAX_LENGTH ? prefixed : raw
  })
  return addLevelTerm(named, ctx.level)
}

/**
 * Checks 2..3 queries, each 3..100 characters after trim, each containing the hobby or the
 * skill title, or a word of at least 4 letters from either (case-insensitive), pairwise distinct (case-insensitive), and at least one
 * level term for the skill's section level in at least one query. Returns each issue once;
 * an empty list means the queries are valid.
 */
export function validateSearchQueries(
  queries: readonly string[],
  ctx: { hobby: string; skillTitle: string; level: Level },
): QueryIssue[] {
  const issues = new Set<QueryIssue>()

  if (queries.length < MIN_QUERIES || queries.length > MAX_QUERIES) issues.add('count')

  const hobby = ctx.hobby.trim().toLowerCase()
  const title = ctx.skillTitle.trim().toLowerCase()
  const nameWords = [...significantWords(hobby), ...significantWords(title)]
  const seen = new Set<string>()

  for (const raw of queries) {
    const query = raw.trim()
    const lower = query.toLowerCase()

    if (query.length === 0) {
      issues.add('empty')
    } else if (query.length < MIN_LENGTH || query.length > MAX_LENGTH) {
      issues.add('length')
    }

    if (!namesHobbyOrSkill(lower, hobby, title, nameWords)) issues.add('name')

    if (seen.has(lower)) issues.add('duplicate')
    seen.add(lower)
  }

  if (!hasLevelTerm(queries, ctx.level)) issues.add('level_term')

  return [...issues]
}
