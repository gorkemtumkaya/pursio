// fast-check generators and small helpers shared by the skill-path-ui tests.
// Explicit relative imports only, so vitest loads this file without Nuxt.
import fc from 'fast-check'
import type { CompletedAt } from '../shared/types/cloud'
import type { StartLevel } from '../shared/types/llm'
import type { Progress } from '../shared/types/progress'
import type { Level, QuestTriple, Section, SkillNode, SkillTree } from '../shared/types/skill-tree'
import { normalizeHobby } from '../shared/utils/llm'
import { ACTIVITY_STORAGE_KEY } from '../app/utils/activity-store'
import type { CloudPath } from '../app/utils/cloud-library'
import { GENERATED_PROGRESS_KEY, GENERATED_TREE_KEY } from '../app/utils/generated-tree'
import { HOBBY_LIBRARY_KEY, hobbyProgressKey } from '../app/utils/hobby-store'

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

// ---------------------------------------------------------------------------
// accounts-cloud-save generators
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000

/** Fixed reference time. Generated timestamps lie in the 30 days before it. */
export const ARB_TIME_BASE = Date.UTC(2026, 0, 15, 12)

/** Epoch ms in the 30 days up to `ARB_TIME_BASE`. */
export const arbStamp: fc.Arbitrary<number> = fc.integer({ min: ARB_TIME_BASE - 30 * DAY_MS, max: ARB_TIME_BASE })

/** Non-empty model id. */
export const arbModelId: fc.Arbitrary<string> = fc.stringMatching(/^[a-z][a-z0-9.:/-]{0,19}$/)

export const arbStartLevel: fc.Arbitrary<StartLevel> = fc.constantFrom<StartLevel>('new', 'some', 'serious')

/**
 * One CloudPath: a valid tree, Progress valid for it and Completion_Timestamps
 * for some (not always all) of its completed Nodes. `record.id` is the Hobby_Id.
 */
export const arbCloudPath: fc.Arbitrary<CloudPath> = arbValidTree.chain(tree =>
  arbProgress(tree).chain((progress) => {
    const count = progress.completed.length
    return fc
      .record({
        pathId: fc.uuid(),
        model: arbModelId,
        addedAt: arbStamp,
        archived: fc.boolean(),
        level: arbStartLevel,
        stamps: fc.array(fc.option(arbStamp, { nil: null }), { minLength: count, maxLength: count }),
      })
      .map(({ pathId, model, addedAt, archived, level, stamps }): CloudPath => {
        const completedAt: CompletedAt = {}
        progress.completed.forEach((id, index) => {
          const stamp = stamps[index]
          if (stamp !== undefined && stamp !== null) completedAt[id] = stamp
        })
        return {
          pathId,
          record: { id: normalizeHobby(tree.hobby), tree, model, addedAt, archived },
          level,
          progress,
          completedAt,
        }
      })
  }),
)

const arbDistinctCloudPaths: fc.Arbitrary<CloudPath[]> = fc
  .uniqueArray(arbCloudPath, {
    maxLength: 5,
    comparator: (a, b) =>
      a.record.id === b.record.id || a.pathId === b.pathId || a.record.addedAt === b.record.addedAt,
  })
  .map(paths => [...paths].sort((a, b) => a.record.addedAt - b.record.addedAt))

/**
 * 0 to 5 CloudPaths with unique Hobby_Ids and Path_Row ids, in the order added
 * (distinct, rising `addedAt`). Half of the lists have no archived entry.
 */
export const arbCloudPaths: fc.Arbitrary<CloudPath[]> = fc.oneof(
  arbDistinctCloudPaths,
  arbDistinctCloudPaths.map(paths => paths.map(path => ({ ...path, record: { ...path.record, archived: false } }))),
)

/** A Completion_Log as stored: epoch ms in no particular order, repeats allowed. */
export const arbCompletionLog: fc.Arbitrary<number[]> = fc.array(arbStamp, { maxLength: 40 })

// --- Legacy_Data -----------------------------------------------------------

/** A valid entry as `readLegacyData` should return it. */
export interface LegacyExpectedEntry {
  id: string
  tree: SkillTree
  model: string
  archived: boolean
  /** `null` for the earlier Generated_Tree. */
  addedAt: number | null
  progress: Progress
}

