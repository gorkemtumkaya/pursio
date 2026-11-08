import type { SkillNode, SkillTree } from '../types/skill-tree'
import type { GraphError } from '../types/validation'

type DuplicateError = Extract<GraphError, { kind: 'duplicate_id' }>
type MissingError = Extract<GraphError, { kind: 'missing_prerequisite' }>
type CycleError = Extract<GraphError, { kind: 'cycle' }>

/**
 * Checks the graph rules of a Skill_Tree: unique ids, existing prerequisites and no cycles.
 * Pure: reads the input only and returns a fresh list. An empty list means the tree is valid.
 * Order: duplicate_id, then missing_prerequisite, then cycle; within a kind by document
 * position of the first id named, ties in discovery order.
 */
export function validateSkillTree(tree: SkillTree): GraphError[] {
  const nodes: SkillNode[] = []
  for (const section of tree.sections) for (const node of section.nodes) nodes.push(node)

  // 1. Index: first-occurrence position and occurrence count per id.
  const position = new Map<string, number>()
  const occurrences = new Map<string, number>()
  nodes.forEach((node, index) => {
    if (!position.has(node.id)) position.set(node.id, index)
    occurrences.set(node.id, (occurrences.get(node.id) ?? 0) + 1)
  })
  const pos = (id: string): number => position.get(id) ?? Number.MAX_SAFE_INTEGER

  // 2. duplicate_id, once per repeated id. Map iteration follows first occurrence.
  const duplicates: DuplicateError[] = []
  for (const [id, count] of occurrences) {
    if (count > 1) duplicates.push({ kind: 'duplicate_id', id })
  }

  // 3. missing_prerequisite, once per distinct (node id, unknown id) pair.
  const missing: MissingError[] = []
  const seenPairs = new Set<string>()
  for (const node of nodes) {
    for (const prerequisiteId of node.prerequisites) {
      if (position.has(prerequisiteId)) continue
      const key = JSON.stringify([node.id, prerequisiteId])
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      missing.push({ kind: 'missing_prerequisite', nodeId: node.id, prerequisiteId })
    }
  }

  // 4. cycle: graph over unique known ids, edge prerequisite -> dependent.
  const ids = [...position.keys()]
  const edges = new Map<string, Set<string>>()
  for (const id of ids) edges.set(id, new Set())
  for (const node of nodes) {
    for (const prerequisiteId of node.prerequisites) {
      edges.get(prerequisiteId)?.add(node.id)
    }
  }
  const cycles: CycleError[] = []
  for (const component of stronglyConnectedComponents(ids, edges)) {
    const first = component[0]
    if (first === undefined) continue
    if (component.length === 1 && !edges.get(first)?.has(first)) continue
    let start = first
    for (const id of component) if (pos(id) < pos(start)) start = id
    const cycle = extractCycle(start, new Set(component), edges)
    if (cycle) cycles.push({ kind: 'cycle', nodeIds: cycle })
  }

  // 5. Sort within each kind (Array.prototype.sort is stable) and concatenate.
  missing.sort((a, b) => pos(a.nodeId) - pos(b.nodeId))
  cycles.sort((a, b) => pos(a.nodeIds[0] ?? '') - pos(b.nodeIds[0] ?? ''))
  return [...duplicates, ...missing, ...cycles]
}

/** Iterative Tarjan SCC. Roots are visited in the given order. */
function stronglyConnectedComponents(ids: string[], edges: Map<string, Set<string>>): string[][] {
  const index = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  let counter = 0

  for (const root of ids) {
    if (index.has(root)) continue
    const work: { id: string; next: Iterator<string> }[] = []
    const enter = (id: string): void => {
      index.set(id, counter)
      lowlink.set(id, counter)
      counter++
      stack.push(id)
      onStack.add(id)
      work.push({ id, next: (edges.get(id) ?? new Set<string>()).values() })
    }
    enter(root)
    while (work.length > 0) {
      const frame = work[work.length - 1]!
      const step = frame.next.next()
      if (!step.done) {
        const target = step.value
        if (!index.has(target)) {
          enter(target)
        } else if (onStack.has(target)) {
          lowlink.set(frame.id, Math.min(lowlink.get(frame.id)!, index.get(target)!))
        }
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent) lowlink.set(parent.id, Math.min(lowlink.get(parent.id)!, lowlink.get(frame.id)!))
      if (lowlink.get(frame.id) === index.get(frame.id)) {
        const component: string[] = []
        let member: string | undefined
        do {
          member = stack.pop()!
          onStack.delete(member)
          component.push(member)
        } while (member !== frame.id)
        components.push(component)
      }
    }
  }
  return components
}

/**
 * BFS from `start` inside one SCC until an edge returns to `start`, then reads the path back.
 * Returns ids ordered so each is a prerequisite of the next and the last of the first.
 */
function extractCycle(start: string, members: Set<string>, edges: Map<string, Set<string>>): string[] | null {
  const parent = new Map<string, string>()
  const visited = new Set<string>([start])
  const queue: string[] = [start]
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!
    for (const target of edges.get(current) ?? []) {
      if (!members.has(target)) continue
      if (target === start) {
        const path: string[] = [current]
        let id = current
        while (id !== start) {
          id = parent.get(id)!
          path.push(id)
        }
        return path.reverse()
      }
      if (visited.has(target)) continue
      visited.add(target)
      parent.set(target, current)
      queue.push(target)
    }
  }
  return null
}
