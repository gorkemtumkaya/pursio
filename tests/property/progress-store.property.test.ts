import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { Progress } from '../../shared/types/progress'
import type { QuestTriple, SkillTree } from '../../shared/types/skill-tree'
import {
  createProgressStore,
  parseStoredProgress,
  pruneProgress,
  progressStorageKey,
  serializeProgress,
  storedProgressSchema,
} from '../../app/utils/progress-store'
import type { StorageLike } from '../../app/utils/progress-store'
import { arbId, arbProgress, arbValidTree } from '../arbitraries'

const RUNS = { numRuns: 200 }

const arbTriple: fc.Arbitrary<QuestTriple<boolean>> = fc.tuple(fc.boolean(), fc.boolean(), fc.boolean())

/**
 * Any Progress matching the stored schema, not tied to a tree: arbitrary id
 * strings (including prototype-like keys), possibly duplicated completed ids.
 */
const arbSchemaProgress: fc.Arbitrary<Progress> = fc
  .record({
    completed: fc.array(fc.oneof(fc.string(), fc.constantFrom('__proto__', 'constructor', 'toString'))),
    entries: fc.uniqueArray(
      fc.tuple(fc.oneof(fc.string(), fc.constantFrom('__proto__', 'constructor', 'hasOwnProperty')), arbTriple),
      { selector: ([id]) => id, maxLength: 12 },
    ),
  })
  .map(({ completed, entries }) => ({ completed, quests: Object.fromEntries(entries) }))

const arbAnyProgress: fc.Arbitrary<Progress> = fc.oneof(arbValidTree.chain(arbProgress), arbSchemaProgress)

function questEntries(progress: Progress): [string, QuestTriple<boolean>][] {
  return Object.entries(progress.quests).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

// Feature: skill-path-ui, Property 23: Stored progress round trip
// **Validates: Requirements 10.7**
describe('Property 23: Stored progress round trip', () => {
  it('parseStoredProgress(serializeProgress(p)) keeps completed ids and quest triples', () => {
    fc.assert(
      fc.property(arbAnyProgress, (progress) => {
        const { progress: parsed, invalid } = parseStoredProgress(serializeProgress(progress))
        expect(invalid).toBe(false)
        expect(new Set(parsed.completed)).toEqual(new Set(progress.completed))
        expect(parsed.completed.length).toBe(new Set(progress.completed).size)
        expect(questEntries(parsed)).toEqual(questEntries(progress))
        expect(Object.getPrototypeOf(parsed.quests)).toBe(Object.prototype)
      }),
      RUNS,
    )
  })
})

function isJson(raw: string): boolean {
  try {
    JSON.parse(raw)
    return true
  } catch {
    return false
  }
}

/** Strings that `JSON.parse` rejects: random text plus truncated or mangled real payloads. */
const arbNonJson: fc.Arbitrary<string> = fc
  .oneof(
    fc.string(),
    fc.constantFrom('', '{', 'undefined', 'NaN', "{'completed':[]}", '{"completed":[],}'),
    arbSchemaProgress.chain((p) => {
      const raw = serializeProgress(p)
      return fc.nat({ max: raw.length - 1 }).map((cut) => raw.slice(0, cut))
    }),
  )
  .filter((raw) => !isJson(raw))

/** A wrong value for a field: anything JSON that is not the expected type. */
const arbNotStringArray = fc.jsonValue().filter((v) => !(Array.isArray(v) && v.every((x) => typeof x === 'string')))

/** JSON values that parse but don't match the stored schema, including near misses of the real shape. */
const arbBadShape: fc.Arbitrary<unknown> = fc
  .oneof(
    fc.jsonValue(),
    // completed has the wrong type.
    fc.record({ completed: arbNotStringArray, quests: fc.constant({}) }),
    // A quest entry is not a boolean triple.
    fc.record({
      completed: fc.array(fc.string()),
      quests: fc.dictionary(
        fc.string(),
        fc.oneof(
          fc.array(fc.boolean()).filter((a) => a.length !== 3),
          fc.tuple(fc.boolean(), fc.jsonValue(), fc.boolean()),
          fc.jsonValue(),
        ),
        { minKeys: 1 },
      ),
    }),
    // A required field is missing.
    fc.record({ completed: fc.array(fc.string()) }),
    fc.record({ quests: fc.constant({}) }),
  )
  .filter((v) => !storedProgressSchema.safeParse(JSON.parse(JSON.stringify(v) ?? 'null')).success)

const arbCorruptRaw: fc.Arbitrary<string> = fc.oneof(
  arbNonJson,
  arbBadShape.map((v) => JSON.stringify(v) ?? 'null'),
)

function fakeStorage(initial: Record<string, string>): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v)
    },
    removeItem: (k) => {
      data.delete(k)
    },
  }
}