export interface LegacyCase {
  /** localStorage contents, key to raw string. */
  storage: Record<string, string>
  /** The valid entries in import order: Hobby_Library order, then the earlier Generated_Tree. */
  entries: LegacyExpectedEntry[]
  /** The entry matching the stored `activeId`, else the first valid entry, else `null`. */
  activeHobbyId: string | null
  /** The Completion_Log as stored; empty when the key is absent or unreadable. */
  log: number[]
}

type StoredProgressKind = 'absent' | 'valid' | 'dirty' | 'corrupt'

interface LegacySeed {
  tree: SkillTree
  model: string
  addedAt: number
  /** `null` leaves the `archived` field out of the stored entry. */
  archived: boolean | null
  progress: Progress
  progressKind: StoredProgressKind
}

/** Never a Node id of a generated tree: ids there are lower-case slugs. */
const FOREIGN_NODE_ID = 'Not A Node'

const arbLegacySeed: fc.Arbitrary<LegacySeed> = arbValidTree.chain(tree =>
  fc.record({
    tree: fc.constant(tree),
    model: arbModelId,
    addedAt: arbStamp,
    archived: fc.constantFrom<boolean | null>(true, false, null),
    progress: arbProgress(tree),
    progressKind: fc.constantFrom<StoredProgressKind>('absent', 'valid', 'valid', 'dirty', 'corrupt'),
  }),
)

function storedProgress(seed: LegacySeed): string | null {
  const { completed, quests } = seed.progress
  switch (seed.progressKind) {
    case 'absent':
      return null
    case 'valid':
      return JSON.stringify({ completed, quests })
    case 'dirty':
      // Foreign ids and a repeated id: pruned and collapsed on load.
      return JSON.stringify({
        completed: [FOREIGN_NODE_ID, ...completed, ...completed.slice(0, 1)],
        quests: { ...quests, [FOREIGN_NODE_ID]: [true, false, true] },
      })
    case 'corrupt':
      return '{"completed":"nope"}'
  }
}

function expectedProgress(seed: LegacySeed): Progress {
  return seed.progressKind === 'valid' || seed.progressKind === 'dirty' ? seed.progress : { completed: [], quests: {} }
}

/** Library entries that must be left out: wrong shapes, no model, trees the Tree_Loader rejects. */
const arbInvalidLegacyEntry: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom<unknown>(null, 'text', 42, [], {}),
  arbLegacySeed.map(({ tree, addedAt }): unknown => ({ id: normalizeHobby(tree.hobby), tree, model: '', addedAt })),
  arbLegacySeed.map(({ tree, addedAt }): unknown => ({ id: normalizeHobby(tree.hobby), tree, addedAt })),
  arbLegacySeed.map(({ tree, model, addedAt }): unknown => ({ tree: { ...tree, sections: [] }, model, addedAt })),
  arbLegacySeed.map(({ tree, model, addedAt }): unknown => {
    // A duplicated Node id.
    const [first, ...rest] = tree.sections
    const node = first?.nodes[0]
    const sections = first && node ? [{ ...first, nodes: [...first.nodes, node] }, ...rest] : []
    return { tree: { ...tree, sections }, model, addedAt }
  }),
  arbLegacySeed.map(({ tree, model, addedAt }): unknown => {
    // An unknown prerequisite.
    const [first, ...rest] = tree.sections
    const [node, ...others] = first?.nodes ?? []
    const sections = first && node
      ? [{ ...first, nodes: [{ ...node, prerequisites: [FOREIGN_NODE_ID] }, ...others] }, ...rest]
      : []
    return { tree: { ...tree, sections }, model, addedAt }
  }),
)

type LegacySlot = { kind: 'valid', seed: LegacySeed } | { kind: 'invalid', value: unknown }

const arbLegacySlot: fc.Arbitrary<LegacySlot> = fc.oneof(
  { weight: 3, arbitrary: arbLegacySeed.map((seed): LegacySlot => ({ kind: 'valid', seed })) },
  { weight: 2, arbitrary: arbInvalidLegacyEntry.map((value): LegacySlot => ({ kind: 'invalid', value })) },
)

type LegacyActive = { kind: 'absent' } | { kind: 'valid', pick: number } | { kind: 'unknown' } | { kind: 'number' }

const arbLegacyActive: fc.Arbitrary<LegacyActive> = fc.oneof(
  fc.constant<LegacyActive>({ kind: 'absent' }),
  fc.nat().map((pick): LegacyActive => ({ kind: 'valid', pick })),
  fc.nat().map((pick): LegacyActive => ({ kind: 'valid', pick })),
  fc.constant<LegacyActive>({ kind: 'unknown' }),
  fc.constant<LegacyActive>({ kind: 'number' }),
)

