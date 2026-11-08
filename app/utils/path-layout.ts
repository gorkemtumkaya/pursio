/**
 * Path_Layout: maps a Skill_Tree onto the winding trail.
 *
 * elkjs computes a layered top-to-bottom ordering; fixed per-viewport
 * constants (`LAYOUT_CONFIG`) turn that ordering into positions.
 * Explicit imports only, so vitest loads this file without Nuxt.
 */
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api'
import type { SkillNode, SkillTree } from '#shared/types/skill-tree'
import type { Result } from '#shared/types/validation'
import type { ViewportClass } from '#shared/types/viewport'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A point in path coordinates: x relative to the center line, y from the top of the path area. */
export interface Point { x: number; y: number }

export type NodeKind = 'main' | 'milestone' | 'side'

export interface NodePlacement { id: string; kind: NodeKind; cx: number; cy: number; size: number }

export interface HeaderPlacement { sectionIndex: number; top: number; height: number }

export interface TrailSegment { fromId: string; toId: string; dots: [Point, Point, Point] }

export interface PathLayout {
  viewport: ViewportClass
  nodes: Record<string, NodePlacement>
  mainOrder: string[]
  headers: HeaderPlacement[]
  segments: TrailSegment[]
  height: number
  dotDiameter: number
  ringPad: number
}

export type LayoutError =
  | { kind: 'unsupported_order'; nodeId: string; prerequisiteId: string }
  | { kind: 'layout_failed'; message: string }

/** The part of the elkjs API the layout needs, so a worker build can be injected later. */
export interface ElkLike { layout(graph: ElkNode): Promise<ElkNode> }

