// fast-check generators and small helpers shared by the skill-path-ui tests.
// Explicit relative imports only, so vitest loads this file without Nuxt.
import fc from 'fast-check'
import type { Progress } from '../shared/types/progress'
import type { Level, QuestTriple, Section, SkillNode, SkillTree } from '../shared/types/skill-tree'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Every Node in document order (Section order, then Node order). */
export function allNodes(tree: SkillTree): SkillNode[] {
  return tree.sections.flatMap(section => section.nodes)
}

/** Document position of each id (first occurrence wins for duplicated ids). */
export function documentPositions(tree: SkillTree): Map<string, number> {
  const positions = new Map<string, number>()
  allNodes(tree).forEach((node, index) => {
    if (!positions.has(node.id)) positions.set(node.id, index)
  })
  return positions
}

/** Main_Nodes (`optional: false`) in document order. */
export function mainNodes(tree: SkillTree): SkillNode[] {
  return allNodes(tree).filter(node => !node.optional)
}

/** Side_Quest_Nodes (`optional: true`) in document order. */
export function sideQuestNodes(tree: SkillTree): SkillNode[] {
  return allNodes(tree).filter(node => node.optional)
}

/**
 * Ids of every Node that has `id` among its direct or indirect prerequisites.
 * The Node itself is not included unless it lies on a cycle through itself.
 */
export function descendantsOf(tree: SkillTree, id: string): Set<string> {
  const dependents = new Map<string, string[]>()
  for (const node of allNodes(tree)) {
    for (const prerequisite of node.prerequisites) {
      const list = dependents.get(prerequisite) ?? []
      list.push(node.id)
      dependents.set(prerequisite, list)
    }
  }
  const seen = new Set<string>()
  const stack = [...(dependents.get(id) ?? [])]
  while (stack.length > 0) {
    const next = stack.pop()
    if (next === undefined || seen.has(next)) continue
    seen.add(next)
    stack.push(...(dependents.get(next) ?? []))
  }
  return seen
}

// ---------------------------------------------------------------------------
// Leaf arbitraries
// ---------------------------------------------------------------------------

/** Non-blank text, matching the schema's `/\S/` rule. */
export const arbText: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 24 })
  .filter(value => /\S/.test(value))

/** Slug-like Node id. */
export const arbId: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/)

export const arbLevel: fc.Arbitrary<Level> = fc.constantFrom<Level>('beginner', 'intermediate', 'advanced')

const arbQuests: fc.Arbitrary<QuestTriple<string>> = fc.tuple(arbText, arbText, arbText)

const arbSectionSizes: fc.Arbitrary<number[]> = fc.array(fc.integer({ min: 1, max: 15 }), {
  minLength: 1,
  maxLength: 3,
})

interface SectionMeta {
  title: string
  level: Level
}

const arbSectionMeta: fc.Arbitrary<SectionMeta> = fc.record({ title: arbText, level: arbLevel })

interface NodeSeed {
  title: string
  description: string
  quests: QuestTriple<string>
  optional: boolean
  milestone: boolean
  /** Raw picks, reduced modulo the candidate count when building prerequisites. */
  picks: number[]
  /** Path trees: anchor a side quest on the latest earlier Main_Node. */
  anchorRecent: boolean
}

const arbNodeSeed: fc.Arbitrary<NodeSeed> = fc.record({
  title: arbText,
  description: arbText,
  quests: arbQuests,
  optional: fc.boolean(),
  milestone: fc.boolean(),
  picks: fc.array(fc.nat(), { maxLength: 3 }),
  anchorRecent: fc.oneof({ weight: 3, arbitrary: fc.constant(true) }, { weight: 1, arbitrary: fc.constant(false) }),
})

function uniquePicks<T>(picks: number[], candidates: T[]): T[] {
  if (candidates.length === 0) return []
  const chosen: T[] = []
  for (const pick of picks) {
    const candidate = candidates[pick % candidates.length]
    if (candidate !== undefined && !chosen.includes(candidate)) chosen.push(candidate)
  }
  return chosen
}