type LegacyGenerated
  = | { kind: 'absent' }
    | { kind: 'valid', seed: LegacySeed }
    | { kind: 'copy', pick: number }
    | { kind: 'invalid', seed: LegacySeed }
    | { kind: 'corrupt' }

const arbLegacyGenerated: fc.Arbitrary<LegacyGenerated> = fc.oneof(
  { weight: 3, arbitrary: fc.constant<LegacyGenerated>({ kind: 'absent' }) },
  { weight: 3, arbitrary: arbLegacySeed.map((seed): LegacyGenerated => ({ kind: 'valid', seed })) },
  { weight: 1, arbitrary: fc.nat().map((pick): LegacyGenerated => ({ kind: 'copy', pick })) },
  { weight: 1, arbitrary: arbLegacySeed.map((seed): LegacyGenerated => ({ kind: 'invalid', seed })) },
  { weight: 1, arbitrary: fc.constant<LegacyGenerated>({ kind: 'corrupt' }) },
)

type LegacyLog = { kind: 'absent' } | { kind: 'valid', values: number[] } | { kind: 'corrupt' }

/**
 * localStorage contents of an earlier version together with what an import
 * should see in them. The stored Hobby_Library mixes valid entries with ones
 * that must be left out (wrong shape, no model, rejected tree, repeated
 * Hobby_Id); its `activeId` is absent, names a valid entry, or names nothing
 * usable. The earlier Generated_Tree, per-entry Progress and the
 * Completion_Log are each present, absent or unreadable. The stored
 * `activeId` never names the Generated_Tree alone.
 */
export const arbLegacyData: fc.Arbitrary<LegacyCase> = fc
  .record({
    slots: fc.uniqueArray(arbLegacySlot, {
      maxLength: 5,
      comparator: (a, b) =>
        a.kind === 'valid'
        && b.kind === 'valid'
        && normalizeHobby(a.seed.tree.hobby) === normalizeHobby(b.seed.tree.hobby),
    }),
    libraryKind: fc.constantFrom<'json' | 'absent' | 'corrupt'>('json', 'json', 'json', 'json', 'json', 'absent', 'corrupt'),
    repeatFirst: fc.boolean(),
    active: arbLegacyActive,
    generated: arbLegacyGenerated,
    log: fc.oneof(
      fc.constant<LegacyLog>({ kind: 'absent' }),
      arbCompletionLog.map((values): LegacyLog => ({ kind: 'valid', values })),
      arbCompletionLog.map((values): LegacyLog => ({ kind: 'valid', values })),
      fc.constant<LegacyLog>({ kind: 'corrupt' }),
    ),
  })
  .map(({ slots, libraryKind, repeatFirst, active, generated, log }): LegacyCase => {
    const storage: Record<string, string> = {}
    const entries: LegacyExpectedEntry[] = []
    let activeHobbyId: string | null = null

    if (libraryKind === 'corrupt') storage[HOBBY_LIBRARY_KEY] = '{not json'
    if (libraryKind === 'json') {
      const hobbies: unknown[] = []
      for (const slot of slots) {
        if (slot.kind === 'invalid') {
          hobbies.push(slot.value)
          continue
        }
        const { seed } = slot
        const id = normalizeHobby(seed.tree.hobby)
        hobbies.push({
          id,
          tree: seed.tree,
          model: seed.model,
          addedAt: seed.addedAt,
          ...(seed.archived === null ? {} : { archived: seed.archived }),
        })
        entries.push({
          id,
          tree: seed.tree,
          model: seed.model,
          archived: seed.archived === true,
          addedAt: seed.addedAt,
          progress: expectedProgress(seed),
        })
        const raw = storedProgress(seed)
        if (raw !== null) storage[hobbyProgressKey(id)] = raw
      }
      const first = entries[0]
      if (repeatFirst && first) {
        // Same Hobby_Id again, later in the list: only the first one counts.
        hobbies.push({
          id: first.id,
          tree: { ...first.tree, hobby: first.tree.hobby.toUpperCase() },
          model: 'repeated-model',
          addedAt: ARB_TIME_BASE,
        })
      }
      let storedActive: unknown
      if (active.kind === 'valid') {
        activeHobbyId = entries[active.pick % Math.max(entries.length, 1)]?.id ?? null
        storedActive = activeHobbyId ?? undefined
      }
      else if (active.kind === 'unknown') {
        storedActive = 'No Such Hobby'
      }
      else if (active.kind === 'number') {
        storedActive = 7
      }
      storage[HOBBY_LIBRARY_KEY] = JSON.stringify({
        hobbies,
        ...(storedActive === undefined ? {} : { activeId: storedActive }),
      })
    }

    if (generated.kind === 'corrupt') storage[GENERATED_TREE_KEY] = '{'
    if (generated.kind === 'invalid') {
      storage[GENERATED_TREE_KEY] = JSON.stringify({ tree: generated.seed.tree, model: '' })
    }
    if (generated.kind === 'copy') {
      const original = entries[generated.pick % Math.max(entries.length, 1)]
      if (original) {
        storage[GENERATED_TREE_KEY] = JSON.stringify({ tree: original.tree, model: 'generated-copy' })
        storage[GENERATED_PROGRESS_KEY] = JSON.stringify({ completed: [], quests: {} })
      }
    }
    if (generated.kind === 'valid') {
      const { seed } = generated
      const id = normalizeHobby(seed.tree.hobby)
      storage[GENERATED_TREE_KEY] = JSON.stringify({ tree: seed.tree, model: seed.model })
      const raw = storedProgress(seed)
      if (raw !== null) storage[GENERATED_PROGRESS_KEY] = raw
      if (!entries.some(entry => entry.id === id)) {
        entries.push({
          id,
          tree: seed.tree,
          model: seed.model,
          archived: false,
          addedAt: null,
          progress: expectedProgress(seed),
        })
      }
    }

    if (log.kind === 'corrupt') storage[ACTIVITY_STORAGE_KEY] = '{"completions":"none"}'
    if (log.kind === 'valid') storage[ACTIVITY_STORAGE_KEY] = JSON.stringify({ completions: log.values })

    return {
      storage,
      entries,
      activeHobbyId: activeHobbyId ?? entries[0]?.id ?? null,
      log: log.kind === 'valid' ? log.values : [],
    }
  })