/** Fixed layout constants for one viewport class (all px). */
export interface LayoutConfig {
  /** Main_Node center offsets from the center line, indexed by `i % 4` (Req 5.2). */
  windingOffsets: readonly [number, number, number, number]
  /** Vertical distance between consecutive Main_Node centers in a Section (Req 5.4). */
  rowGap: number
  /** Side_Quest_Node center offset from the center line (Req 5.5). */
  sideX: number
  /** Square bounding box sides per Node kind (Req 5.6). */
  size: Readonly<Record<NodeKind, number>>
  /** Fixed Section_Header band height. */
  headerHeight: number
  /** Top of the first Section_Header band. */
  headerTop: number
  /** Header band bottom to first Main_Node center. */
  sectionLead: number
  /** Last Main_Node center to next header band top. */
  sectionTail: number
  /** Space reserved below a Side_Quest_Node box for its label. */
  sideLabelReserve: number
  /** Minimum vertical space between Side_Quest_Node footprints. */
  sideGap: number
  /** Space below the lowest footprint. */
  bottomPadding: number
  /** Trail dot diameter (Req 6.1). */
  dotDiameter: number
  /** Gap between a Node box and its Progress_Ring. */
  ringPad: number
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const LAYOUT_CONFIG: Readonly<Record<ViewportClass, LayoutConfig>> = {
  mobile: {
    windingOffsets: [0, -60, -90, -60],
    rowGap: 112,
    sideX: 110,
    size: { main: 72, milestone: 84, side: 64 },
    headerHeight: 104,
    headerTop: 16,
    sectionLead: 92,
    sectionTail: 76,
    sideLabelReserve: 40,
    sideGap: 12,
    bottomPadding: 120,
    dotDiameter: 8,
    ringPad: 9,
  },
  desktop: {
    windingOffsets: [0, -90, -135, -90],
    rowGap: 124,
    sideX: 170,
    size: { main: 80, milestone: 92, side: 70 },
    headerHeight: 120,
    headerTop: 8,
    sectionLead: 104,
    sectionTail: 84,
    sideLabelReserve: 44,
    sideGap: 12,
    bottomPadding: 64,
    dotDiameter: 10,
    ringPad: 10,
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Placement kind of a Node. An optional milestone is placed as a side quest. */
export function nodeKind(node: SkillNode): NodeKind {
  if (node.optional) return 'side'
  return node.milestone ? 'milestone' : 'main'
}

/** Every Node in document order (Section order, then Node order), first occurrence per id. */
function uniqueNodes(tree: SkillTree): SkillNode[] {
  const seen = new Set<string>()
  const nodes: SkillNode[] = []
  for (const section of tree.sections) {
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      nodes.push(node)
    }
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Path order precondition
// ---------------------------------------------------------------------------

/**
 * Checks the layout-only precondition (design "Path order precondition"):
 * - P1: every prerequisite of a Main_Node is an earlier Main_Node.
 * - P2: every prerequisite of a Side_Quest_Node is an earlier Node.
 * Returns the first offending (node, prerequisite) pair in document order, or null.
 */
export function checkPathOrder(tree: SkillTree): LayoutError | null {
  const earlier = new Map<string, SkillNode>()
  for (const node of uniqueNodes(tree)) {
    for (const prerequisiteId of node.prerequisites) {
      const prerequisite = earlier.get(prerequisiteId)
      const ok = prerequisite !== undefined && (node.optional || !prerequisite.optional)
      if (!ok) return { kind: 'unsupported_order', nodeId: node.id, prerequisiteId }
    }
    earlier.set(node.id, node)
  }
  return null
}

// ---------------------------------------------------------------------------
// ELK graph
// ---------------------------------------------------------------------------

export const ELK_LAYOUT_OPTIONS: Readonly<Record<string, string>> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.randomSeed': '1',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
}

/**
 * Builds the elkjs input graph: one child per unique id (document order, square
 * boxes from `cfg.size`), a `prerequisite → node` edge per prerequisite link,
 * then trail edges between consecutive Main_Nodes in document order.
 * Prerequisites that name no Node are skipped; `checkPathOrder` reports them.
 */
export function buildElkGraph(tree: SkillTree, cfg: LayoutConfig): ElkNode {
  const nodes = uniqueNodes(tree)
  const ids = new Set(nodes.map(node => node.id))

  const children: ElkNode[] = nodes.map((node) => {
    const side = cfg.size[nodeKind(node)]
    return { id: node.id, width: side, height: side }
  })

  const edges: ElkExtendedEdge[] = []
  for (const node of nodes) {
    const seen = new Set<string>()
    for (const prerequisiteId of node.prerequisites) {
      if (!ids.has(prerequisiteId) || seen.has(prerequisiteId)) continue
      seen.add(prerequisiteId)
      edges.push({ id: `prereq:${prerequisiteId}->${node.id}`, sources: [prerequisiteId], targets: [node.id] })
    }
  }

  const mains = nodes.filter(node => !node.optional)
  for (let i = 0; i + 1 < mains.length; i++) {
    const from = mains[i]
    const to = mains[i + 1]
    if (!from || !to) continue
    edges.push({ id: `trail:${from.id}->${to.id}`, sources: [from.id], targets: [to.id] })
  }

  return { id: 'root', layoutOptions: { ...ELK_LAYOUT_OPTIONS }, children, edges }
}

// ---------------------------------------------------------------------------
// Trail dots
// ---------------------------------------------------------------------------

/** The 3 dots of a Trail_Segment at 28%, 50% and 72% from `a` to `b` (Req 6.1). */
export function trailDots(a: Point, b: Point): [Point, Point, Point] {
  const at = (t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  return [at(0.28), at(0.5), at(0.72)]
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

interface Interval { top: number; bottom: number }

function layoutFailed(message: string): Result<PathLayout, LayoutError> {
  return { ok: false, errors: { kind: 'layout_failed', message } }
}

/** Vertical footprint of a placed Node: its box, plus the label reserve below a side quest. */
function footprint(p: NodePlacement, cfg: LayoutConfig): Interval {
  const reserve = p.kind === 'side' ? cfg.sideLabelReserve : 0
  return { top: p.cy - p.size / 2, bottom: p.cy + p.size / 2 + reserve }
}

/**
 * Maps the elkjs result onto the winding trail (design "placePath" steps 1–5).
 * Takes `viewport` instead of a bare config because `PathLayout` records it;
 * `cfg` defaults to `LAYOUT_CONFIG[viewport]` and can be overridden in tests.
 */
export function placePath(
  tree: SkillTree,
  elkResult: ElkNode,
  viewport: ViewportClass,
  cfg: LayoutConfig = LAYOUT_CONFIG[viewport],
): Result<PathLayout, LayoutError> {
  const nodes = uniqueNodes(tree)
  const docIndex = new Map(nodes.map((node, i) => [node.id, i]))

  // Step 1: elkjs y per id, completeness and Main_Node order check.
  const elkY = new Map<string, number>()
  for (const child of elkResult.children ?? []) {
    if (typeof child.y === 'number' && Number.isFinite(child.y)) elkY.set(child.id, child.y)
  }
  const missing = nodes.find(node => !elkY.has(node.id))
  if (missing) return layoutFailed(`elkjs returned no position for node "${missing.id}"`)

  const byElkOrder = (a: SkillNode, b: SkillNode): number =>
    (elkY.get(a.id) ?? 0) - (elkY.get(b.id) ?? 0) || (docIndex.get(a.id) ?? 0) - (docIndex.get(b.id) ?? 0)

  const mains = nodes.filter(node => !node.optional)
  const mainOrder = mains.map(node => node.id)
  const sortedMains = [...mains].sort(byElkOrder)
  if (sortedMains.some((node, i) => node.id !== mainOrder[i])) {
    return layoutFailed('elkjs ordered the main path differently from the document order')
  }

  // Step 2: header bands and Main_Nodes, Section by Section.
  const placements: Record<string, NodePlacement> = {}
  const headers: HeaderPlacement[] = []
  const sectionBandBottom = new Map<string, number>()
  const seen = new Set<string>()
  let cursor = cfg.headerTop
  let mainIndex = 0
  tree.sections.forEach((section, sectionIndex) => {
    const top = cursor
    const bandBottom = top + cfg.headerHeight
    headers.push({ sectionIndex, top, height: cfg.headerHeight })
    let center = bandBottom + cfg.sectionLead
    let lastCenter: number | null = null
    for (const node of section.nodes) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      sectionBandBottom.set(node.id, bandBottom)
      if (node.optional) continue
      const kind = nodeKind(node)
      const offset = cfg.windingOffsets[mainIndex % 4] ?? 0
      placements[node.id] = { id: node.id, kind, cx: offset, cy: center, size: cfg.size[kind] }
      lastCenter = center
      center += cfg.rowGap
      mainIndex++
    }
    cursor = lastCenter === null ? bandBottom : lastCenter + cfg.sectionTail
  })

  // Step 3: Side_Quest_Nodes in elkjs (topological) order.
  const occupied: Interval[] = headers.map(h => ({ top: h.top, bottom: h.top + h.height }))
  const mainPosition = new Map(mainOrder.map((id, i) => [id, i]))
  const sides = nodes.filter(node => node.optional).sort(byElkOrder)
  for (const side of sides) {
    let anchor: NodePlacement | undefined
    for (const prerequisiteId of side.prerequisites) {
      const p = placements[prerequisiteId]
      if (!p) {
        if (docIndex.has(prerequisiteId)) {
          return layoutFailed(`elkjs placed side quest "${side.id}" before its prerequisite "${prerequisiteId}"`)
        }
        continue
      }
      const better = !anchor || p.cy > anchor.cy
        || (p.cy === anchor.cy && (docIndex.get(p.id) ?? 0) < (docIndex.get(anchor.id) ?? 0))
      if (better) anchor = p
    }

    let desired: number
    if (anchor) {
      const i = mainPosition.get(anchor.id)
      const nextId = i === undefined ? undefined : mainOrder[i + 1]
      const next = nextId === undefined ? undefined : placements[nextId]
      desired = next ? (anchor.cy + next.cy) / 2 : anchor.cy + cfg.rowGap / 2
    }
    else {
      desired = (sectionBandBottom.get(side.id) ?? cfg.headerTop + cfg.headerHeight) + cfg.sectionLead
    }

    const size = cfg.size.side
    const placement: NodePlacement = { id: side.id, kind: 'side', cx: cfg.sideX, cy: desired, size }
    const sorted = [...occupied].sort((a, b) => a.top - b.top || a.bottom - b.bottom)
    let moved = true
    while (moved) {
      moved = false
      for (const interval of sorted) {
        const f = footprint(placement, cfg)
        if (f.top < interval.bottom && interval.top < f.bottom) {
          placement.cy = interval.bottom + size / 2
          moved = true
        }
      }
    }
    placements[side.id] = placement
    const f = footprint(placement, cfg)
    occupied.push({ top: f.top - cfg.sideGap, bottom: f.bottom + cfg.sideGap })
  }

  // Step 4: total height.
  let lowest = 0
  for (const h of headers) lowest = Math.max(lowest, h.top + h.height)
  for (const p of Object.values(placements)) lowest = Math.max(lowest, footprint(p, cfg).bottom)
  const height = lowest + cfg.bottomPadding

  // Step 5: one Trail_Segment per (prerequisite, dependent) pair.
  const segments: TrailSegment[] = []
  for (const node of nodes) {
    const to = placements[node.id]
    if (!to) return layoutFailed(`no position for node "${node.id}"`)
    const linked = new Set<string>()
    for (const prerequisiteId of node.prerequisites) {
      const from = placements[prerequisiteId]
      if (!from || linked.has(prerequisiteId)) continue
      linked.add(prerequisiteId)
      segments.push({
        fromId: from.id,
        toId: to.id,
        dots: trailDots({ x: from.cx, y: from.cy }, { x: to.cx, y: to.cy }),
      })
    }
  }

  return {
    ok: true,
    value: {
      viewport,
      nodes: placements,
      mainOrder,
      headers,
      segments,
      height,
      dotDiameter: cfg.dotDiameter,
      ringPad: cfg.ringPad,
    },
  }
}

/**
 * Full Path_Layout: path order check, elkjs ordering, then placement.
 * Any throw (elkjs import, `layout()`, placement) becomes `layout_failed` (Req 5.12).
 */
export async function computePathLayout(
  tree: SkillTree,
  viewport: ViewportClass,
  elk: ElkLike,
): Promise<Result<PathLayout, LayoutError>> {
  const orderError = checkPathOrder(tree)
  if (orderError) return { ok: false, errors: orderError }
  try {
    const cfg = LAYOUT_CONFIG[viewport]
    const result = await elk.layout(buildElkGraph(tree, cfg))
    return placePath(tree, result, viewport, cfg)
  }
  catch (error) {
    return layoutFailed(error instanceof Error ? error.message : String(error))
  }
}