function splitIntoSections(nodes: SkillNode[], sizes: number[], metas: SectionMeta[]): Section[] {
  const sections: Section[] = []
  let offset = 0
  sizes.forEach((size, index) => {
    const meta = metas[index] ?? { title: `Section ${index + 1}`, level: 'beginner' }
    sections.push({ title: meta.title, level: meta.level, nodes: nodes.slice(offset, offset + size) })
    offset += size
  })
  return sections
}

const arbTreeMeta = fc.record({ hobby: arbText, mascotSet: arbText })

// ---------------------------------------------------------------------------
// Tree arbitraries
// ---------------------------------------------------------------------------

/**
 * Shape-valid Skill_Trees. Ids come partly from a tiny pool and prerequisites
 * are arbitrary strings, so trees may contain duplicate ids, unknown
 * prerequisites and cycles.
 */
export const arbShapeTree: fc.Arbitrary<SkillTree> = (() => {
  const arbLooseId = fc.oneof(arbId, fc.constantFrom('a', 'b', 'c'))
  const arbNode: fc.Arbitrary<SkillNode> = fc.record({
    id: arbLooseId,
    title: arbText,
    description: arbText,
    prerequisites: fc.array(arbLooseId, { maxLength: 3 }),
    optional: fc.boolean(),
    milestone: fc.boolean(),
    quests: arbQuests,
  })
  const arbSection: fc.Arbitrary<Section> = fc.record({
    title: arbText,
    level: arbLevel,
    nodes: fc.array(arbNode, { minLength: 1, maxLength: 15 }),
  })
  return fc.record({
    hobby: arbText,
    sections: fc.array(arbSection, { minLength: 1, maxLength: 3 }),
    mascot: fc.record({ set: arbText }),
  })
})()

interface TopoOptions {
  /** Main_Nodes may only list earlier Main_Nodes (in topological order). */
  mainFromMainOnly: boolean
}

/**
 * Builds Nodes in a random topological order, then shuffles them across
 * Sections, so prerequisites may point to later Nodes but never form a cycle.
 */
function arbShuffledDag(options: TopoOptions): fc.Arbitrary<SkillTree> {
  return arbSectionSizes.chain((sizes) => {
    const total = sizes.reduce((sum, size) => sum + size, 0)
    return fc
      .record({
        meta: arbTreeMeta,
        sectionMetas: fc.array(arbSectionMeta, { minLength: sizes.length, maxLength: sizes.length }),
        ids: fc.uniqueArray(arbId, { minLength: total, maxLength: total }),
        seeds: fc.array(arbNodeSeed, { minLength: total, maxLength: total }),
        order: fc.shuffledSubarray(
          Array.from({ length: total }, (_, index) => index),
          { minLength: total, maxLength: total },
        ),
      })
      .map(({ meta, sectionMetas, ids, seeds, order }) => {
        const topo: SkillNode[] = []
        seeds.forEach((seed, k) => {
          const earlier = topo.filter(node => !options.mainFromMainOnly || seed.optional || !node.optional)
          topo.push({
            id: ids[k] ?? `n${k}`,
            title: seed.title,
            description: seed.description,
            prerequisites: uniquePicks(seed.picks, earlier).map(node => node.id),
            optional: seed.optional,
            milestone: seed.milestone,
            quests: seed.quests,
          })
        })
        const documentOrder = order.map(index => topo[index]).filter((node): node is SkillNode => node !== undefined)
        return {
          hobby: meta.hobby,
          sections: splitIntoSections(documentOrder, sizes, sectionMetas),
          mascot: { set: meta.mascotSet },
        }
      })
  })
}

/** 1–3 Sections, 1–15 Nodes each, unique ids, acyclic; prerequisites may point later. */
export const arbValidTree: fc.Arbitrary<SkillTree> = arbShuffledDag({ mainFromMainOnly: false })

/** Valid trees where no Main_Node has a Side_Quest_Node among its direct or indirect prerequisites. */
export const arbLinearMainTree: fc.Arbitrary<SkillTree> = arbShuffledDag({ mainFromMainOnly: true })