// --- Rate_Limiter ----------------------------------------------------------

export interface RateRequest {
  userId: string
  /** Epoch ms; never lower than the request before it. */
  time: number
}

/**
 * Requests of a few user ids with non-decreasing times. Gaps are mostly short,
 * so single users pass 10 requests inside one hour, with some gaps around the
 * one-hour window.
 */
export const arbRequestSequence: fc.Arbitrary<RateRequest[]> = fc
  .record({
    start: fc.integer({ min: 0, max: ARB_TIME_BASE }),
    steps: fc.array(
      fc.record({
        userId: fc.constantFrom('user-a', 'user-a', 'user-b', 'user-c'),
        gap: fc.oneof(
          { weight: 6, arbitrary: fc.constant(0) },
          { weight: 16, arbitrary: fc.integer({ min: 1, max: 5_000 }) },
          { weight: 2, arbitrary: fc.integer({ min: 60_000, max: 900_000 }) },
          { weight: 1, arbitrary: fc.constantFrom(3_599_999, 3_600_000, 3_600_001) },
        ),
      }),
      { maxLength: 120, size: 'max' },
    ),
  })
  .map(({ start, steps }) => {
    let time = start
    return steps.map(({ userId, gap }): RateRequest => {
      time += gap
      return { userId, time }
    })
  })

// --- Auth ------------------------------------------------------------------

type AuthFailureKind = 'account_exists' | 'failed'

export interface CallbackUrlCase {
  url: string
  expected: AuthFailureKind | null
}

const arbParamValue: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9_ .+&=#-]{0,16}$/)

const CALLBACK_EXISTS_CODES = ['identity_already_exists', 'email_exists']

interface CallbackErrors {
  params: Record<string, string>
  expected: AuthFailureKind | null
}

const arbCallbackErrors: fc.Arbitrary<CallbackErrors> = fc.oneof(
  fc.constant<CallbackErrors>({ params: {}, expected: null }),
  fc
    .record(
      {
        error_code: fc.constantFrom(...CALLBACK_EXISTS_CODES),
        error: fc.constantFrom('server_error', 'access_denied'),
        error_description: arbParamValue,
      },
      { requiredKeys: ['error_code'] },
    )
    .map((params): CallbackErrors => ({ params, expected: 'account_exists' })),
  fc
    .record(
      {
        error: fc.oneof(fc.constantFrom('access_denied', 'server_error'), arbParamValue),
        error_code: fc
          .oneof(fc.constantFrom('otp_expired', 'bad_oauth_state', 'unexpected_failure'), arbParamValue)
          .filter(code => !CALLBACK_EXISTS_CODES.includes(code)),
        error_description: arbParamValue,
      },
      { requiredKeys: [] },
    )
    // A description alone is not covered by the property; keep an error or a code.
    .filter(params => params.error !== undefined || params.error_code !== undefined)
    .map((params): CallbackErrors => ({ params, expected: 'failed' })),
)

