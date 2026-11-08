// Property tests for the Tree_Schema (shared/utils/skill-tree-schema.ts).
// Each property has its own `describe` block.
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { parseSkillTree } from '../../shared/utils/skill-tree-schema'
import type { SkillNode, SkillTree } from '../../shared/types/skill-tree'
import { arbShapeTree } from '../arbitraries'

const RUNS = { numRuns: 200 }

// Feature: skill-path-ui, Property 1: Schema round trip
// **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.10**
describe('Property 1: Schema round trip', () => {
  it('parses the JSON of any shape-valid tree back to a deeply equal tree without throwing', () => {
    fc.assert(
      fc.property(arbShapeTree, (tree) => {
        const json: unknown = JSON.parse(JSON.stringify(tree))
        let result: ReturnType<typeof parseSkillTree> | undefined
        expect(() => {
          result = parseSkillTree(json)
        }).not.toThrow()
        expect(result).toEqual({ ok: true, value: tree })
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 2: Schema rejects every mismatch at its path
// **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
describe('Property 2: Schema rejects every mismatch at its path', () => {
  type Path = (string | number)[]
  /** One mutable leaf: its path and the bad values that may replace it. */
  interface Site {
    path: Path
    bad: fc.Arbitrary<unknown>
  }
  interface Mutation {
    path: Path
    value: unknown
  }

  const arbBlank = fc.constantFrom('', ' ', '   ', '\t', '\n', ' \t\n ')
  const arbNonString = fc.constantFrom<unknown>(0, 42, -1.5, true, false, null, [], {}, ['text'])
  const arbNonBoolean = fc.constantFrom<unknown>(0, 1, 'true', 'false', '', null, [], {})
  const arbNonList = fc.constantFrom<unknown>(0, 'list', true, null, {})
  const arbNonObject = fc.constantFrom<unknown>(0, 'mascot', true, null, [], ['set'])
  const arbBadText = fc.oneof(arbBlank, arbNonString)
  const arbBadLevel = fc.oneof(
    fc.constantFrom<unknown>('', 'Beginner', 'BEGINNER', 'expert', 'beginner ', 'novice'),
    arbNonString,
  )
  const arbBadQuests = fc.oneof(
    fc.array(fc.constant('Do the thing'), { maxLength: 2 }),
    fc.array(fc.constant('Do the thing'), { minLength: 4, maxLength: 6 }),
    arbNonList,
  )
  const arbBadNonEmptyList = fc.oneof(fc.constant<unknown>([]), arbNonList)

  function sitesOf(tree: SkillTree): Site[] {
    const sites: Site[] = [
      { path: ['hobby'], bad: arbBadText },
      { path: ['sections'], bad: arbBadNonEmptyList },
      { path: ['mascot'], bad: arbNonObject },
      { path: ['mascot', 'set'], bad: arbBadText },
    ]
    tree.sections.forEach((section, s) => {
      const sp: Path = ['sections', s]
      sites.push(
        { path: [...sp, 'title'], bad: arbBadText },
        { path: [...sp, 'level'], bad: arbBadLevel },
        { path: [...sp, 'nodes'], bad: arbBadNonEmptyList },
      )
      section.nodes.forEach((node, n) => {
        const np: Path = [...sp, 'nodes', n]
        sites.push(
          { path: [...np, 'id'], bad: arbBadText },
          { path: [...np, 'title'], bad: arbBadText },
          { path: [...np, 'description'], bad: arbBadText },
          { path: [...np, 'prerequisites'], bad: arbNonList },
          { path: [...np, 'optional'], bad: arbNonBoolean },
          { path: [...np, 'milestone'], bad: arbNonBoolean },
          { path: [...np, 'quests'], bad: arbBadQuests },
        )
        node.prerequisites.forEach((_, p) => {
          sites.push({ path: [...np, 'prerequisites', p], bad: arbNonString })
        })
        node.quests.forEach((_, q) => {
          sites.push({ path: [...np, 'quests', q], bad: arbBadText })
        })
      })
    })
    return sites
  }

  const isPrefix = (a: Path, b: Path): boolean => a.length <= b.length && a.every((key, i) => b[i] === key)

  /** Keeps mutations in order, dropping any whose path overlaps (is a prefix of, or extends) a kept one. */
  function independent(mutations: Mutation[]): Mutation[] {
    const kept: Mutation[] = []
    for (const mutation of mutations) {
      if (!kept.some(other => isPrefix(other.path, mutation.path) || isPrefix(mutation.path, other.path))) {
        kept.push(mutation)
      }
    }
    return kept
  }

  function setAt(root: unknown, path: Path, value: unknown): void {
    let target: unknown = root
    for (const key of path.slice(0, -1)) {
      target = (target as Record<string | number, unknown>)[key]
    }
    const last = path[path.length - 1]
    if (last !== undefined) (target as Record<string | number, unknown>)[last] = value
  }

  const arbMutatedTree = arbShapeTree.chain(tree =>
    fc
      .subarray(sitesOf(tree), { minLength: 1, maxLength: 6 })
      .chain(sites => fc.tuple(...sites.map(site => site.bad.map(value => ({ path: site.path, value })))))
      .map(mutations => {
        const kept = independent(mutations)
        const input: unknown = JSON.parse(JSON.stringify(tree))
        for (const mutation of kept) setAt(input, mutation.path, mutation.value)
        return { input, paths: kept.map(mutation => mutation.path) }
      }),
  )

  const key = (path: Path): string => JSON.stringify(path)

  it('reports exactly one error at each mutated path, without throwing', () => {
    fc.assert(
      fc.property(arbMutatedTree, ({ input, paths }) => {
        let result: ReturnType<typeof parseSkillTree> | undefined
        expect(() => {
          result = parseSkillTree(input)
        }).not.toThrow()
        expect(result?.ok).toBe(false)
        if (result === undefined || result.ok) return
        const errorPaths = result.errors.map(error => key(error.path)).sort()
        expect(errorPaths).toEqual(paths.map(key).sort())
      }),
      RUNS,
    )
  })

  it('rejects any non-object root with a single error at the empty path', () => {
    const arbNonObjectRoot = fc.oneof(
      fc.constant(null),
      fc.array(fc.jsonValue(), { maxLength: 4 }),
      fc.string(),
      fc.double(),
      fc.integer(),
      fc.boolean(),
    )
    fc.assert(
      fc.property(arbNonObjectRoot, (input) => {
        let result: ReturnType<typeof parseSkillTree> | undefined
        expect(() => {
          result = parseSkillTree(input)
        }).not.toThrow()
        expect(result?.ok).toBe(false)
        if (result === undefined || result.ok) return
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]?.path).toEqual([])
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 3: Unknown keys are dropped silently
// **Validates: Requirements 1.7**
describe('Property 3: Unknown keys are dropped silently', () => {
  type Extras = Record<string, unknown>

  // Every unknown key starts with `x_`. No schema field does, so names never
  // collide with real fields (or with `__proto__`).
  const arbUnknownKey = fc.stringMatching(/^[a-zA-Z0-9_]{0,10}$/).map(suffix => `x_${suffix}`)
  const arbExtras: fc.Arbitrary<Extras> = fc.dictionary(arbUnknownKey, fc.jsonValue(), { maxKeys: 3 })

  interface Decorated {
    tree: SkillTree
    input: unknown
    extraCount: number
  }

  const arbDecoratedTree: fc.Arbitrary<Decorated> = arbShapeTree.chain(tree =>
    fc
      .record({
        root: arbExtras,
        mascot: arbExtras,
        sections: fc.tuple(
          ...tree.sections.map(section =>
            fc.record({
              own: arbExtras,
              nodes: fc.tuple(...section.nodes.map(() => arbExtras)),
            }),
          ),
        ),
      })
      .map(({ root, mascot, sections }) => {
        const input = {
          ...root,
          ...tree,
          mascot: { ...mascot, ...tree.mascot },
          sections: tree.sections.map((section, s) => ({
            ...sections[s]?.own,
            ...section,
            nodes: section.nodes.map((node, n) => ({ ...sections[s]?.nodes[n], ...node })),
          })),
        }
        const extraCount = Object.keys(root).length
          + Object.keys(mascot).length
          + sections.reduce(
            (sum, section) =>
              sum + Object.keys(section.own).length
              + section.nodes.reduce((nodeSum, extras) => nodeSum + Object.keys(extras).length, 0),
            0,
          )
        const json: unknown = JSON.parse(JSON.stringify(input))
        return { tree, input: json, extraCount }
      }),
  )

  it('parses a tree with extra keys at root, mascot, Sections and Nodes to the tree without them', () => {
    fc.assert(
      fc.property(arbDecoratedTree, ({ tree, input }) => {
        let result: ReturnType<typeof parseSkillTree> | undefined
        expect(() => {
          result = parseSkillTree(input)
        }).not.toThrow()
        expect(result).toEqual({ ok: true, value: tree })
      }),
      RUNS,
    )
  })

  it('generates extra keys in most runs', () => {
    // Guards against a vacuous property: the generator must actually add keys.
    const counts = fc.sample(arbDecoratedTree, 100).map(sample => sample.extraCount)
    expect(counts.filter(count => count > 0).length).toBeGreaterThan(50)
  })
})

// Feature: skill-path-ui, Property 4: Schema ignores graph rules
// **Validates: Requirements 1.8**
describe('Property 4: Schema ignores graph rules', () => {
  // Never matches `arbId` (no underscore) or the tiny `a`/`b`/`c` pool.
  const UNKNOWN_ID = 'zz_unknown'

  interface Injection {
    duplicate: boolean
    unknown: boolean
    selfEdge: boolean
    cycle: boolean
    picks: [number, number, number]
  }

  const arbInjection: fc.Arbitrary<Injection> = fc.record({
    duplicate: fc.boolean(),
    unknown: fc.boolean(),
    selfEdge: fc.boolean(),
    cycle: fc.boolean(),
    picks: fc.tuple(fc.nat(), fc.nat(), fc.nat()),
  })

  /** Adds the chosen graph violations to a copy of `tree`. Shape stays valid. */
  function inject(source: SkillTree, injection: Injection): SkillTree {
    const tree = JSON.parse(JSON.stringify(source)) as SkillTree
    const nodes = tree.sections.flatMap(section => section.nodes)
    const [p0, p1, p2] = injection.picks
    const pick = (n: number) => nodes[n % nodes.length]
    if (injection.unknown) pick(p0)?.prerequisites.push(UNKNOWN_ID)
    if (injection.selfEdge) {
      const node = pick(p1)
      if (node) node.prerequisites.push(node.id)
    }
    if (injection.cycle) {
      const first = pick(p0)
      const second = pick(p2)
      if (first && second) {
        first.prerequisites.push(second.id)
        second.prerequisites.push(first.id)
      }
    }
    if (injection.duplicate) {
      const node = pick(p2)
      const section = tree.sections[p1 % tree.sections.length]
      if (node && section) section.nodes.push(JSON.parse(JSON.stringify(node)) as SkillNode)
    }
    return tree
  }

  // Half the runs use the raw generator, half force extra violations on top.
  const arbGraphBrokenTree: fc.Arbitrary<SkillTree> = fc.oneof(
    arbShapeTree,
    fc.tuple(arbShapeTree, arbInjection).map(([tree, injection]) => inject(tree, injection)),
  )

  interface Violations {
    duplicate: boolean
    unknown: boolean
    cycle: boolean
  }

  function violationsOf(tree: SkillTree): Violations {
    const nodes = tree.sections.flatMap(section => section.nodes)
    const ids = nodes.map(node => node.id)
    const known = new Set(ids)
    const edges = new Map<string, string[]>()
    for (const node of nodes) edges.set(node.id, [...(edges.get(node.id) ?? []), ...node.prerequisites])
    const state = new Map<string, 'open' | 'done'>()
    const visit = (id: string): boolean => {
      const current = state.get(id)
      if (current === 'open') return true
      if (current === 'done') return false
      state.set(id, 'open')
      const found = (edges.get(id) ?? []).some(next => known.has(next) && visit(next))
      state.set(id, 'done')
      return found
    }
    return {
      duplicate: known.size < ids.length,
      unknown: nodes.some(node => node.prerequisites.some(id => !known.has(id))),
      cycle: [...known].some(id => visit(id)),
    }
  }

  it('accepts trees with duplicate ids, unknown prerequisites and cycles unchanged', () => {
    fc.assert(
      fc.property(arbGraphBrokenTree, (tree) => {
        const json: unknown = JSON.parse(JSON.stringify(tree))
        let result: ReturnType<typeof parseSkillTree> | undefined
        expect(() => {
          result = parseSkillTree(json)
        }).not.toThrow()
        expect(result).toEqual({ ok: true, value: tree })
      }),
      RUNS,
    )
  })

  it('generates every kind of graph violation in a meaningful share of runs', () => {
    // Guards against a vacuous property: the trees must actually break graph rules.
    const samples = fc.sample(arbGraphBrokenTree, 200).map(violationsOf)
    const share = (kind: keyof Violations) => samples.filter(sample => sample[kind]).length / samples.length
    expect(share('duplicate')).toBeGreaterThan(0.25)
    expect(share('unknown')).toBeGreaterThan(0.25)
    expect(share('cycle')).toBeGreaterThan(0.25)
  })
})