/**
 * Valid trees satisfying the path order precondition:
 * P1, every prerequisite of a Main_Node is an earlier Main_Node;
 * P2, every prerequisite of a Side_Quest_Node is an earlier Node.
 * Every side quest has at least one prerequisite, usually the latest earlier
 * Main_Node, so several side quests often share an anchor. Some Sections end
 * with a Milestone_Node (always a Main_Node); milestones appear nowhere else.
 */
export const arbPathTree: fc.Arbitrary<SkillTree> = arbSectionSizes.chain((sizes) => {
  const total = sizes.reduce((sum, size) => sum + size, 0)
  return fc
    .record({
      meta: arbTreeMeta,
      sectionMetas: fc.array(arbSectionMeta, { minLength: sizes.length, maxLength: sizes.length }),
      endsWithMilestone: fc.array(fc.boolean(), { minLength: sizes.length, maxLength: sizes.length }),
      ids: fc.uniqueArray(arbId, { minLength: total, maxLength: total }),
      seeds: fc.array(arbNodeSeed, { minLength: total, maxLength: total }),
      sideRolls: fc.array(fc.integer({ min: 0, max: 9 }), { minLength: total, maxLength: total }),
    })
    .map(({ meta, sectionMetas, endsWithMilestone, ids, seeds, sideRolls }) => {
      const lastIndexOfSection = new Map<number, number>()
      let offset = 0
      sizes.forEach((size, sectionIndex) => {
        offset += size
        lastIndexOfSection.set(offset - 1, sectionIndex)
      })

      const nodes: SkillNode[] = []
      seeds.forEach((seed, k) => {
        const sectionIndex = lastIndexOfSection.get(k)
        const isMilestone = sectionIndex !== undefined && endsWithMilestone[sectionIndex] === true
        // A side quest needs an earlier Node to anchor on, so Node 0 is always main.
        const optional = !isMilestone && k > 0 && (sideRolls[k] ?? 9) < 3
        const earlierMains = nodes.filter(node => !node.optional)
        let prerequisites: string[]
        if (optional) {
          const latestMain = earlierMains[earlierMains.length - 1]
          const anchor = seed.anchorRecent && latestMain !== undefined
            ? latestMain
            : nodes[(seed.picks[0] ?? 0) % nodes.length]
          const extras = uniquePicks(seed.picks.slice(1, 2), nodes).filter(node => node !== anchor)
          prerequisites = [anchor, ...extras]
            .filter((node): node is SkillNode => node !== undefined)
            .map(node => node.id)
        }
        else {
          prerequisites = uniquePicks(seed.picks, earlierMains).map(node => node.id)
        }
        nodes.push({
          id: ids[k] ?? `n${k}`,
          title: seed.title,
          description: seed.description,
          prerequisites,
          optional,
          milestone: isMilestone,
          quests: seed.quests,
        })
      })
      return {
        hobby: meta.hobby,
        sections: splitIntoSections(nodes, sizes, sectionMetas),
        mascot: { set: meta.mascotSet },
      }
    })
})

/**
 * Progress for a tree: a random subset of its ids as `completed` (in random
 * order) plus random quest triples for a random subset of ids.
 */
export function arbProgress(tree: SkillTree): fc.Arbitrary<Progress> {
  const ids = [...new Set(allNodes(tree).map(node => node.id))]
  const arbTriple: fc.Arbitrary<QuestTriple<boolean>> = fc.tuple(fc.boolean(), fc.boolean(), fc.boolean())
  return fc
    .record({
      completed: fc.shuffledSubarray(ids),
      questIds: fc.subarray(ids),
      triples: fc.array(arbTriple, { minLength: ids.length, maxLength: ids.length }),
    })
    .map(({ completed, questIds, triples }) => {
      const quests: Record<string, QuestTriple<boolean>> = {}
      questIds.forEach((id, index) => {
        const triple = triples[index]
        if (triple !== undefined) quests[id] = triple
      })
      return { completed, quests }
    })
}