const arbOtherParams: fc.Arbitrary<Record<string, string>> = fc.dictionary(
  fc.constantFrom('code', 'hobby', 'type', 'access_token', 'refresh_token', 'state', 'next'),
  arbParamValue,
  { maxKeys: 3 },
)

/**
 * A callback URL, absolute or relative, with Supabase's error parameters in
 * the query or in the hash (or without any), next to unrelated parameters.
 */
export const arbCallbackUrl: fc.Arbitrary<CallbackUrlCase> = fc
  .record({
    base: fc.constantFrom('https://pursio.app/auth/callback', 'http://localhost:3000/path', '/path', '/', '/profile'),
    errors: arbCallbackErrors,
    where: fc.constantFrom<'query' | 'hash'>('query', 'hash'),
    errorsFirst: fc.boolean(),
    otherQuery: arbOtherParams,
    otherHash: arbOtherParams,
  })
  .map(({ base, errors, where, errorsFirst, otherQuery, otherHash }): CallbackUrlCase => {
    const encode = (other: Record<string, string>, withErrors: boolean): string => {
      const mine = withErrors ? Object.entries(errors.params) : []
      const rest = Object.entries(other)
      return new URLSearchParams(errorsFirst ? [...mine, ...rest] : [...rest, ...mine]).toString()
    }
    const query = encode(otherQuery, where === 'query')
    const hash = encode(otherHash, where === 'hash')
    return {
      url: `${base}${query === '' ? '' : `?${query}`}${hash === '' ? '' : `#${hash}`}`,
      expected: errors.expected,
    }
  })

export interface AuthErrorCase {
  error: unknown
  expected: AuthFailureKind
}

/** Codes `classifyAuthError` reads as "this account already exists". */
const AUTH_EXISTS_CODES = [...CALLBACK_EXISTS_CODES, 'user_already_exists']

function withCode(code: string, message: string): unknown {
  return Object.assign(new Error(message), { code })
}

/**
 * Thrown or returned auth errors: plain objects and Error instances with an
 * "already exists" code, with any other code, with a code that is not a
 * string, and values that are not error objects at all.
 */
export const arbAuthError: fc.Arbitrary<AuthErrorCase> = fc.oneof(
  fc
    .record({
      code: fc.constantFrom(...AUTH_EXISTS_CODES),
      message: fc.string(),
      status: fc.constantFrom(400, 409, 422),
      asError: fc.boolean(),
    })
    .map(({ code, message, status, asError }): AuthErrorCase => ({
      error: asError ? withCode(code, message) : { code, message, status },
      expected: 'account_exists',
    })),
  fc
    .record({
      code: fc
        .oneof(fc.constantFrom('otp_expired', 'over_email_send_rate_limit', 'validation_failed', ''), fc.string())
        .filter(code => !AUTH_EXISTS_CODES.includes(code)),
      message: fc.constantFrom(...AUTH_EXISTS_CODES, 'User already registered'),
      asError: fc.boolean(),
    })
    .map(({ code, message, asError }): AuthErrorCase => ({
      error: asError ? withCode(code, message) : { code, message },
      expected: 'failed',
    })),
  fc
    .constantFrom(...AUTH_EXISTS_CODES)
    .chain(code =>
      fc.constantFrom<unknown>(
        code,
        [code],
        { code: [code] },
        { code: { code } },
        { error_code: code },
        { message: code },
        { name: code },
        new Error(code),
      ),
    )
    .map((error): AuthErrorCase => ({ error, expected: 'failed' })),
  fc
    .anything()
    .filter((value) => {
      if (typeof value !== 'object' || value === null) return true
      const code: unknown = Reflect.get(value, 'code')
      return typeof code !== 'string' || !AUTH_EXISTS_CODES.includes(code)
    })
    .map((error): AuthErrorCase => ({ error, expected: 'failed' })),
)
