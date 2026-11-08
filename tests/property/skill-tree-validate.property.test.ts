// Property tests for validateSkillTree (spec: skill-path-ui, Properties 5–10).
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { SkillTree } from '../../shared/types/skill-tree'
import type { GraphError } from '../../shared/types/validation'
import { validateSkillTree } from '../../shared/utils/skill-tree-validate'
import { allNodes, arbId, arbShapeTree, arbValidTree, descendantsOf, documentPositions } from '../arbitraries'

const RUNS = { numRuns: 200 }

// Feature: skill-path-ui, Property 5: Valid trees produce no graph errors
// **Validates: Requirements 2.6, 2.7**
describe('Property 5: Valid trees produce no graph errors', () => {
  it('returns an empty list for every tree with unique ids, known prerequisites and no cycles', () => {
    fc.assert(
      fc.property(arbValidTree, (tree) => {
        expect(validateSkillTree(tree)).toEqual([])
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 6: Duplicated ids are reported once each
// **Validates: Requirements 2.1, 2.8**
describe('Property 6: Duplicated ids are reported once each', () => {
  const arbTreeWithCopies = arbValidTree
    .filter(tree => tree.sections.reduce((sum, section) => sum + section.nodes.length, 0) >= 2)
    .chain(tree => fc.tuple(
      fc.constant(tree),
      fc.array(fc.tuple(fc.nat(), fc.nat()), { minLength: 1, maxLength: 6 }),
    ))

  it('returns exactly one duplicate_id error per distinct repeated id, naming that id', () => {
    fc.assert(
      fc.property(arbTreeWithCopies, ([original, copies]) => {
        const tree = structuredClone(original)
        const nodes = tree.sections.flatMap(section => section.nodes)
        for (const [rawTarget, rawSource] of copies) {
          const target = nodes[rawTarget % nodes.length]!
          // Pick a source different from the target so every copy creates a repeat.
          const source = nodes[(rawTarget + 1 + (rawSource % (nodes.length - 1))) % nodes.length]!
          target.id = source.id
        }

        const counts = new Map<string, number>()
        for (const node of nodes) counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
        const repeated = [...counts].filter(([, count]) => count > 1).map(([id]) => id)
        expect(repeated.length).toBeGreaterThan(0)

        const reported = validateSkillTree(tree)
          .flatMap(error => (error.kind === 'duplicate_id' ? [error.id] : []))
        expect(reported).toHaveLength(new Set(reported).size)
        expect([...reported].sort()).toEqual([...repeated].sort())
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 7: Unknown prerequisites are reported per pair and never as cycles
// **Validates: Requirements 2.2, 2.4, 2.9**
describe('Property 7: Unknown prerequisites are reported per pair and never as cycles', () => {
  // arbId ids are at most 12 characters, so this 15-character prefix keeps every
  // generated unknown id absent from the tree. The small pool makes repeated pairs likely.
  const arbUnknownId = fc.oneof(arbId, fc.constantFrom('a', 'b')).map(id => `unknown-prereq-${id}`)
  const arbTreeWithUnknowns = fc.tuple(
    arbValidTree,
    fc.array(fc.tuple(fc.nat(), arbUnknownId), { minLength: 1, maxLength: 8 }),
  )

  it('returns one missing_prerequisite error per distinct (node, unknown id) pair and no cycle error', () => {
    fc.assert(
      fc.property(arbTreeWithUnknowns, ([original, additions]) => {
        const tree = structuredClone(original)
        const nodes = tree.sections.flatMap(section => section.nodes)
        const expected = new Set<string>()
        for (const [rawTarget, unknownId] of additions) {
          const node = nodes[rawTarget % nodes.length]!
          node.prerequisites.push(unknownId)
          expected.add(JSON.stringify([node.id, unknownId]))
        }

        const errors = validateSkillTree(tree)
        const reported = errors.flatMap(error =>
          error.kind === 'missing_prerequisite' ? [JSON.stringify([error.nodeId, error.prerequisiteId])] : [],
        )
        expect(reported).toHaveLength(new Set(reported).size)
        expect([...reported].sort()).toEqual([...expected].sort())
        expect(errors.some(error => error.kind === 'cycle')).toBe(false)
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 8: Added back edges are reported as well-formed cycles
// **Validates: Requirements 2.3, 2.10**
describe('Property 8: Added back edges are reported as well-formed cycles', () => {
  const arbTreeWithBackEdge = fc.tuple(arbValidTree, fc.nat(), fc.nat())

  it('reports a cycle naming X and D, and every cycle error is well formed', () => {
    fc.assert(
      fc.property(arbTreeWithBackEdge, ([original, rawSource, rawTarget]) => {
        const tree = structuredClone(original)
        const nodes = allNodes(tree)
        const source = nodes[rawSource % nodes.length]!
        // Candidates: X itself (self loop) plus every descendant of X.
        const candidates = [source.id, ...descendantsOf(tree, source.id)]
        const targetId = candidates[rawTarget % candidates.length]!
        // X lists D as a prerequisite, closing a cycle D -> ... -> X -> D.
        source.prerequisites.push(targetId)

        const byId = new Map(nodes.map(node => [node.id, node]))
        const cycles = validateSkillTree(tree).flatMap(error => (error.kind === 'cycle' ? [error.nodeIds] : []))

        expect(cycles.some(ids => ids.includes(source.id) && ids.includes(targetId))).toBe(true)
        for (const ids of cycles) {
          expect(ids.length).toBeGreaterThan(0)
          expect(new Set(ids).size).toBe(ids.length)
          ids.forEach((id, index) => {
            const next = ids[(index + 1) % ids.length]!
            // `id` is a prerequisite of `next`; the wrap-around covers last -> first.
            expect(byId.get(next)?.prerequisites).toContain(id)
          })
        }
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 9: Errors are complete and ordered
// **Validates: Requirements 2.5**
describe('Property 9: Errors are complete and ordered', () => {
  const KIND_RANK = { duplicate_id: 0, missing_prerequisite: 1, cycle: 2 } as const
  const arbUnknownId = arbId.map(id => `unknown-prereq-${id}`)

  // Valid trees with a random mix of the Property 6, 7 and 8 mutations,
  // plus loose shape trees that often break several rules on their own.
  const arbMutatedTree = fc
    .tuple(
      arbValidTree,
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 3 }),
      fc.array(fc.tuple(fc.nat(), arbUnknownId), { maxLength: 4 }),
      fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 4 }),
    )
    .map(([original, backEdges, unknowns, copies]) => {
      const tree = structuredClone(original)
      const nodes = allNodes(tree)
      for (const [rawSource, rawTarget] of backEdges) {
        const source = nodes[rawSource % nodes.length]!
        const candidates = [source.id, ...descendantsOf(tree, source.id)]
        source.prerequisites.push(candidates[rawTarget % candidates.length]!)
      }
      for (const [rawTarget, unknownId] of unknowns) {
        nodes[rawTarget % nodes.length]!.prerequisites.push(unknownId)
      }
      if (nodes.length >= 2) {
        for (const [rawTarget, rawSource] of copies) {
          const target = nodes[rawTarget % nodes.length]!
          const source = nodes[(rawTarget + 1 + (rawSource % (nodes.length - 1))) % nodes.length]!
          target.id = source.id
        }
      }
      return tree
    })
  const arbBrokenTree = fc.oneof(arbMutatedTree, arbShapeTree)

  /** Independent check: Kahn's algorithm over unique known ids, edge prerequisite -> dependent. */
  function hasCycle(tree: SkillTree): boolean {
    const nodes = allNodes(tree)
    const known = new Set(nodes.map(node => node.id))
    const edges = new Set<string>()
    const inDegree = new Map<string, number>([...known].map(id => [id, 0]))
    const out = new Map<string, string[]>()
    for (const node of nodes) {
      for (const prerequisite of node.prerequisites) {
        if (!known.has(prerequisite)) continue
        const key = JSON.stringify([prerequisite, node.id])
        if (edges.has(key)) continue
        edges.add(key)
        inDegree.set(node.id, inDegree.get(node.id)! + 1)
        out.set(prerequisite, [...(out.get(prerequisite) ?? []), node.id])
      }
    }
    const queue = [...known].filter(id => inDegree.get(id) === 0)
    let removed = 0
    while (queue.length > 0) {
      const id = queue.pop()!
      removed++
      for (const next of out.get(id) ?? []) {
        const degree = inDegree.get(next)! - 1
        inDegree.set(next, degree)
        if (degree === 0) queue.push(next)
      }
    }
    return removed < known.size
  }

  const firstId = (error: GraphError): string =>
    error.kind === 'duplicate_id' ? error.id : error.kind === 'missing_prerequisite' ? error.nodeId : error.nodeIds[0] ?? ''

  it('lists duplicates, then missing prerequisites, then cycles, each complete and sorted by document position', () => {
    fc.assert(
      fc.property(arbBrokenTree, (tree) => {
        const errors = validateSkillTree(tree)
        const positions = documentPositions(tree)
        const nodes = allNodes(tree)

        // Kind order and within-kind position order.
        for (let i = 1; i < errors.length; i++) {
          const previous = errors[i - 1]!
          const current = errors[i]!
          expect(KIND_RANK[previous.kind]).toBeLessThanOrEqual(KIND_RANK[current.kind])
          if (previous.kind === current.kind) {
            expect(positions.get(firstId(previous))!).toBeLessThanOrEqual(positions.get(firstId(current))!)
          }
        }

        // Oracle: repeated ids.
        const counts = new Map<string, number>()
        for (const node of nodes) counts.set(node.id, (counts.get(node.id) ?? 0) + 1)
        const expectedDuplicates = [...counts].filter(([, count]) => count > 1).map(([id]) => id).sort()
        const reportedDuplicates = errors.flatMap(error => (error.kind === 'duplicate_id' ? [error.id] : []))
        expect([...reportedDuplicates].sort()).toEqual(expectedDuplicates)

        // Oracle: distinct (node id, unknown id) pairs.
        const expectedMissing = new Set<string>()
        for (const node of nodes) {
          for (const prerequisite of node.prerequisites) {
            if (!positions.has(prerequisite)) expectedMissing.add(JSON.stringify([node.id, prerequisite]))
          }
        }
        const reportedMissing = errors.flatMap(error =>
          error.kind === 'missing_prerequisite' ? [JSON.stringify([error.nodeId, error.prerequisiteId])] : [],
        )
        expect([...reportedMissing].sort()).toEqual([...expectedMissing].sort())

        // Oracle: at least one cycle error exactly when the known-id graph has a cycle.
        expect(errors.some(error => error.kind === 'cycle')).toBe(hasCycle(tree))
      }),
      RUNS,
    )
  })
})

// Feature: skill-path-ui, Property 10: Validator is pure
// **Validates: Requirements 2.11**
describe('Property 10: Validator is pure', () => {
  it('leaves the input unchanged and returns equal lists for equal inputs', () => {
    fc.assert(
      fc.property(arbShapeTree, (tree) => {
        const snapshot = structuredClone(tree)

        const first = validateSkillTree(tree)
        expect(tree).toEqual(snapshot)

        const onClone = validateSkillTree(structuredClone(tree))
        expect(onClone).toEqual(first)

        const second = validateSkillTree(tree)
        expect(second).toEqual(first)
        expect(tree).toEqual(snapshot)
      }),
      RUNS,
    )
  })
})