// Feature: skill-path-ui, Property 24: Corrupt stored values fall back to empty
// **Validates: Requirements 10.4**
describe('Property 24: Corrupt stored values fall back to empty', () => {
  it('parseStoredProgress flags non-JSON and wrong-shape values as invalid and returns empty', () => {
    fc.assert(
      fc.property(arbCorruptRaw, (raw) => {
        const result = parseStoredProgress(raw)
        expect(result.invalid).toBe(true)
        expect(result.progress).toEqual({ completed: [], quests: {} })
      }),
      RUNS,
    )
  })

  it('createProgressStore(...).load() returns empty and removes the invalid value', () => {
    fc.assert(
      fc.property(arbValidTree, arbCorruptRaw, (tree, raw) => {
        const key = progressStorageKey(tree.hobby)
        const storage = fakeStorage({ [key]: raw, other: 'kept' })
        const progress = createProgressStore(() => storage, tree).load()
        expect(progress).toEqual({ completed: [], quests: {} })
        expect(storage.data.has(key)).toBe(false)
        expect(storage.data.get('other')).toBe('kept')
      }),
      RUNS,
    )
  })
})

interface PruneCase {
  tree: SkillTree
  known: Set<string>
  /** Tree-only Progress: what pruning should give back. */
  base: Progress
  /** `base` with foreign ids mixed into completed and quests. */
  mixed: Progress
}

/** Ids not in the tree: slug-like ids, arbitrary strings and prototype-like keys. */
function arbForeignId(known: Set<string>): fc.Arbitrary<string> {
  return fc
    .oneof(arbId, fc.string(), fc.constantFrom('__proto__', 'constructor', 'toString', 'hasOwnProperty'))
    .filter((id) => !known.has(id))
}

const arbPruneCase: fc.Arbitrary<PruneCase> = arbValidTree.chain((tree) => {
  const known = new Set(tree.sections.flatMap((s) => s.nodes.map((n) => n.id)))
  const foreign = arbForeignId(known)
  return arbProgress(tree).chain((base) =>
    fc
      .record({
        foreignCompleted: fc.array(foreign, { maxLength: 8 }),
        foreignQuests: fc.uniqueArray(fc.tuple(foreign, arbTriple), { selector: ([id]) => id, maxLength: 8 }),
      })
      .chain(({ foreignCompleted, foreignQuests }) => {
        const completedAll = [
          ...base.completed.map((id, i) => ({ id, rank: i })),
          ...foreignCompleted.map((id) => ({ id, rank: -1 })),
        ]
        const questAll = [
          ...Object.entries(base.quests).map((entry, i) => ({ entry, rank: i })),
          ...foreignQuests.map((entry) => ({ entry, rank: -1 })),
        ]
        return fc
          .record({
            completed: fc.shuffledSubarray(completedAll, { minLength: completedAll.length }),
            quests: fc.shuffledSubarray(questAll, { minLength: questAll.length }),
          })
          .map(({ completed, quests }) => {
            // Keep known items in their original relative order so "in order" is checkable.
            const orderedKnown = <T extends { rank: number }>(items: T[]): T[] => {
              const sorted = items.filter((x) => x.rank >= 0).sort((a, b) => a.rank - b.rank)
              let next = 0
              return items.map((x) => (x.rank >= 0 ? (sorted[next++] as T) : x))
            }
            return {
              tree,
              known,
              base,
              mixed: {
                completed: orderedKnown(completed).map((x) => x.id),
                quests: Object.fromEntries(orderedKnown(quests).map((x) => x.entry)),
              },
            }
          })
      }),
  )
})

// Feature: skill-path-ui, Property 25: Pruning keeps exactly the known ids
// **Validates: Requirements 10.5**
describe('Property 25: Pruning keeps exactly the known ids', () => {
  it('pruneProgress keeps tree-id entries unchanged and in order, and drops foreign ids', () => {
    fc.assert(
      fc.property(arbPruneCase, ({ tree, known, base, mixed }) => {
        const pruned = pruneProgress(mixed, tree)
        // Known entries kept, unchanged and in their input order.
        expect(pruned.completed).toEqual(mixed.completed.filter((id) => known.has(id)))
        expect(pruned.completed).toEqual(base.completed)
        expect(Object.entries(pruned.quests)).toEqual(Object.entries(mixed.quests).filter(([id]) => known.has(id)))
        expect(Object.entries(pruned.quests)).toEqual(Object.entries(base.quests))
        // Foreign ids dropped everywhere, without touching the prototype.
        expect(pruned.completed.every((id) => known.has(id))).toBe(true)
        expect(Object.keys(pruned.quests).every((id) => known.has(id))).toBe(true)
        expect(Object.getPrototypeOf(pruned.quests)).toBe(Object.prototype)
      }),
      RUNS,
    )
  })
})
